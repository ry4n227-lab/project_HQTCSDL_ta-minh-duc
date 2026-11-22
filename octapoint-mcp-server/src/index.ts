import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE_URL = (process.env.OCTAPOINT_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const MERCHANT_EMAIL = process.env.OCTAPOINT_MERCHANT_EMAIL || "merchant@example.com";
const MERCHANT_PASSWORD = process.env.OCTAPOINT_MERCHANT_PASSWORD || "StrongPass_123";

let cachedAccessToken: string | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;

  const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MERCHANT_EMAIL, password: MERCHANT_PASSWORD }),
  });

  if (!loginRes.ok) {
    throw new Error(`Không thể đăng nhập vào OctaPoint Backend (HTTP ${loginRes.status})`);
  }

  const loginData = (await loginRes.json()) as { data: { accessToken: string } };
  cachedAccessToken = loginData.data.accessToken;
  return cachedAccessToken;
}

async function callBackendApi<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (payload as any)?.message || (payload as any)?.error || `HTTP ${res.status}`;
    throw new Error(`Lỗi từ OctaPoint API: ${msg}`);
  }
  return payload as T;
}

const server = new Server(
  {
    name: "octapoint-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_balance",
        description:
          "Truy vấn số dư điểm thưởng (points) và thông tin ví Sui của khách hàng từ PostgreSQL API. Có thể truyền customerId (UUID) hoặc query (tên, email, số điện thoại).",
        inputSchema: {
          type: "object",
          properties: {
            customerId: {
              type: "string",
              description: "ID (UUID) của khách hàng cần tra cứu số dư",
            },
            query: {
              type: "string",
              description: "Từ khóa tìm kiếm khách hàng (họ tên, email hoặc số điện thoại) nếu không có customerId",
            },
          },
        },
      },
      {
        name: "get_history",
        description:
          "Tra cứu lịch sử giao dịch điểm thưởng (EARN, REDEEM, ADJUST, TRANSFER_IN, TRANSFER_OUT) từ PostgreSQL API.",
        inputSchema: {
          type: "object",
          properties: {
            customerId: {
              type: "string",
              description: "Lọc lịch sử theo ID (UUID) của khách hàng (tùy chọn)",
            },
            type: {
              type: "string",
              enum: ["EARN", "REDEEM", "ADJUST", "TRANSFER_IN", "TRANSFER_OUT"],
              description:
                "Lọc theo loại giao dịch: EARN (cộng điểm), REDEEM (đổi điểm), ADJUST (điều chỉnh), TRANSFER_IN (nhận chuyển điểm), TRANSFER_OUT (chuyển điểm đi)",
            },
            page: {
              type: "number",
              description: "Số trang cần xem (mặc định: 1)",
            },
            limit: {
              type: "number",
              description: "Số lượng giao dịch tối đa trên 1 trang (mặc định: 10)",
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_balance") {
      const customerId = (args as any)?.customerId as string | undefined;
      const query = (args as any)?.query as string | undefined;

      if (customerId) {
        const res = await callBackendApi<{ data: any }>(`/api/customers/${customerId}`);
        const c = res.data;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  customerId: c.id,
                  fullName: c.fullName,
                  email: c.email,
                  phone: c.phone,
                  points: c.points,
                  suiAddress: c.suiAddress,
                  updatedAt: c.updatedAt,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const qs = query ? `?q=${encodeURIComponent(query)}&limit=5` : `?limit=5`;
      const listRes = await callBackendApi<{ data: any[] }>(`/api/customers${qs}`);

      if (!listRes.data || listRes.data.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: "Không tìm thấy khách hàng phù hợp." }, null, 2),
            },
          ],
        };
      }

      const balances = listRes.data.map((c) => ({
        customerId: c.id,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        points: c.points,
        suiAddress: c.suiAddress,
        updatedAt: c.updatedAt,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(balances.length === 1 ? balances[0] : balances, null, 2),
          },
        ],
      };
    }

    if (name === "get_history") {
      const customerId = (args as any)?.customerId as string | undefined;
      const type = (args as any)?.type as string | undefined;
      const page = Number((args as any)?.page || 1);
      const limit = Number((args as any)?.limit || 10);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (customerId) params.set("customerId", customerId);
      if (type) params.set("type", type);

      const historyRes = await callBackendApi<{ data: any[]; pagination: any }>(
        `/api/transactions?${params.toString()}`
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pagination: historyRes.pagination,
                transactions: historyRes.data,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Tool không tồn tại: ${name}`);
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Lỗi khi thực thi tool ${name}: ${error?.message || String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OctaPoint MCP Server đang chạy trên giao thức stdio...");
}

main().catch((error) => {
  console.error("Lỗi khởi động MCP Server:", error);
  process.exit(1);
});
