# Prisma schema — Core Credit

| Thành phần | Bổ sung |
|---|---|
| Merchant | MintCap ID, địa chỉ ví ký mint |
| Customer | Địa chỉ Sui, số dư đã xác nhận |
| CreditObject | Object ID, merchant, khách hàng sở hữu, lượng điểm |
| Transaction | Hash blockchain, TRANSFER_IN/TRANSFER_OUT |
| CreditRequest | Yêu cầu nhỏ: reference/key, hash nội dung, signed transaction, digest, trạng thái và kết quả |

CreditRequest chỉ phục vụ chống trùng và khôi phục khi timeout; không có queue hoặc worker. Private key không lưu trong bảng này.

- Khóa ngoại composite giữ object/lịch sử và khách hàng cùng merchant.
- CHECK giữ Customer.points >= 0 và CreditObject.points > 0.
- Partial unique index chặn trùng mã hóa đơn EARN theo merchant.
- Một mint tạo một EARN; một transfer tạo hai dòng OUT/IN cùng digest.
- Số dư, object, lịch sử và trạng thái yêu cầu được cập nhật trong cùng PostgreSQL transaction sau khi chain thành công.


