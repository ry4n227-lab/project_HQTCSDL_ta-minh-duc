import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { setupDemo } from "./credit-demo";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { closeCreditPool } from "../src/credit/service";
import { readCredit, SignedTx } from "../src/credit/sui";

async function main() {
  const demo = await setupDemo();
  let server: Server | undefined;
  const checks: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => { server = app.listen(0, "127.0.0.1", e => e ? reject(e) : resolve()); });
    const base = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
    let token = "";
    async function call(path: string, body?: unknown, auth = true) {
      const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, body: await r.json() as any };
    }
    const login = await call("/api/auth/login", { email: demo.email, password: demo.password }, false);
    assert.equal(login.status, 200); token = login.body.data.accessToken;
    assert.equal((await call(`/api/credits?customerId=${demo.source.id}`, undefined, false)).status, 401); checks.push("JWT required");
    const nonce = Date.now().toString();
    const beforeA = demo.source.points, beforeB = demo.recipient.points;
    const input = { customerId: demo.source.id, reference: `HD-${nonce}`, amountVnd: 250000 };
    // Fault injection ONLY in this test: chain executes, but its response is lost.
    const chain = require("../src/credit/sui") as typeof import("../src/credit/sui");
    const originalExecute = chain.network.execute;
    chain.network.execute = async (saved: SignedTx) => { const result = await originalExecute(saved); assert(result, "Testnet execution did not confirm"); return null; };
    let pending;
    try { pending = await call("/api/credits/mint", input); }
    finally { chain.network.execute = originalExecute; }
    assert.equal(pending.status, 202); assert.equal(pending.body.data.status, "PENDING");
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: demo.source.id } })).points, beforeA);
    const waiting = await call(`/api/credits/requests/${pending.body.data.requestId}`);
    assert.equal(waiting.body.data.status, "PENDING");
    assert(!("signedTx" in waiting.body.data)); checks.push("Lost response keeps PENDING and does not update balance prematurely");
    const resumed = await call("/api/credits/mint", input);
    assert.equal(resumed.status, 201); assert.equal(resumed.body.data.status, "CONFIRMED");
    assert.equal(resumed.body.data.txDigest, pending.body.data.txDigest); checks.push("Retry reuses identical transaction digest after lost response");
    const objectId = resumed.body.data.objectId;
    const repeat = await call("/api/credits/mint", input);
    assert.equal(repeat.status, 200); assert.equal(repeat.body.data.replayed, true);
    assert.equal((await call("/api/credits/mint", { ...input, amountVnd: 260000 })).status, 409);
    assert.equal(await prisma.transaction.count({ where: { merchantId: demo.merchantId, reference: input.reference, type: "EARN" } }), 1); checks.push("Duplicate and changed invoices cannot mint twice");
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: demo.source.id } })).points, beforeA + 25);
    const objects = await call(`/api/credits?customerId=${demo.source.id}`);
    assert(objects.body.data.some((o: any) => o.objectId === objectId)); checks.push("Mint creates PostgreSQL balance, object and hash");
    const bad = await call("/api/credits/transfer", { sourceCustomerId: demo.recipient.id, recipientCustomerId: demo.source.id, objectId, reference: `BAD-${nonce}` });
    assert.equal(bad.status, 404); checks.push("Wrong object owner rejected");
    const other = await call("/api/auth/register", { email: `other-${nonce}@octapoint.local`, password: "OtherDemo_12345", fullName: "Other", merchantName: "Other" }, false);
    assert.equal(other.status, 201);
    const otherCustomer = await prisma.customer.create({ data: { merchantId: other.body.data.merchantId, fullName: "Other customer" } });
    assert.equal((await call(`/api/credits?customerId=${otherCustomer.id}`)).status, 404);
    assert.equal((await call("/api/credits/transfer", { sourceCustomerId: demo.source.id, recipientCustomerId: otherCustomer.id, objectId, reference: `CROSS-${nonce}` })).status, 404); checks.push("Cross-merchant access rejected");
    // Full-node reads can briefly lag execution, so wait for the newly minted object.
    for (let n = 0; ; n++) {
      try { const c = await readCredit(objectId); assert.equal(c.owner, demo.source.suiAddress); break; }
      catch (e) { if (n >= 30) throw e; await new Promise(r => setTimeout(r, 500)); }
    }
    const transfer = { sourceCustomerId: demo.source.id, recipientCustomerId: demo.recipient.id, objectId, reference: `TR-${nonce}` };
    const moved = await call("/api/credits/transfer", transfer);
    assert.equal(moved.status, 201, JSON.stringify(moved.body));
    assert.equal(moved.body.data.status, "CONFIRMED");
    const duplicateTransfer = await call("/api/credits/transfer", transfer);
    assert.equal(duplicateTransfer.status, 200); assert.equal(duplicateTransfer.body.data.replayed, true);
    const a = await prisma.customer.findUniqueOrThrow({ where: { id: demo.source.id } });
    const b = await prisma.customer.findUniqueOrThrow({ where: { id: demo.recipient.id } });
    assert.equal(a.points, beforeA); assert.equal(b.points, beforeB + 25);
    const object = await prisma.creditObject.findUniqueOrThrow({ where: { objectId } });
    assert.equal(object.ownerCustomerId, b.id);
    const history = await call(`/api/transactions?type=TRANSFER_IN&customerId=${b.id}`);
    assert.equal(history.status, 200);
    assert(history.body.data.some((t: any) => t.txDigest === moved.body.data.txDigest));
    for (let n = 0; ; n++) {
      const chainObject = await readCredit(objectId);
      if (chainObject.owner === b.suiAddress) { assert.equal(chainObject.points, 25); break; }
      if (n >= 30) throw new Error("Full node ownership did not update");
      await new Promise(r => setTimeout(r, 500));
    }
    checks.push("Transfer and replay preserve balances, object ownership and ledger hashes");
    await assert.rejects(prisma.customer.update({ where: { id: a.id }, data: { points: -1 } }));
    await assert.rejects(prisma.creditObject.update({ where: { objectId }, data: { points: 0 } }));
    await assert.rejects(prisma.transaction.create({ data: { merchantId: demo.merchantId, customerId: a.id, type: "EARN", points: 1, reference: input.reference } }));
    checks.push("PostgreSQL CHECK and unique invoice constraints enforce integrity");
    const report = { passedAt: new Date().toISOString(), network: "testnet", checks, mintDigest: resumed.body.data.txDigest, transferDigest: moved.body.data.txDigest, objectId, customerA: a.id, customerB: b.id };
    await mkdir(".local", { recursive: true }); await writeFile(".local/e2e-result.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { if (server) await new Promise<void>(r => server!.close(() => r())); }
}
main().catch(e => { console.error("Credit E2E failed:", e.message); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await closeCreditPool(); });
