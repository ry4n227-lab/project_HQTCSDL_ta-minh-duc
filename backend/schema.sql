CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone VARCHAR(10) NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
  reference VARCHAR(100) NOT NULL,
  amount_vnd BIGINT,
  points INTEGER NOT NULL CHECK (points > 0),
  value_vnd BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, reference)
);
CREATE INDEX IF NOT EXISTS transactions_customer_idx ON transactions(customer_id, id DESC);
