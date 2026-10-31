import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authenticate, allowRoles } from "../middleware/auth";

export const merchantsRouter = Router();
merchantsRouter.use(authenticate);

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
}).refine((v) => Object.keys(v).length > 0, "Cần ít nhất một trường cập nhật");

merchantsRouter.get("/me", async (req, res, next) => {
  try {
    if (!req.auth?.merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const merchant = await prisma.merchant.findUnique({
      where: { id: req.auth.merchantId },
      select: { id: true, name: true, email: true, phone: true, address: true, status: true, createdAt: true, updatedAt: true }
    });
    if (!merchant) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ data: merchant });
  } catch (error) { next(error); }
});

merchantsRouter.patch("/me", async (req, res, next) => {
  try {
    if (!req.auth?.merchantId) return res.status(403).json({ error: "NO_MERCHANT" });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    // Merchant accounts may update profile fields, but only ADMIN can change status.
    if (req.auth.role !== "ADMIN" && parsed.data.status !== undefined) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Chỉ ADMIN được đổi trạng thái merchant." });
    }
    const { status, ...profile } = parsed.data;
    const data = req.auth.role === "ADMIN" ? parsed.data : profile;
    const merchant = await prisma.merchant.update({
      where: { id: req.auth.merchantId },
      data,
      select: { id: true, name: true, email: true, phone: true, address: true, status: true, updatedAt: true }
    });
    return res.json({ data: merchant });
  } catch (error) { next(error); }
});

merchantsRouter.get("/", allowRoles("ADMIN"), async (_req, res, next) => {
  try {
    const merchants = await prisma.merchant.findMany({
      select: { id: true, name: true, email: true, phone: true, address: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ data: merchants });
  } catch (error) { next(error); }
});
