import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(150),
  merchantName: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(30).optional()
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    const { email, password, fullName, merchantName, phone } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) return res.status(409).json({ error: "EMAIL_EXISTS", message: "Email đã được sử dụng." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: { name: merchantName, email: normalizedEmail, phone }
      });
      return tx.user.create({
        data: { email: normalizedEmail, passwordHash, fullName, role: "MERCHANT", merchantId: merchant.id },
        select: { id: true, email: true, fullName: true, role: true, merchantId: true, createdAt: true }
      });
    });
    return res.status(201).json({ data: user });
  } catch (error) { next(error); }
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72)
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Email hoặc mật khẩu không đúng." });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");
    const token = jwt.sign(
      { role: user.role, merchantId: user.merchantId },
      secret,
      { subject: user.id, expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as jwt.SignOptions["expiresIn"] }
    );
    return res.json({
      data: {
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, merchantId: user.merchantId }
      }
    });
  } catch (error) { next(error); }
});
