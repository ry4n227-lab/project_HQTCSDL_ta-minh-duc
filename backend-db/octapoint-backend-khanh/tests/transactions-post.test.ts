import { afterAll, beforeAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";

vi.mock("../src/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("../src/credit/service", () => ({ processCredit: vi.fn() }));
import { prisma } from "../src/db";
import { processCredit } from "../src/credit/service";
import { CreditError } from "../src/credit/sui";
import { transactionsRouter } from "../src/routes/transactions";

let server: Server, url: string, token: string;
const previousSecret = process.env.JWT_SECRET;
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  process.env.JWT_SECRET = "test-only-transactions-route-secret";
  token = jwt.sign({ role: "MERCHANT", merchantId: "forged-tenant" }, process.env.JWT_SECRET, { subject: "user" });
  const app = express(); app.use(express.json()); app.use("/api/transactions", transactionsRouter);
  await new Promise<void>((resolve, reject) => { server = app.listen(0, "127.0.0.1", e => e ? reject(e) : resolve()); });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/transactions`;
});
afterAll(async () => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user", role: "MERCHANT", merchantId: "actual-merchant", isActive: true } as any);
  vi.mocked(processCredit).mockResolvedValue({ status: "CONFIRMED", replayed: false } as any);
});
const post = (body: object, auth = true) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
it("requires JWT", async () => { expect((await post({}, false)).status).toBe(401); expect(processCredit).not.toHaveBeenCalled(); });
it("maps EARN to mint and uses the merchant from the current user", async () => {
  expect((await post({ type: "EARN", customerId: a, reference: " HD1 ", amountVnd: 250000 })).status).toBe(201);
  expect(processCredit).toHaveBeenCalledWith("actual-merchant", { kind: "mint", customerId: a, reference: "HD1", amountVnd: 250000 });
});
it("maps TRANSFER to whole-object transfer", async () => {
  expect((await post({ type: "TRANSFER", sourceCustomerId: a, recipientCustomerId: b, objectId: "0x1", reference: "TR1" })).status).toBe(201);
  expect(processCredit).toHaveBeenCalledWith("actual-merchant", expect.objectContaining({ kind: "transfer", objectId: "0x" + "1".padStart(64, "0") }));
});
it("rejects unsupported ledger types and forged points/hash", async () => {
  expect((await post({ type: "ADJUST", customerId: a, points: 100 })).status).toBe(400);
  expect((await post({ type: "EARN", customerId: a, reference: "HD1", amountVnd: 250000, txDigest: "fake" })).status).toBe(400);
  expect(processCredit).not.toHaveBeenCalled();
});
it("preserves replay and pending response codes", async () => {
  vi.mocked(processCredit).mockResolvedValueOnce({ status: "CONFIRMED", replayed: true } as any);
  expect((await post({ type: "EARN", customerId: a, reference: "HD1", amountVnd: 250000 })).status).toBe(200);
  vi.mocked(processCredit).mockResolvedValueOnce({ status: "PENDING", replayed: false } as any);
  expect((await post({ type: "EARN", customerId: a, reference: "HD1", amountVnd: 250000 })).status).toBe(202);
});
it("preserves service authorization/conflict errors", async () => {
  vi.mocked(processCredit).mockRejectedValueOnce(new CreditError(404, "Customer not found in your merchant"));
  expect((await post({ type: "EARN", customerId: a, reference: "HD1", amountVnd: 250000 })).status).toBe(404);
});
