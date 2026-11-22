export interface OctaPointConfig {
  baseUrl?: string;
  accessToken?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MerchantProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  merchantId: string;
  externalRef: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  points: number;
  suiAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = "EARN" | "REDEEM" | "ADJUST" | "TRANSFER_IN" | "TRANSFER_OUT";

export interface TransactionRecord {
  id: string;
  merchantId: string;
  customerId: string;
  type: TransactionType;
  points: number;
  description: string | null;
  reference: string | null;
  txDigest: string | null;
  createdAt: string;
  customer?: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  };
}

export interface CreditObjectRecord {
  id: string;
  objectId: string;
  customerId: string;
  merchantId: string;
  points: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CreditRequestResponse {
  requestId: string;
  status: string;
  txDigest?: string | null;
  [key: string]: unknown;
}

export class OctaPointSDK {
  private baseUrl: string;
  private accessToken?: string;

  constructor(config: OctaPointConfig = {}) {
    this.baseUrl = (config.baseUrl || "http://localhost:3000").replace(/\/+$/, "");
    this.accessToken = config.accessToken;
  }

  public setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = payload?.message || payload?.error || `HTTP Error ${response.status}`;
      throw new Error(`[OctaPointSDK] ${msg}`);
    }

    return payload as T;
  }

  // 1. Kiểm tra trạng thái Server
  async healthCheck() {
    return this.request<{ status: string; service: string }>("/health");
  }

  // 2. Đăng ký tài khoản Merchant mới
  async registerMerchant(input: {
    email: string;
    password: string;
    fullName: string;
    merchantName: string;
    phone?: string;
  }) {
    const res = await this.request<{ data: any }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.data;
  }

  // 3. Đăng nhập và tự động lưu Access Token vào SDK
  async login(email: string, password: string) {
    const res = await this.request<{
      data: {
        accessToken: string;
        tokenType: string;
        expiresIn: string;
        user: { id: string; email: string; fullName: string; role: string; merchantId: string | null };
      };
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.accessToken = res.data.accessToken;
    return res.data;
  }

  // 4. Lấy thông tin Merchant hiện tại
  async getMerchantProfile() {
    const res = await this.request<{ data: MerchantProfile }>("/api/merchants/me");
    return res.data;
  }

  // 5. Tạo khách hàng mới
  async createCustomer(input: {
    fullName: string;
    externalRef?: string;
    email?: string;
    phone?: string;
  }) {
    const res = await this.request<{ data: Customer }>("/api/customers", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.data;
  }

  // 6. Danh sách / Tìm kiếm khách hàng
  async listCustomers(params?: { page?: number; limit?: number; q?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.q) query.set("q", params.q);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.request<{ data: Customer[]; pagination: Pagination }>(`/api/customers${qs}`);
  }

  // 7. Lấy thông tin chi tiết 1 khách hàng
  async getCustomer(customerId: string) {
    const res = await this.request<{ data: Customer }>(`/api/customers/${customerId}`);
    return res.data;
  }

  // 8. Hàm tiện ích kiểm tra nhanh số dư điểm (get_balance)
  async getBalance(customerId: string) {
    const customer = await this.getCustomer(customerId);
    return {
      customerId: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      points: customer.points,
      suiAddress: customer.suiAddress,
      updatedAt: customer.updatedAt,
    };
  }

  // 9. Tra cứu lịch sử giao dịch điểm (get_history - hỗ trợ cả TRANSFER_IN / TRANSFER_OUT)
  async getHistory(params?: {
    page?: number;
    limit?: number;
    customerId?: string;
    type?: TransactionType;
    from?: string;
    to?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.customerId) query.set("customerId", params.customerId);
    if (params?.type) query.set("type", params.type);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.request<{ data: TransactionRecord[]; pagination: Pagination }>(`/api/transactions${qs}`);
  }

  // 10. Mint điểm theo hóa đơn (Core Credit API)
  async mintCredits(input: {
    customerId: string;
    reference: string;
    amountVnd: number;
  }) {
    const res = await this.request<{ data: CreditRequestResponse }>("/api/credits/mint", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.data;
  }

  // 11. Chuyển toàn bộ Credit object giữa 2 khách hàng (Core Credit API)
  async transferCredits(input: {
    sourceCustomerId: string;
    recipientCustomerId: string;
    objectId: string;
    reference: string;
  }) {
    const res = await this.request<{ data: CreditRequestResponse }>("/api/credits/transfer", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.data;
  }

  // 12. Lấy danh sách Credit objects của một khách hàng
  async listCredits(params: { customerId: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    query.set("customerId", params.customerId);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    return this.request<{ data: CreditObjectRecord[]; pagination?: Pagination }>(
      `/api/credits?${query.toString()}`
    );
  }

  // 13. Kiểm tra trạng thái và txDigest của một yêu cầu Credit
  async getCreditRequest(requestId: string) {
    const res = await this.request<{ data: CreditRequestResponse }>(
      `/api/credits/requests/${requestId}`
    );
    return res.data;
  }

  // 14. Tạo giao dịch chung (EARN hoặc TRANSFER) qua POST /api/transactions
  async createTransaction(
    input:
      | { type: "EARN"; customerId: string; reference: string; amountVnd: number }
      | {
          type: "TRANSFER";
          sourceCustomerId: string;
          recipientCustomerId: string;
          objectId: string;
          reference: string;
        }
  ) {
    const res = await this.request<{ data: CreditRequestResponse }>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.data;
  }
}
