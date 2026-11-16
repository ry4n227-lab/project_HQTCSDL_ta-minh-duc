# OctaPoint MCP Server (AI Agent Integration)

**Phụ trách:** Phạm Hữu Phước  
**Module:** OctaPoint MCP Server (octapoint-mcp-server)

## 1. Giới thiệu
Máy chủ Model Context Protocol (MCP) xây dựng bằng TypeScript SDK (@modelcontextprotocol/sdk), cung cấp các công cụ (Tools) chuẩn hóa giúp AI Agent và Chatbot CSKH truy vấn trực tiếp dữ liệu điểm thưởng và lịch sử giao dịch từ PostgreSQL thông qua OctaPoint Backend API.

## 2. Danh sách MCP Tools hỗ trợ
- get_balance: Truy vấn số dư điểm thưởng (points) và địa chỉ ví Sui (suiAddress) của khách hàng theo customerId hoặc từ khóa tìm kiếm (họ tên, email, số điện thoại).
- get_history: Tra cứu lịch sử giao dịch điểm thưởng (EARN, REDEEM, ADJUST) có phân trang và lọc theo khách hàng.

## 3. Cài đặt & Kiểm thử
Đảm bảo OctaPoint Backend đang chạy tại http://localhost:3000, sau đó mở Terminal tại thư mục octapoint-mcp-server và chạy:
- Cài đặt thư viện: npm install
- Biên dịch mã nguồn: npm run build
- Chạy kịch bản AI Agent kiểm thử MCP Tools: npm run test:mcp
