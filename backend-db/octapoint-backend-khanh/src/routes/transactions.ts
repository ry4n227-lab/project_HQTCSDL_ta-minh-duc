import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authenticate } from "../middleware/auth";
import { processCredit } from "../credit/service";
import { CreditError } from "../credit/sui";
import { mintSchema, transferSchema } from "./credits";

export const transactionsRouter = Router();
transactionsRouter.use(authenticate);

const createSchema = z.discriminatedUnion("type", [
  mintSchema.extend({ type: z.literal("EARN") }),
  transferSchema.extend({ type: z.literal("TRANSFER") }),
]);

// Reuse the Credit service; never insert a standalone ledger row or trust points/hash from a client.
transactionsRouter.post("/", async (req, res) => {
  const merchantId = req.auth?.merchantId;
  if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  try {
    const body = parsed.data;
    const input = body.type === "EARN"
      ? { kind: "mint" as const, customerId: body.customerId, reference: body.reference, amountVnd: body.amountVnd }
      : { kind: "transfer" as const, sourceCustomerId: body.sourceCustomerId, recipientCustomerId: body.recipientCustomerId, reference: body.reference, objectId: body.objectId };
    const data = await processCredit(merchantId, input);
    return res.status((data as any).status === "PENDING" ? 202 : (data as any).replayed ? 200 : 201).json({ data });
  } catch (error) {
    if (error instanceof CreditError) return res.status(error.status).json({ error: "CREDIT_ERROR", message: error.message });
    return res.status(503).json({ error: "CREDIT_UNAVAILABLE", message: "Check configuration and retry the same reference; do not change reference on timeout." });
  }
});

transactionsRouter.get("/", async (req, res, next) => {
  try {
    const merchantId = req.auth?.merchantId;
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20));
    const querySchema = z.object({
      customerId: z.string().uuid().optional(),
      type: z.enum(["EARN", "REDEEM", "ADJUST", "TRANSFER_IN", "TRANSFER_OUT"]).optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional()
    });
    const parsed = querySchema.safeParse({
      customerId: req.query.customerId || undefined,
      type: req.query.type || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined
    });
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    const { customerId, type, from, to } = parsed.data;
    if (from && to && new Date(from) > new Date(to)) {
  return res.status(400).json({
    error: "INVALID_DATE_RANGE",
    message: "Ngày bắt đầu không được lớn hơn ngày kết thúc."
  });
}
    const where: any = { merchantId, ...(customerId ? { customerId } : {}), ...(type ? { type } : {}) };
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { customer: { select: { id: true, fullName: true, email: true, phone: true } } }
      }),
      prisma.transaction.count({ where })
    ]);
    return res.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

transactionsRouter.get("/:id", async (req, res, next) => {
  try {
    const merchantId = req.auth?.merchantId;
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const item = await prisma.transaction.findFirst({
      where: { id: req.params.id, merchantId },
      include: { customer: { select: { id: true, fullName: true } } }
    });
    if (!item) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ data: item });
  } catch (error) { next(error); }
});
