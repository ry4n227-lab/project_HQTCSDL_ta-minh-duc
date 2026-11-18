# Kết quả kiểm thử Core Credit

## 1. Kết quả tổng hợp

- Build TypeScript: thành công.
- Migration PostgreSQL local: đã áp dụng, schema up to date.
- Kiểm thử Move: 9/9 test đạt.
- Kiểm thử backend: 13/13 test đạt, gồm 7 test Credit và 6 test POST transactions.
- Kiểm thử đầu cuối: API, PostgreSQL thật và Sui Testnet chạy thành công.

## 2. Các chức năng đã kiểm tra

- API yêu cầu JWT; thiếu token bị từ chối.
- Mint từ hóa đơn 250.000 VND tạo gói 25 điểm.
- Số dư, Credit object và hash giao dịch được lưu đúng trong PostgreSQL.
- Gửi lại cùng hóa đơn không cộng thêm điểm.
- Cùng mã hóa đơn nhưng khác nội dung bị từ chối.
- Chuyển toàn bộ object từ khách hàng A sang B thành công.
- Gửi lại yêu cầu chuyển không trừ hoặc cộng điểm lần nữa.
- Người gửi không sở hữu object bị từ chối.
- Truy cập hoặc chuyển điểm cho khách hàng khác merchant bị từ chối.
- Số dư, chủ sở hữu object và lịch sử trong database khớp kết quả blockchain.
- PostgreSQL từ chối số dư âm, object có 0 điểm và hóa đơn EARN trùng.

## 3. Kiểm thử mất phản hồi

Giao dịch mint thực sự chạy trên Testnet. Bài kiểm thử sau đó mô phỏng mất phản hồi bằng cách không trả kết quả thực thi cho service.

- API trả HTTP 202 với trạng thái PENDING.
- Số dư chưa được cập nhật trước khi xác nhận kết quả.
- Gọi lại cùng yêu cầu sử dụng đúng giao dịch đã ký và cùng digest.
- Sau khi xác nhận, database được cập nhật một lần.

## 4. Bằng chứng Testnet

Thời điểm E2E hoàn tất: 18/11/2026 lúc 11:48:21, giờ Việt Nam (UTC+7).

Mint digest:

```text
7GywPEFJCSD5aJXT4LQ8VpJBtZhXVjzrZQUCwcpPrviX
```

Transfer digest:

```text
5JbAzgLee82xtbPjiMn6mFZ86wjcqibha7yAqqFF2bLT
```

Credit object ID:

```text
0x50db16d6522a79528749b134d25e10a9a0ab2b74c3cf082d0006a379d430b0f3
```

Gói Credit chứa 25 điểm. Chủ sở hữu cuối là khách hàng B.

## 5. POST /api/transactions

- Đã bổ sung thao tác EARN và TRANSFER, tái sử dụng service Credit.
- Có kiểm thử JWT, validation, ánh xạ thao tác và giới hạn merchant.
- Có kiểm thử HTTP 201 cho giao dịch mới, 200 cho replay và 202 cho yêu cầu đang chờ.
- Đã gọi API local với hóa đơn E2E đã xử lý: HTTP 200, replayed = true, points = 25; không mint thêm.

## 6. Lệnh chạy lại

Từ thư mục backend-db/octapoint-backend-khanh:

```powershell
npm.cmd run build
npm.cmd test -- --maxWorkers=1
npm.cmd run test:e2e
```

Từ thư mục blockchain/credit:

```powershell
sui move test
```

## 7. Ghi chú

- Đây là bản ghi kết quả đã kiểm thử, không phải lần chạy test mới khi khôi phục tài liệu.
- E2E dùng dữ liệu giả trên PostgreSQL local riêng và Sui Testnet.
- Chưa áp dụng migration vào database khác của nhóm.
- Test ràng buộc CSDL cố ý gây lỗi CHECK và unique. Các lỗi đó là kết quả mong đợi.
- Chi tiết cấu hình và API nằm trong [core-credit-api.md](core-credit-api.md).
