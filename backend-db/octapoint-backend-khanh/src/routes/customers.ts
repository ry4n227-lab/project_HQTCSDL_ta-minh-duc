import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authenticate } from "../middleware/auth";

export const customersRouter = Router();
customersRouter.use(authenticate);

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  externalRef: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().max(30).optional()
});
const updateSchema = createSchema.partial().refine(v => Object.keys(v).length > 0, "Cần ít nhất một trường cập nhật");

function tenantId(req: Parameters<typeof customersRouter.get>[1] extends never ? never : any) {
  return req.auth?.merchantId as string | undefined;
}

customersRouter.get("/", async (req, res, next) => {
  try {
    const merchantId = tenantId(req);
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20));
    const q = String(req.query.q || "").trim();
    const where: any = { merchantId };
    if (q) where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } }
    ];
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.customer.count({ where })
    ]);
    return res.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

customersRouter.post("/", async (req, res, next) => {
  try {
    const merchantId = tenantId(req);
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    const customer = await prisma.customer.create({ data: { ...parsed.data, merchantId } });
    return res.status(201).json({ data: customer });
  } catch (error) { next(error); }
});

customersRouter.get("/:id", async (req, res, next) => {
  try {
    const merchantId = tenantId(req);
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, merchantId } });
    if (!customer) return res.status(404).json({ error: "NOT_FOUND", message: "Không tìm thấy khách hàng." });
    return res.json({ data: customer });
  } catch (error) { next(error); }
});

customersRouter.patch("/:id", async (req, res, next) => {
  try {
    const merchantId = tenantId(req);
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, merchantId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    const customer = await prisma.customer.update({ where: { id: existing.id }, data: parsed.data });
    return res.json({ data: customer });
  } catch (error) { next(error); }
});

customersRouter.delete("/:id", async (req, res, next) => {
  try {
    const merchantId = tenantId(req);
    if (!merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, merchantId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    await prisma.customer.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (error) { next(error); }
});
