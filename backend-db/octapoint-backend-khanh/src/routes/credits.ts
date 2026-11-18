import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authenticate } from "../middleware/auth";
import { processCredit } from "../credit/service";
import { CreditError, normalize } from "../credit/sui";

export const creditsRouter = Router();
creditsRouter.use(authenticate);
const reference = z.string().trim().min(1).max(120);
export const mintSchema = z.object({ customerId: z.string().uuid(), reference, amountVnd: z.number().int().positive().max(1000000000000) }).strict();
export const transferSchema = z.object({ sourceCustomerId: z.string().uuid(), recipientCustomerId: z.string().uuid(), reference, objectId: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/).transform(normalize) }).strict();
creditsRouter.use((req, _res, next) => req.auth?.merchantId ? next() : next(new CreditError(403, "Merchant account required")));

creditsRouter.get("/", async (req, res, next) => {
  try {
    const q = z.object({ customerId: z.string().uuid(), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const merchantId = req.auth!.merchantId!;
    const customer = await prisma.customer.findFirst({ where: { id: q.customerId, merchantId } });
    if (!customer) throw new CreditError(404, "Customer not found");
    const where = { merchantId, ownerCustomerId: q.customerId };
    const [data, total] = await Promise.all([prisma.creditObject.findMany({ where, orderBy: { objectId: "asc" }, take: q.limit, skip: (q.page - 1) * q.limit }), prisma.creditObject.count({ where })]);
    res.json({ data, pagination: { page: q.page, limit: q.limit, total } });
  } catch (e) { next(e); }
});
creditsRouter.get("/requests/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const data = await prisma.creditRequest.findFirst({ where: { id, merchantId: req.auth!.merchantId! }, select: { id: true, status: true, txDigest: true, result: true } });
    if (!data) throw new CreditError(404, "Request not found");
    res.json({ data }); // Never return signed bytes/signatures or private keys.
  } catch (e) { next(e); }
});
for (const kind of ["mint", "transfer"] as const) {
  creditsRouter.post(`/${kind}`, async (req, res, next) => {
    try {
      const input = kind === "mint" ? { kind, ...mintSchema.parse(req.body) } : { kind, ...transferSchema.parse(req.body) };
      const data = await processCredit(req.auth!.merchantId!, input);
      res.status((data as any).status === "PENDING" ? 202 : (data as any).replayed ? 200 : 201).json({ data });
    } catch (e) { next(e); }
  });
}
creditsRouter.use((err: unknown, _req: any, res: any, _next: any) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: "VALIDATION_ERROR", details: err.flatten() });
  if (err instanceof CreditError) return res.status(err.status).json({ error: "CREDIT_ERROR", message: err.message });
  return res.status(503).json({ error: "CREDIT_UNAVAILABLE", message: "Check local database/wallet configuration and retry the same reference. No new reference on timeout." });
});
