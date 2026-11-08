-- Bật extension hỗ trợ tạo mã định danh duy nhất UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tạo các kiểu dữ liệu liệt kê (ENUM)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'MERCHANT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Bảng MERCHANTS (Lưu thông tin doanh nghiệp/cửa hàng đối tác)
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(30),
    address VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    sui_mint_cap_id VARCHAR(66) UNIQUE,
    sui_signer_address VARCHAR(66) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Bảng USERS (Lưu tài khoản đăng nhập của Admin và Chủ cửa hàng)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'MERCHANT',
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Bảng CUSTOMERS (Lưu khách hàng tích điểm của từng cửa hàng)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    external_ref VARCHAR(100),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(30),
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0), -- Ràng buộc: Số dư điểm không bao giờ được âm
    sui_address VARCHAR(66) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, merchant_id),
    UNIQUE (merchant_id, external_ref)
);

-- 5. Bảng TRANSACTIONS (Lưu lịch sử cộng/trừ/chuyển điểm)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    type transaction_type NOT NULL,
    points INTEGER NOT NULL,
    description VARCHAR(500),
    reference VARCHAR(120),
    tx_digest VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Khóa ngoại kép: Đảm bảo khách hàng và giao dịch phải thuộc cùng 1 cửa hàng
    FOREIGN KEY (customer_id, merchant_id) REFERENCES customers(id, merchant_id) ON DELETE RESTRICT,
    UNIQUE (tx_digest, customer_id, type)
);

-- 6. Bảng CREDIT_OBJECTS (Lưu các gói điểm trên Blockchain Sui)
CREATE TABLE IF NOT EXISTS credit_objects (
    object_id VARCHAR(66) PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    owner_customer_id UUID NOT NULL,
    points INTEGER NOT NULL CHECK (points > 0), -- Ràng buộc: Gói điểm phải lớn hơn 0
    FOREIGN KEY (owner_customer_id, merchant_id) REFERENCES customers(id, merchant_id) ON DELETE RESTRICT
);

-- 7. Tạo các CHỈ MỤC (INDEX) giúp tăng tốc độ truy vấn dữ liệu
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_users_merchant ON users(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_merchant_lookup ON customers(merchant_id, phone, email);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_history ON transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_history ON transactions(merchant_id, created_at DESC);

-- Ràng buộc chống cộng điểm trùng lặp cho cùng 1 mã hóa đơn (reference)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_earn_invoice_unique
    ON transactions(merchant_id, reference)
    WHERE type = 'EARN' AND reference IS NOT NULL;
