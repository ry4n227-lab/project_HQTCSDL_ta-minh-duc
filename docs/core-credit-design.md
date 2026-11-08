# Core Credit — Công việc đã hoàn thành

- Chốt Credit là điểm thưởng tích lũy theo từng merchant.
- Chốt mô hình sở hữu: mỗi khách hàng có ví Sui riêng, backend quản lý khóa ký.
- Phân định quyền: platform cấp quyền mint, merchant mint điểm, ví khách hàng ký chuyển điểm.
- Chốt tỷ lệ mặc định: 10.000 VND = 1 điểm, làm tròn xuống.
- Chốt chuyển toàn bộ gói điểm giữa khách hàng cùng merchant.
- Chốt chỉ cập nhật số dư sau khi giao dịch blockchain được xác nhận thành công.
- Xác định nguyên tắc chống giao dịch trùng và phục hồi khi mất kết nối.
- Bổ sung Prisma schema đơn giản: địa chỉ ví, CreditObject, hash giao dịch và lịch sử chuyển điểm; chuẩn bị ràng buộc CSDL để Khánh review.

- Viết contract Move mint/transfer và 9 unit test.