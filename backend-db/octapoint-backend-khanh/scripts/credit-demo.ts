import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db";
import { deployment, newWallet, sdk, normalize } from "../src/credit/sui";
import { closeCreditPool, withCreditLock } from "../src/credit/service";

export async function setupDemo() {
  return withCreditLock(async () => {
    const d = deployment();
    const { client, bcs } = await sdk();
    const { object } = await client.getObject({ objectId: d.demoMintCapId, include: { content: true } });
    if (object.type !== `${d.packageId}::credit::MintCap`) throw new Error("MintCap type mismatch");
    const cap = bcs.struct("MintCap", { id: bcs.Address, issuer: bcs.Address }).parse(object.content);
    if (normalize(cap.issuer) !== d.publisher) throw new Error("MintCap issuer mismatch");
    const email = "tuyen.demo@octapoint.local";
    const password = "DemoPoints_12345!"; // Public local demo credential only.
    const merchant = await prisma.merchant.upsert({ where: { email }, update: {}, create: { name: "OctaPoint Credit Demo", email, suiMintCapId: d.demoMintCapId, suiSignerAddress: d.publisher } });
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.merchantId !== merchant.id) throw new Error("Demo email belongs to another merchant");
    if (!existingUser) await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), fullName: "Tuyển Demo", merchantId: merchant.id } });
    const customers = [];
    for (const [ref, name] of [["credit-demo-a", "Khách hàng A"], ["credit-demo-b", "Khách hàng B"]]) {
      let c = await prisma.customer.upsert({ where: { merchantId_externalRef: { merchantId: merchant.id, externalRef: ref } }, update: {}, create: { merchantId: merchant.id, externalRef: ref, fullName: name } });
      if (!c.suiAddress) c = await prisma.customer.update({ where: { id: c.id }, data: { suiAddress: await newWallet() } });
      customers.push(c);
    }
    return { merchantId: merchant.id, email, password, source: customers[0], recipient: customers[1] };
  });
}
if (require.main === module) setupDemo().then(d => console.log(JSON.stringify({ merchantId: d.merchantId, email: d.email, customerA: d.source.id, customerB: d.recipient.id }, null, 2)))
  .catch(() => { console.error("Demo setup failed. Check PostgreSQL, deployment and local Sui keystore."); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await closeCreditPool(); });
