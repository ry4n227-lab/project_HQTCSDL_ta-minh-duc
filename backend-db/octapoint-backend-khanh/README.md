# OctaPoint — Backend & Database (Khánh)

Backend scope for the database course: merchant/admin authentication, merchant profile APIs, customer CRUD, and transaction-history reads. Blockchain and MCP integrations are intentionally out of scope.

## Stack
- Node.js + TypeScript + Express
- PostgreSQL + Prisma ORM
- JWT authentication, bcrypt password hashing, Zod request validation
- Docker Compose for local PostgreSQL

## Run locally
1. Install Node.js 20+ and Docker.
2. Copy `.env.example` to `.env`. Set `JWT_SECRET` to a random secret with at least 32 characters.
3. Start the database: `docker compose up -d`.
4. Install dependencies: `npm install`.
5. Generate Prisma client and migrate:
   ```bash
   npm run prisma:generate
   npm run db:migrate -- --name init
   ```
6. Optional demo admin:
   ```bash
   npm run db:seed
   ```
   Demo credentials: `admin@octapoint.local` / `ChangeMe_12345`. Use only locally and change before deployment.
7. Start API: `npm run dev`.

Health check: `GET http://localhost:3000/health`

## API
All endpoints except health and auth require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register merchant and its first user in one DB transaction |
| POST | `/api/auth/login` | Authenticate and return JWT |
| GET | `/api/merchants/me` | Get the authenticated merchant profile |
| PATCH | `/api/merchants/me` | Update merchant profile |
| GET | `/api/merchants` | ADMIN-only list of merchants |
| GET | `/api/customers?page=1&limit=20&q=` | List/search own merchant's customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/customers/:id` | Get own merchant's customer |
| PATCH | `/api/customers/:id` | Update own merchant's customer |
| DELETE | `/api/customers/:id` | Delete own merchant's customer |
| GET | `/api/transactions?page=1&limit=20` | Paginated transaction history |
| GET | `/api/transactions/:id` | Get one transaction from own merchant |

Transaction filters: `customerId`, `type=EARN|REDEEM|ADJUST`, `from`, `to` (ISO datetime with timezone).

## Data model and database decisions
- `Merchant` has many `User`, `Customer`, and `Transaction` records.
- Every customer and transaction is scoped by `merchantId` to isolate tenants.
- `User.email` and `Merchant.email` are unique; passwords are stored only as bcrypt hashes.
- Foreign keys enforce referential integrity. Deleting a merchant cascades to its customers/transactions; a customer with transaction history cannot be deleted (Restrict).
- Indexes target merchant status, customer lookup, and newest-first transaction history.
- Points and balances are integers to avoid floating-point accounting errors.

## Notes before production
- Registration intentionally creates a merchant plus its first MERCHANT user. ADMIN users should be provisioned by a trusted seed/admin process, not by public registration.
- Add rate limiting, email verification, audit logging, stricter CORS origins, and integration tests before production.
- Confirm transaction/points consistency with the core backend team before adding transaction writes.
- Never commit `.env` or production secrets.
