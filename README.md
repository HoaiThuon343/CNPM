# CNPM

## Đăng nhập Customer và Admin

- Cấu hình `MONGODB_URI` và `JWT_SECRET` trong `food-deliver/back-end/.env` theo `.env.example`. Tên database phải đúng chữ hoa/thường: `FastFood`.
- Customer đăng ký/đăng nhập ở `front-end`, tài khoản được lưu trong collection `users` với role `user`; thông tin khách hàng nằm trong `customers`.
- Admin đăng nhập ở `admin`, tài khoản trong `users` có role `admin`. Đăng ký công khai chỉ tạo Customer.
- Role và trạng thái tài khoản được đọc từ MongoDB khi gọi API. Token hết hạn sau 1 ngày; hai giao diện kiểm tra lại phiên qua `/api/user/me` khi tải trang.

Tạo Admin: điền `ADMIN_EMAIL`, `ADMIN_PASSWORD` (ít nhất 8 ký tự), tùy chọn `ADMIN_NAME` trong `.env`, rồi chạy tại `food-deliver/back-end`:

```sh
npm run create-admin
npm run server
```

Lệnh tạo Admin mã hóa mật khẩu bằng bcrypt, không thay đổi tài khoản đã tồn tại. Xóa `ADMIN_PASSWORD` khỏi `.env` sau khi tạo xong.

Kiểm thử backend: `npm test` (giả lập thao tác database, không ghi dữ liệu thật). Build giao diện: chạy `npm run build` trong `front-end` và `admin`.
