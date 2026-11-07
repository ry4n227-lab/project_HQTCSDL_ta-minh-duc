# OctaPoint Backend API Test Plan

**Phụ trách:** Nguyễn Đào Quốc Khánh  
**Module:** Backend API & Database  
**Công nghệ:** Node.js, TypeScript, Express, PostgreSQL, Prisma, JWT

## 1. Mục tiêu kiểm thử

- Kiểm tra tính chính xác của các API Backend.
- Đảm bảo xác thực JWT và phân quyền người dùng.
- Đảm bảo dữ liệu giữa các Merchant được phân tách.
- Kiểm tra tính toàn vẹn dữ liệu PostgreSQL.
- Phát hiện lỗi khi người dùng gửi dữ liệu không hợp lệ.

## 2. Authentication Testing

| ID | Test case | Kết quả mong đợi |
|---|---|---|
| AUTH-01 | Đăng ký với thông tin hợp lệ | Tạo tài khoản thành công |
| AUTH-02 | Đăng ký email đã tồn tại | Trả về lỗi phù hợp |
| AUTH-03 | Đăng nhập đúng thông tin | Trả về JWT hợp lệ |
| AUTH-04 | Đăng nhập sai mật khẩu | Từ chối đăng nhập |
| AUTH-05 | Gửi request không có token | Trả về HTTP 401 |
| AUTH-06 | Gửi token không hợp lệ | Trả về HTTP 401 |
| AUTH-07 | Người dùng không đủ quyền truy cập | Trả về HTTP 403 |

## 3. Merchant API Testing

| ID | Test case | Kết quả mong đợi |
|---|---|---|
| MER-01 | Lấy thông tin Merchant | Trả về thông tin đúng |
| MER-02 | Cập nhật thông tin Merchant | Dữ liệu được cập nhật |
| MER-03 | Truy cập dữ liệu Merchant khác | Bị từ chối |
| MER-04 | Gửi dữ liệu cập nhật không hợp lệ | Trả về lỗi validation |

## 4. Customer API Testing

| ID | Test case | Kết quả mong đợi |
|---|---|---|
| CUS-01 | Tạo Customer hợp lệ | Tạo thành công |
| CUS-02 | Lấy danh sách Customer | Trả về danh sách |
| CUS-03 | Xem Customer theo ID | Trả về đúng dữ liệu |
| CUS-04 | Cập nhật Customer | Cập nhật thành công |
| CUS-05 | Xóa Customer | Xóa thành công nếu thỏa điều kiện |
| CUS-06 | Tạo Customer thiếu thông tin | Trả về lỗi validation |
| CUS-07 | Merchant truy cập Customer của Merchant khác | Bị từ chối |

## 5. Transaction API Testing

| ID | Test case | Kết quả mong đợi |
|---|---|---|
| TRA-01 | Lấy lịch sử giao dịch | Trả về danh sách giao dịch |
| TRA-02 | Lọc giao dịch theo Customer | Trả về đúng kết quả |
| TRA-03 | Lọc theo loại giao dịch | Trả về đúng loại |
| TRA-04 | Phân trang giao dịch | Trả về đúng số lượng |
| TRA-05 | Truy cập giao dịch không thuộc Merchant | Bị từ chối |

## 6. Database Testing

- Kiểm tra khóa chính và khóa ngoại.
- Kiểm tra các trường bắt buộc không được NULL.
- Kiểm tra unique constraint.
- Kiểm tra số dư điểm không được âm.
- Kiểm tra quan hệ giữa Merchant, User, Customer và Transaction.
- Kiểm tra tính toàn vẹn dữ liệu khi cập nhật hoặc xóa.

## 7. Security Testing

- Không lưu mật khẩu dưới dạng văn bản thuần.
- Không cho phép truy cập API khi JWT không hợp lệ.
- Không cho phép người dùng tự nâng quyền Admin.
- Không để Merchant truy cập dữ liệu của Merchant khác.
- Kiểm tra dữ liệu đầu vào để hạn chế SQL injection và dữ liệu độc hại.

## 8. Test Execution Record

| Test ID | Actual Result | Status | Notes |
|---|---|---|---|
| AUTH-01 | Chưa kiểm thử | Pending | |
| AUTH-02 | Chưa kiểm thử | Pending | |
| AUTH-03 | Chưa kiểm thử | Pending | |
| CUS-01 | Chưa kiểm thử | Pending | |
| CUS-02 | Chưa kiểm thử | Pending | |
| TRA-01 | Chưa kiểm thử | Pending | |

**Lưu ý:** Các test case trên là kế hoạch kiểm thử. Chỉ chuyển trạng thái sang Passed sau khi thực hiện kiểm thử thực tế.
