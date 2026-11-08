# Prisma schema

| Thành phần | Bổ sung |
|---|---|
| Merchant | MintCap ID và địa chỉ ví ký mint |
| Customer | Địa chỉ Sui riêng; points là số dư đã xác nhận |
| CreditObject | Object ID, merchant, khách hàng sở hữu và số điểm |
| Transaction | txDigest lưu hash; loại TRANSFER_IN/TRANSFER_OUT |

- Tỷ lệ mặc định 10.000 VND/điểm sẽ đặt trong cấu hình backend ở bước API.
- Một mint tạo một dòng EARN, dùng reference làm mã hóa đơn. Một transfer tạo hai dòng OUT/IN, points dương và cùng txDigest. txDigest không unique riêng vì hai dòng transfer dùng chung hash.
- Unique (txDigest, customerId, type) tránh ghi lặp cùng kết quả cho một khách hàng. Khóa ngoại composite bảo đảm object/lịch sử và khách hàng cùng merchant.
- SQL bổ sung giữ số dư không âm, lượng điểm object dương và unique mã hóa đơn EARN theo merchant. API mint tương lai phải yêu cầu reference có giá trị và chuẩn hóa mã hóa đơn.
- Chỉ cập nhật số dư, object và lịch sử trong cùng database transaction sau khi xác minh chain thành công.
- Chưa có API/worker chống yêu cầu đồng thời: unique hóa đơn chỉ ngăn ghi database trùng, không tự ngăn hai giao dịch mint trên chain. Backend cần tuần tự hóa yêu cầu cùng hóa đơn trước khi gửi.
- Khi timeout hoặc chain thành công nhưng database lỗi, cần kiểm tra digest và đối soát thủ công. Không tự mint lại khi chưa biết kết quả; bản này không có bảng lưu yêu cầu chờ hoặc phục hồi tự động.



Chưa chạy migration hoặc thay đổi database. Giữ nguyên backend/schema.sql cũ.

1. Kiểm tra dữ liệu cũ: số dư âm, lịch sử lệch merchant, trùng mã hóa đơn EARN. Repo chưa có migrations nên cần xác định baseline.
2. Tạo migration bằng `npm run db:migrate -- --name credit_core --create-only` sau khi đã có baseline và PostgreSQL local.
3. Review SQL sinh ra, thêm prisma/credit-invariants.sql vào cuối migration để bổ sung CHECK và partial unique index; không chạy file này độc lập.
4. Chạy thử trên database local và regenerate Prisma client. Chưa kiểm thử migration/database thực tế.
5. Ở bước API, bổ sung hai loại transfer vào bộ lọc lịch sử hiện tại; kiểm tra quyền, địa chỉ, số dư và chuẩn hóa địa chỉ Sui.
