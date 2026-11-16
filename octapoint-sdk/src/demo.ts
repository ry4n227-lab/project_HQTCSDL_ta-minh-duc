import { OctaPointSDK } from "./index";

async function runDemo() {
  const sdk = new OctaPointSDK({ baseUrl: "http://localhost:3000" });

  console.log("=== 1. Kiểm tra kết nối Backend API ===");
  const health = await sdk.healthCheck();
  console.log("Health:", health);

  const demoEmail = "merchant@example.com";
  const demoPassword = "StrongPass_123";

  console.log("\n=== 2. Đăng ký / Đăng nhập Merchant ===");
  try {
    await sdk.registerMerchant({
      email: demoEmail,
      password: demoPassword,
      fullName: "Demo Merchant Owner",
      merchantName: "OctaPoint Coffee Store",
      phone: "0901234567",
    });
    console.log("Đã đăng ký mới tài khoản Merchant:", demoEmail);
  } catch (err: any) {
    console.log("Tài khoản Merchant đã tồn tại, tiến hành đăng nhập...");
  }

  const authData = await sdk.login(demoEmail, demoPassword);
  console.log("Đăng nhập thành công! Merchant ID:", authData.user.merchantId);

  console.log("\n=== 3. Lấy thông tin Merchant Profile ===");
  const merchant = await sdk.getMerchantProfile();
  console.log("Merchant:", merchant.name, "| Trạng thái:", merchant.status);

  console.log("\n=== 4. Tạo hoặc lấy Khách hàng mẫu ===");
  const existingList = await sdk.listCustomers({ q: "a@example.com" });
  let customer = existingList.data[0];

  if (!customer) {
    customer = await sdk.createCustomer({
      fullName: "Nguyen Van A",
      email: "a@example.com",
      phone: "0912345678",
      externalRef: "CRM-001",
    });
    console.log("Đã tạo khách hàng mới:", customer.id);
  } else {
    console.log("Tìm thấy khách hàng hiện có:", customer.id);
  }

  console.log("\n=== 5. Truy vấn số dư điểm bằng SDK (getBalance) ===");
  const balance = await sdk.getBalance(customer.id);
  console.log("Kết quả getBalance:", balance);

  console.log("\n=== 6. Truy vấn lịch sử giao dịch bằng SDK (getHistory) ===");
  const history = await sdk.getHistory({ customerId: customer.id, page: 1, limit: 10 });
  console.log("Tổng số giao dịch:", history.pagination.total);
  console.log("Danh sách giao dịch:", history.data);
}

runDemo().catch((err) => {
  console.error("Lỗi khi chạy SDK Demo:", err);
  process.exit(1);
});