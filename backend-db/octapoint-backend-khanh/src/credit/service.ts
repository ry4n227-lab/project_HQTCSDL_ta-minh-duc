import { createHash } from "node:crypto";
import { Pool } from "pg";
import { prisma } from "../db";
import { CreditError, network, normalize, parseEvent, prepare, readCredit, SignedTx } from "./sui";
import { Prisma } from "@prisma/client";

const lockPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
export const closeCreditPool = () => lockPool.end();
export const MAX_POINTS = 2147483647;
export function billPoints(amount: number) {
  const rate = Number(process.env.EARN_VND_PER_POINT || 10000);
  if (!Number.isSafeInteger(rate) || rate <= 0) throw new CreditError(503, "Invalid point rate");
  const points = Math.floor(amount / rate);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000000 || points < 1 || points > MAX_POINTS) throw new CreditError(400, "Bill must earn at least one point within limits");
  return points;
}
// One coarse PostgreSQL lock is sufficient for the small demo. No queue/worker.
// It also serializes gas sponsorship across backend processes and releases on crash.
export async function withCreditLock<T>(work: () => Promise<T>) {
  const db = await lockPool.connect();
  try {
    const { rows } = await db.query("SELECT pg_try_advisory_lock(831824) AS locked");
    if (!rows[0].locked) throw new CreditError(409, "Another credit request is processing; retry later");
    try { return await work(); }
    finally { await db.query("SELECT pg_advisory_unlock(831824)"); }
  } finally { db.release(); }
}
export type CreditInput = { kind: "mint"; customerId: string; reference: string; amountVnd: number } |
  { kind: "transfer"; sourceCustomerId: string; recipientCustomerId: string; objectId: string; reference: string };

export async function processCredit(merchantId: string, input: CreditInput) {
  return withCreditLock(async () => {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status !== "ACTIVE") throw new CreditError(403, "Merchant is not active");
    const recipientId = input.kind === "mint" ? input.customerId : input.recipientCustomerId;
    const recipient = await prisma.customer.findFirst({ where: { id: recipientId, merchantId } });
    if (!recipient) throw new CreditError(404, "Recipient not found in your merchant");
    const source = input.kind === "transfer" ? await prisma.customer.findFirst({ where: { id: input.sourceCustomerId, merchantId } }) : null;
    if (input.kind === "transfer" && !source) throw new CreditError(404, "Source customer not found in your merchant");
    if (source?.id === recipient.id) throw new CreditError(400, "Cannot transfer to yourself");
    const key = input.kind + ":" + input.reference;
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    let request = await prisma.creditRequest.findUnique({ where: { merchantId_key: { merchantId, key } } });
    if (request && request.requestHash !== fingerprint) throw new CreditError(409, "Reference already used with different content");
    if (request?.status === "CONFIRMED") return { ...request.result as object, replayed: true };
    if (request?.status === "FAILED") throw new CreditError(409, "This request failed on-chain; inspect its digest before creating a new request");
    const pending = await prisma.creditRequest.findFirst({ where: { merchantId, status: "PENDING", signedTx: { not: Prisma.DbNull }, ...(request ? { id: { not: request.id } } : {}) } });
    if (pending) throw new CreditError(409, "Reconcile the previous pending request before sending another credit transaction");
    if (!merchant.suiMintCapId || !merchant.suiSignerAddress || !recipient.suiAddress || (source && !source.suiAddress)) throw new CreditError(409, "Run credit:demo to configure wallets and MintCap first");
    // Preserve legacy invoice protection even when no CreditRequest exists.
    if (!request && input.kind === "mint" && await prisma.transaction.findFirst({ where: { merchantId, type: "EARN", reference: input.reference } })) throw new CreditError(409, "Invoice already earned points");
    if (!request?.signedTx) {
      let points = input.kind === "mint" ? billPoints(input.amountVnd) : 0;
      if (input.kind === "transfer") {
        const local = await prisma.creditObject.findFirst({ where: { objectId: input.objectId, merchantId, ownerCustomerId: source!.id } });
        if (!local) throw new CreditError(404, "Object does not belong to source customer");
        const chain = await readCredit(input.objectId);
        points = chain.points;
        if (chain.owner !== normalize(source!.suiAddress!) || chain.cap !== normalize(merchant.suiMintCapId) || points !== local.points || source!.points < points) throw new CreditError(409, "On-chain ownership or balance mismatch");
      }
      if (recipient.points + points > MAX_POINTS) throw new CreditError(409, "Recipient balance would overflow");
      const signed = await prepare(input.kind, { cap: normalize(merchant.suiMintCapId), issuer: normalize(merchant.suiSignerAddress), recipient: normalize(recipient.suiAddress), owner: source ? normalize(source.suiAddress!) : undefined, objectId: input.kind === "transfer" ? input.objectId : undefined, points });
      const saved = { signedTx: signed as unknown as Prisma.InputJsonValue, txDigest: signed.digest };
      request = request
        ? await prisma.creditRequest.update({ where: { id: request.id }, data: saved })
        : await prisma.creditRequest.create({ data: { merchantId, key, requestHash: fingerprint, ...saved } });
    }
    if (!request) throw new CreditError(503, "Request could not be saved");
    // Commit signed bytes BEFORE any broadcast; a timeout/restart reuses them.
    let tx;
    try { tx = await network.execute(request.signedTx as unknown as SignedTx); }
    catch (e) {
      if (e instanceof CreditError && e.status === 409) await prisma.creditRequest.update({ where: { id: request.id }, data: { status: "FAILED" } });
      throw e;
    }
    if (!tx) return { requestId: request.id, status: "PENDING", txDigest: request.txDigest, replayed: false };
    const event = await parseEvent(tx, input.kind);
    const points = Number(event.amount);
    if (normalize(event.merchant_id) !== normalize(merchant.suiMintCapId) || normalize(event.recipient) !== normalize(recipient.suiAddress) || points < 1 || points > MAX_POINTS || (input.kind === "transfer" && (normalize(event.credit_id) !== input.objectId || !("sender" in event) || normalize(String(event.sender)) !== normalize(source!.suiAddress!)))) throw new CreditError(503, "Confirmed event mismatch; reconcile using request digest");
    try {
      return await prisma.$transaction(async db => {
        const credit = await db.customer.updateMany({ where: { id: recipient.id, merchantId, points: { lte: MAX_POINTS - points } }, data: { points: { increment: points } } });
        if (credit.count !== 1) throw new Error("Balance overflow");
        if (source) {
          const debit = await db.customer.updateMany({ where: { id: source.id, merchantId, points: { gte: points } }, data: { points: { decrement: points } } });
          const moved = await db.creditObject.updateMany({ where: { objectId: normalize(event.credit_id), merchantId, ownerCustomerId: source.id, points }, data: { ownerCustomerId: recipient.id } });
          if (debit.count !== 1 || moved.count !== 1) throw new Error("Source projection mismatch");
          await db.transaction.create({ data: { merchantId, customerId: source.id, type: "TRANSFER_OUT", points, reference: input.reference, txDigest: tx.digest } });
        } else {
          await db.creditObject.create({ data: { objectId: normalize(event.credit_id), merchantId, ownerCustomerId: recipient.id, points } });
        }
        await db.transaction.create({ data: { merchantId, customerId: recipient.id, type: source ? "TRANSFER_IN" : "EARN", points, reference: input.reference, txDigest: tx.digest } });
        const result = { requestId: request.id, status: "CONFIRMED", txDigest: tx.digest, objectId: normalize(event.credit_id), points, replayed: false };
        await db.creditRequest.update({ where: { id: request.id }, data: { status: "CONFIRMED", result } });
        return result;
      });
    } catch { return { requestId: request.id, status: "PENDING", txDigest: tx.digest, message: "Chain confirmed; retry the SAME request to reconcile database", replayed: false }; }
  });
}
