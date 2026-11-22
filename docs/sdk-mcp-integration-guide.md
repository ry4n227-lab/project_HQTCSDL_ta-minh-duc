# OctaPoint SDK & MCP Server Integration Guide
**Phụ trách:** Phạm Hữu Phước  
**Module:** Developer SDK (`octapoint-sdk`) & AI MCP Server (`octapoint-mcp-server`)  
**Công nghệ:** Node.js, TypeScript, Model Context Protocol (`@modelcontextprotocol/sdk`), Fetch REST API, PostgreSQL (`pg`)

## 1. Mục tiêu module
- Cung cấp bộ thư viện **TypeScript Developer SDK (`octapoint-sdk`)** bọc sẵn các hàm gọi REST API (xác thực JWT, quản lý Merchant/Customer, tra cứu điểm/lịch sử và bộ Core Credit API) giúp hệ thống bên ngoài tích hợp nhanh với OctaPoint Backend.
- Cung cấp máy chủ **OctaPoint MCP Server (`octapoint-mcp-server`)** theo chuẩn Model Context Protocol (giao thức `stdio`), cho phép AI Agent truy vấn trực tiếp số dư điểm (`get_balance`) và lịch sử giao dịch (`get_history`) từ PostgreSQL thông qua Backend API.

## 2. Cấu trúc thư mục
- `octapoint-sdk/`:
  - `src/index.ts`: Lớp `OctaPointSDK` và các kiểu dữ liệu TypeScript (`Customer`, `TransactionRecord`, `CreditObjectRecord`, `CreditRequestResponse`).
  - `src/demo.ts`: Kịch bản kiểm thử luồng hoạt động End-to-End của SDK.
  - `src/seed-demo.ts`: Script nạp dữ liệu điểm (`150` điểm), ví Sui, `CreditObject` và 3 giao dịch mẫu (`EARN`, `REDEEM`, `TRANSFER_IN`) vào PostgreSQL để kiểm thử.
- `octapoint-mcp-server/`:
  - `src/index.ts`: Máy chủ MCP định nghĩa và xử lý 2 tools `get_balance` và `get_history`.
  - `src/test-mcp.ts`: Kịch bản đóng vai AI Agent (MCP Client) kết nối và gọi kiểm thử các tools của MCP Server.

## 3. Danh sách hàm SDK & MCP Tools

### 3.1. Developer SDK (`OctaPointSDK`)
| Phương thức | Endpoint Backend | Mô tả |
|---|---|---|
| `healthCheck()` | `GET /health` | Kiểm tra trạng thái hoạt động của Backend |
| `registerMerchant(input)` | `POST /api/auth/register` | Đăng ký Merchant và tài khoản quản trị |
| `login(email, password)` | `POST /api/auth/login` | Đăng nhập và tự động lưu JWT Bearer Token |
| `getMerchantProfile()` | `GET /api/merchants/me` | Lấy thông tin hồ sơ Merchant hiện tại |
| `createCustomer(input)` | `POST /api/customers` | Tạo mới khách hàng thuộc Merchant |
| `listCustomers(params)` | `GET /api/customers` | Tìm kiếm và phân trang danh sách khách hàng |
| `getCustomer(customerId)` | `GET /api/customers/:id` | Lấy chi tiết hồ sơ 1 khách hàng |
| `getBalance(customerId)` | `GET /api/customers/:id` | Lấy nhanh số dư `points` và địa chỉ ví `suiAddress` |
| `getHistory(params)` | `GET /api/transactions` | Tra cứu lịch sử giao dịch (`EARN`, `REDEEM`, `ADJUST`, `TRANSFER_IN`, `TRANSFER_OUT`) |
| `mintCredits(input)` | `POST /api/credits/mint` | Cộng điểm theo hóa đơn (Core Credit API) |
| `transferCredits(input)` | `POST /api/credits/transfer` | Chuyển toàn bộ Credit object giữa 2 khách hàng |
| `listCredits(params)` | `GET /api/credits` | Lấy danh sách Credit objects của khách hàng |
| `getCreditRequest(requestId)` | `GET /api/credits/requests/:id` | Kiểm tra trạng thái và `txDigest` của yêu cầu Credit |
| `createTransaction(input)` | `POST /api/transactions` | Tạo giao dịch chung (`EARN` hoặc `TRANSFER`) |

### 3.2. OctaPoint MCP Server Tools
| Tên Tool | Tham số đầu vào (`arguments`) | Kết quả trả về cho AI Agent |
|---|---|---|
| `get_balance` | `customerId` (UUID) hoặc `query` (tên, email, SĐT) | Thông tin khách hàng, số dư `points` và `suiAddress` |
| `get_history` | `customerId`, `type` (`EARN` / `REDEEM` / `ADJUST` / `TRANSFER_IN` / `TRANSFER_OUT`), `page`, `limit` | Danh sách giao dịch kèm mã hash `txDigest` và thông tin phân trang `pagination` |

## 4. Hướng dẫn chạy kiểm thử nhanh
Đảm bảo Backend đang chạy tại `http://localhost:3000` và PostgreSQL đã áp dụng migration `202611180001_credit_demo`.

```powershell
# 1. Cài đặt, chạy demo tạo dữ liệu nền và nạp điểm/giao dịch mẫu
cd octapoint-sdk
npm install
npm run demo
npm run seed:demo

# 2. Chạy lại SDK Demo để kiểm tra dữ liệu thật (150 điểm, 3 giao dịch)
npm run build
npm run demo

# 3. Chạy kiểm thử MCP Server với AI Client
cd ../octapoint-mcp-server
npm install
npm run build
npm run test:mcp
```

## 5. Kết quả kiểm thử (End-to-End Test Cases)
| ID | Nội dung kiểm thử | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| SDK-01 | Kiểm tra kết nối `healthCheck()`, đăng ký/đăng nhập `login()` | Nhận JWT Token hợp lệ từ Backend | Passed |
| SDK-02 | Gọi `getBalance(customerId)` sau khi chạy `seed:demo` | Trả về `points: 150` và `suiAddress` hợp lệ | Passed |
| SDK-03 | Gọi `getHistory({ customerId })` qua SDK | Trả về đủ 3 giao dịch (`TRANSFER_IN` 25, `REDEEM` 75, `EARN` 200) kèm `txDigest` | Passed |
| MCP-01 | AI Client kết nối MCP Server qua `stdio` và gọi `listTools()` | Nhận diện đủ 2 tools `get_balance` và `get_history` (hỗ trợ đủ 5 loại giao dịch) | Passed |
| MCP-02 | AI Client gọi `get_balance` với `query: "a@example.com"` | Trả về JSON hồ sơ `Nguyen Van A`, `points: 150` và `suiAddress` | Passed |
| MCP-03 | AI Client gọi `get_history` | Trả về JSON gồm `pagination.total: 3` và chi tiết 3 giao dịch mẫu | Passed |