import { Client } from "pg";
import crypto from "crypto";

const RAW_DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:octapoint@localhost:5433/octapoint";

async function seedDemoData() {
  const connectionString = RAW_DB_URL.split("?")[0];
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log("=== Bắt đầu nạp dữ liệu điểm, CreditObject & giao dịch mẫu vào PostgreSQL ===");

    const res = await client.query(
      'SELECT "id", "merchantId", "fullName" FROM "Customer" WHERE "email" = $1 LIMIT 1',
      ["a@example.com"]
    );

    if (res.rows.length === 0) {
      throw new Error("Chưa có khách hàng a@example.com. Hãy chạy npm.cmd run demo trước!");
    }

    const customer = res.rows[0];
    const demoSuiAddress =
      "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0001";
    const demoCreditObjectId =
      "0xaaaa22223333444455556666777788889999aaaabbbbccccddddeeeeffff0001";

    await client.query(
      'UPDATE "Customer" SET "points" = $1, "suiAddress" = $2, "updatedAt" = NOW() WHERE "id" = $3',
      [150, demoSuiAddress, customer.id]
    );
    console.log(`1. Đã cập nhật số dư cho ${customer.fullName}: 150 điểm & ví Sui.`);

    await client.query(
      `INSERT INTO "CreditObject" ("objectId", "merchantId", "ownerCustomerId", "points")
       VALUES ($1, $2, $3, 150)
       ON CONFLICT ("objectId") DO NOTHING`,
      [demoCreditObjectId, customer.merchantId, customer.id]
    );
    console.log("2. Đã nạp 1 CreditObject (150 điểm) cho khách hàng.");

    await client.query(
      `INSERT INTO "Transaction" ("id", "merchantId", "customerId", "type", "points", "description", "reference", "txDigest", "createdAt")
       VALUES ($1, $2, $3, 'EARN', 200, $4, 'HD-001', '0xSuiTxDigest_Earn_Demo_001', NOW() - INTERVAL '2 hours')
       ON CONFLICT ("txDigest", "customerId", "type") DO NOTHING`,
      [
        crypto.randomUUID(),
        customer.merchantId,
        customer.id,
        "Tích điểm hóa đơn mua cà phê #HD-001",
      ]
    );

    await client.query(
      `INSERT INTO "Transaction" ("id", "merchantId", "customerId", "type", "points", "description", "reference", "txDigest", "createdAt")
       VALUES ($1, $2, $3, 'REDEEM', 75, $4, 'REDEEM-001', '0xSuiTxDigest_Redeem_Demo_002', NOW() - INTERVAL '1 hour')
       ON CONFLICT ("txDigest", "customerId", "type") DO NOTHING`,
      [
        crypto.randomUUID(),
        customer.merchantId,
        customer.id,
        "Đổi voucher giảm giá 75 điểm",
      ]
    );

    await client.query(
      `INSERT INTO "Transaction" ("id", "merchantId", "customerId", "type", "points", "description", "reference", "txDigest", "createdAt")
       VALUES ($1, $2, $3, 'TRANSFER_IN', 25, $4, 'TR-001', '0xSuiTxDigest_TransferIn_Demo_003', NOW())
       ON CONFLICT ("txDigest", "customerId", "type") DO NOTHING`,
      [
        crypto.randomUUID(),
        customer.merchantId,
        customer.id,
        "Nhận chuyển điểm Credit object #TR-001",
      ]
    );

    console.log("3. Đã nạp 3 giao dịch mẫu (EARN 200, REDEEM 75, TRANSFER_IN 25) thành công!");
  } finally {
    await client.end();
  }
}

seedDemoData().catch((err) => {
  console.error("Lỗi khi nạp dữ liệu mẫu:", err);
  process.exit(1);
});
