import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

export class CreditError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const normalize = (value: string) => {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new CreditError(400, "Invalid Sui address/object ID");
  return "0x" + value.slice(2).toLowerCase().padStart(64, "0");
};
export const deployment = () => JSON.parse(require("node:fs").readFileSync(resolve("../../blockchain/credit/deployment.testnet.json"), "utf8").replace(/^\uFEFF/, "")) as { network: string; packageId: string; publisher: string; demoMintCapId: string };
export async function sdk() {
  const [{ SuiGrpcClient }, { Transaction }, { Ed25519Keypair }, { bcs }] = await Promise.all([
    import("@mysten/sui/grpc"), import("@mysten/sui/transactions"), import("@mysten/sui/keypairs/ed25519"), import("@mysten/sui/bcs"),
  ]);
  if (deployment().network !== "testnet") throw new CreditError(503, "Only Testnet is supported");
  return { client: new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" }), Transaction, Ed25519Keypair, bcs };
}
const walletFile = () => resolve(".local/wallets.json");
async function wallets(): Promise<Record<string, string>> {
  try { return JSON.parse(await readFile(walletFile(), "utf8")); }
  catch (e: any) { if (e.code === "ENOENT") return {}; throw e; }
}
export async function newWallet() {
  const { Ed25519Keypair } = await sdk();
  const key = Ed25519Keypair.generate();
  const data = await wallets(); data[key.toSuiAddress()] = key.getSecretKey();
  await mkdir(resolve(".local"), { recursive: true });
  await writeFile(walletFile(), JSON.stringify(data), { mode: 0o600 });
  return key.toSuiAddress();
}
async function signer(owner: string) {
  const { Ed25519Keypair } = await sdk();
  const target = normalize(owner);
  const stored = (await wallets())[target];
  if (stored) {
    const key = Ed25519Keypair.fromSecretKey(stored);
    if (key.toSuiAddress() === target) return key;
  }
  const keys: string[] = JSON.parse(await readFile(process.env.SUI_KEYSTORE_PATH || join(homedir(), ".sui/sui_config/sui.keystore"), "utf8"));
  for (const encoded of keys) {
    const raw = Buffer.from(encoded, "base64");
    if (raw[0] !== 0) continue;
    const key = Ed25519Keypair.fromSecretKey(raw.subarray(1));
    if (key.toSuiAddress() === target) return key;
  }
  throw new CreditError(503, "Signing wallet not available locally");
}
export interface SignedTx { bytes: string; signatures: string[]; digest: string }
export async function prepare(kind: "mint" | "transfer", input: { cap: string; issuer: string; recipient: string; owner?: string; objectId?: string; points?: number }): Promise<SignedTx> {
  const { Transaction, client } = await sdk();
  const tx = new Transaction();
  const sender = input.owner || input.issuer;
  tx.setSender(sender); tx.setGasOwner(input.issuer); tx.setGasBudget(50000000);
  tx.moveCall({ target: `${deployment().packageId}::credit::${kind === "mint" ? "mint" : "transfer_credit"}`, arguments: kind === "mint"
    ? [tx.object(input.cap), tx.pure.u64(input.points!), tx.pure.address(input.recipient)]
    : [tx.object(input.objectId!), tx.pure.id(input.cap), tx.pure.address(input.recipient)] });
  const bytes = await tx.build({ client });
  const signatures = [(await (await signer(sender)).signTransaction(bytes)).signature];
  if (sender !== input.issuer) signatures.push((await (await signer(input.issuer)).signTransaction(bytes)).signature);
  return { bytes: Buffer.from(bytes).toString("base64"), signatures, digest: await tx.getDigest() };
}
export async function execute(saved: SignedTx) {
  const { client } = await sdk();
  try {
    const result = await client.executeTransaction({ transaction: Buffer.from(saved.bytes, "base64"), signatures: saved.signatures, include: { events: true } });
    if (result.$kind === "FailedTransaction") throw new CreditError(409, "On-chain execution failed");
    return result.Transaction;
  } catch (e) {
    if (e instanceof CreditError) throw e;
    try {
      const result = await client.waitForTransaction({ digest: saved.digest, include: { events: true }, timeout: 10000 });
      if (result.$kind === "FailedTransaction") throw new CreditError(409, "On-chain execution failed");
      return result.Transaction;
    } catch (lookup) {
      if (lookup instanceof CreditError) throw lookup;
      return null; // Unknown outcome; API returns 202, never creates a new mint.
    }
  }
}
export async function readCredit(id: string) {
  const { client, bcs } = await sdk();
  const { object } = await client.getObject({ objectId: normalize(id), include: { content: true } });
  if (object.type !== `${deployment().packageId}::credit::Credit`) throw new CreditError(409, "Wrong object type");
  const data = bcs.struct("Credit", { id: bcs.Address, merchant_id: bcs.Address, amount: bcs.u64(), owner: bcs.Address }).parse(object.content);
  return { objectId: normalize(data.id), cap: normalize(data.merchant_id), owner: normalize(data.owner), points: Number(data.amount) };
}
export async function parseEvent(tx: NonNullable<Awaited<ReturnType<typeof execute>>>, kind: "mint" | "transfer") {
  const { bcs } = await sdk();
  const name = kind === "mint" ? "CreditMinted" : "CreditTransferred";
  const event = tx.events.find(e => e.eventType === `${deployment().packageId}::credit::${name}`);
  if (!event) throw new CreditError(503, "Expected event missing; retry same request for reconciliation");
  if (kind === "mint") return bcs.struct(name, { credit_id: bcs.Address, merchant_id: bcs.Address, amount: bcs.u64(), recipient: bcs.Address }).parse(event.bcs);
  return bcs.struct(name, { credit_id: bcs.Address, merchant_id: bcs.Address, amount: bcs.u64(), sender: bcs.Address, recipient: bcs.Address }).parse(event.bcs);
}

// Small test seam: E2E can simulate a lost response after real execution.
export const network = { execute };
