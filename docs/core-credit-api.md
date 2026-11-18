# Core Credit — hướng dẫn demo của Tuyển

## Phạm vi

Mint điểm từ hóa đơn, chuyển toàn bộ Credit object, đọc số dư/lịch sử/object. Dùng Express hiện có, Prisma, PostgreSQL và SDK Sui gRPC. Không có queue, worker, MCP hay giao diện mới.

Contract Testnet đã publish và xác minh; các ID công khai nằm ở `blockchain/credit/deployment.testnet.json`. Bản deploy trước còn hoạt động nên không publish trùng.

## Khởi động

Chạy từ `backend-db/octapoint-backend-khanh`:

```powershell
npm.cmd install
npm.cmd run prisma:generate
```

Nếu chưa có `.env`, copy `.env.example` thành `.env`, điền DATABASE_URL và JWT_SECRET riêng. Không copy đè `.env` hiện có: môi trường hiện tại đã có cấu hình local ngẫu nhiên.

Đã tạo PostgreSQL local riêng tại cổng 55432, dữ liệu trong `.local/postgres`, không cài service toàn máy. Khi cần khởi động lại, mở một terminal và giữ lệnh này chạy:

```powershell
npm.cmd run db:local
```

Đây chỉ là tiện ích phát triển. Có thể dùng PostgreSQL hoặc Docker của nhóm thay thế bằng cách đổi DATABASE_URL. Không chạy hai database trên cùng cổng.

Ở terminal thứ hai:

```powershell
npm.cmd run db:deploy
npm.cmd run credit:demo
npm.cmd run dev
```

Migration đã được áp dụng trên database local mới. Với database cũ có bảng/dữ liệu, phối hợp Khánh kiểm tra baseline trước; không reset hay chạy migration khởi tạo trực tiếp lên database đó.

Demo có email `tuyen.demo@octapoint.local`, mật khẩu local `DemoPoints_12345!`. Script credit:demo in UUID merchant và hai khách hàng A/B, không in private key. Đăng nhập qua API auth hiện có để lấy JWT.

## API

Mọi API Credit yêu cầu `Authorization: Bearer <JWT>`. Merchant lấy từ tài khoản đã xác thực, không nhận merchantId từ body.

| Method | Endpoint | Chức năng |
|---|---|---|
| POST | /api/credits/mint | Cộng điểm theo hóa đơn |
| POST | /api/credits/transfer | Chuyển toàn bộ object |
| GET | /api/credits?customerId=UUID | Danh sách object, có page/limit |
| GET | /api/credits/requests/UUID | Trạng thái và digest của yêu cầu |

Mint body:

```json
{"customerId":"UUID_A","reference":"HD-001","amountVnd":250000}
```

Tỷ lệ mặc định EARN_VND_PER_POINT=10000; 250.000 VND được 25 điểm. Làm tròn xuống; hóa đơn tạo 0 điểm bị từ chối.

Transfer body:

```json
{"sourceCustomerId":"UUID_A","recipientCustomerId":"UUID_B","objectId":"0x...","reference":"TR-001"}
```

Reference bắt buộc, trim khoảng trắng, phân biệt hoa thường. Đây là mã chống trùng trong phạm vi merchant và loại giao dịch. Cùng reference khác nội dung bị từ chối. Transfer đọc lượng điểm từ object, không nhận điểm tùy ý từ client.

HTTP 201: xác nhận giao dịch mới; 200: đọc hoặc replay; 202: đang chờ xác minh/đối soát; 400: input sai; 401/403: xác thực/quyền; 404: không tìm thấy trong merchant; 409: xung đột; 503: cấu hình hoặc dịch vụ chưa sẵn sàng. Response có `data.requestId`, `status`, `txDigest` khi đã ghi nhận yêu cầu.

Số dư đọc qua GET /api/customers/:id; lịch sử qua GET /api/transactions. Bộ lọc lịch sử đã nhận thêm TRANSFER_IN/TRANSFER_OUT.

## Luồng xử lý ngắn

1. Kiểm tra JWT, merchant ACTIVE, khách hàng cùng merchant, chủ sở hữu object và dữ liệu.
2. Dùng một khóa PostgreSQL cho thao tác ghi Credit trong demo để tránh chạy đồng thời với cùng gas/object.
3. Bảng nhỏ CreditRequest giữ key, hash nội dung, giao dịch đã ký và trạng thái. Lưu signed bytes/digest trước khi gửi để timeout không tạo mint mới.
4. Khi Sui xác nhận thành công, cập nhật số dư, chủ sở hữu object, lịch sử và trạng thái CONFIRMED trong cùng một PostgreSQL transaction.
5. Nếu mất phản hồi, trả 202 PENDING. Gọi lại POST với CÙNG body/reference để tiếp tục; không đổi mã để thử lại. Yêu cầu khác của cùng merchant bị chặn khi còn signed request chờ đối soát.

Một mint tạo dòng EARN. Một transfer tạo hai dòng TRANSFER_OUT/TRANSFER_IN dùng chung digest. Các dòng này và số dư không được cập nhật hai lần khi replay.

## Ví và dữ liệu local

- Merchant demo dùng ví Sui CLI đã publish contract trên máy này; khóa giữ trong keystore, không đưa vào Git.
- Mỗi khách hàng demo có ví Ed25519 riêng; khóa nằm trong `.local/wallets.json`, đã gitignore.
- Merchant tài trợ gas trực tiếp cho transfer bằng chữ ký thứ hai; chưa dùng Enoki.
- Không xóa `.local`, đổi ví hoặc sửa MintCap khi còn giao dịch chờ. Sao lưu keys/database cùng nhau.
- Người khác clone repo không có private key của ví publish: cần dùng keystore được quản lý riêng hoặc tự deploy và cập nhật manifest. Không gửi khóa qua chat/Git.

## Kiểm thử

```powershell
npm.cmd run build
npm.cmd test -- --maxWorkers=1
npm.cmd run test:e2e
```

E2E sử dụng PostgreSQL thật và gas Testnet miễn phí: mint 25, mô phỏng mất phản hồi, retry cùng digest, kiểm tra chống trùng, sai chủ sở hữu/tenant, chuyển object và so sánh database với chain. Mỗi lần chạy tạo dữ liệu demo mới, không xóa dữ liệu cũ. Báo cáo lần gần nhất lưu `.local/e2e-result.json`.

Test cố ý thử điểm âm, object 0 điểm và hóa đơn trùng: Prisma có thể in lỗi constraint; các lỗi này là kết quả mong đợi nếu script kết thúc exit code 0 và in báo cáo passed.
## POST /api/transactions

Đã bổ sung route tạo giao dịch chung, dùng cùng service mint/transfer và cơ chế chống trùng. GET /api/transactions vẫn dùng để đọc lịch sử.

Header: Authorization: Bearer <JWT>, Content-Type: application/json.

Cộng điểm:

```json
{"type":"EARN","customerId":"UUID_A","reference":"HD-001","amountVnd":250000}
```

Chuyển toàn bộ object:

```json
{"type":"TRANSFER","sourceCustomerId":"UUID_A","recipientCustomerId":"UUID_B","objectId":"0x...","reference":"TR-001"}
```

TRANSFER là thao tác tạo cặp TRANSFER_OUT/TRANSFER_IN, không phải enum lưu trực tiếp trong Transaction. Chưa hỗ trợ tạo REDEEM/ADJUST bằng POST này. Không truyền points, merchantId hoặc txDigest từ client; backend xác định chúng. Cùng reference dùng qua /api/credits hay /api/transactions vẫn là cùng yêu cầu, không tạo thêm điểm.

Status: 201 xác nhận mới, 200 replay, 202 đang chờ; 400 body sai, 401 thiếu token, 403/404 sai quyền hoặc dữ liệu không thuộc merchant, 409 xung đột. Có hai request tương ứng trong CoreCredit Postman collection.
