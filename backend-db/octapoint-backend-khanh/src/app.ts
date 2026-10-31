import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./routes/auth";
import { merchantsRouter } from "./routes/merchants";
import { customersRouter } from "./routes/customers";
import { transactionsRouter } from "./routes/transactions";

export const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "octapoint-backend" }));
app.use("/api/auth", authRouter);
app.use("/api/merchants", merchantsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/transactions", transactionsRouter);

app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND", message: "Endpoint không tồn tại." }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === "P2002") return res.status(409).json({ error: "CONFLICT", message: "Dữ liệu bị trùng." });
  if (err?.code === "P2025") return res.status(404).json({ error: "NOT_FOUND" });
  console.error(err);
  return res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: process.env.NODE_ENV === "production" ? "Có lỗi hệ thống." : (err?.message || "Unknown error")
  });
});
