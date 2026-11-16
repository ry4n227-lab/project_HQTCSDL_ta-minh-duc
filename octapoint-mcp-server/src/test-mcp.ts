import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runMcpTest() {
  console.log("=== 1. Khởi tạo AI Agent (MCP Client) kết nối vào OctaPoint MCP Server ===");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
  });

  const client = new Client(
    {
      name: "octapoint-ai-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  console.log("Đã kết nối thành công với OctaPoint MCP Server!\n");

  console.log("=== 2. Kiểm tra danh sách Tools mà MCP Server cung cấp cho AI ===");
  const toolsList = await client.listTools();
  console.log(
    "Các Tools tìm thấy:\n" +
      toolsList.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")
  );

  console.log("\n=== 3. AI gọi Tool 'get_balance' (Tìm số dư của khách hàng a@example.com) ===");
  const balanceResult = await client.callTool({
    name: "get_balance",
    arguments: { query: "a@example.com" },
  });
  console.log("Kết quả trả về từ get_balance:");
  console.log((balanceResult.content as any)[0]?.text);

  console.log("\n=== 4. AI gọi Tool 'get_history' (Tra cứu lịch sử giao dịch) ===");
  const historyResult = await client.callTool({
    name: "get_history",
    arguments: { page: 1, limit: 5 },
  });
  console.log("Kết quả trả về từ get_history:");
  console.log((historyResult.content as any)[0]?.text);

  await client.close();
  console.log("\n=== Kiểm thử hoàn tất thành công! ===");
}

runMcpTest().catch((err) => {
  console.error("Lỗi khi kiểm thử MCP Server:", err);
  process.exit(1);
});
