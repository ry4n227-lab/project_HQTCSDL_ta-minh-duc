import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

type TokenPayload = { sub: string; role: "ADMIN" | "MERCHANT"; merchantId: string | null };

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Thiếu Bearer token." });
  }
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");
    const payload = jwt.verify(header.slice(7), secret) as jwt.JwtPayload & TokenPayload;
    if (!payload.sub || !payload.role) throw new Error("Invalid token");
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, merchantId: true, isActive: true }
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Tài khoản không tồn tại hoặc đã bị khóa." });
    }
    req.auth = { userId: user.id, role: user.role, merchantId: user.merchantId };
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Token không hợp lệ hoặc đã hết hạn." });
  }
}

export function allowRoles(...roles: Array<"ADMIN" | "MERCHANT">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này." });
    }
    next();
  };
}
