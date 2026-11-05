import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@octapoint.local";
  const passwordHash = await bcrypt.hash("ChangeMe_12345", 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName: "OctaPoint Admin", role: "ADMIN" }
  });
  console.log("Seeded admin:", email, "(change the demo password before any shared deployment)");
}
main().finally(() => prisma.$disconnect());
