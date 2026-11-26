# CNPM

## Đăng nhập Customer và Admin

- Cấu hình `MONGODB_URI` và `JWT_SECRET` trong `food-deliver/back-end/.env` theo `.env.example`. Tên database phải đúng chữ hoa/thường: `FastFood`.
- Customer đăng ký/đăng nhập ở `front-end`, tài khoản được lưu trong collection `users` với role `user`; thông tin khách hàng nằm trong `customers`.
- Admin đăng nhập ở `admin`, tài khoản trong `users` có role `admin`. Đăng ký công khai chỉ tạo Customer.
- Nhân viên dùng chung trang đăng nhập `admin`, tài khoản có role `staff`. Admin mở **Nhân viên → Vai trò & quyền** để tạo vai trò và chọn quyền, sau đó mở **Nhân viên → Thêm nhân viên** để cấp tài khoản và gán một vai trò.
- Quyền được lưu trong collection `roles`. Admin có thể sửa vai trò, thu hồi quyền hoặc khóa tài khoản nhân viên. API đọc quyền hiện tại từ MongoDB trên mỗi yêu cầu; giao diện đồng bộ khi tải trang hoặc khi API từ chối quyền. Lỗi mạng tạm thời giữ phiên để người dùng có thể kết nối lại.
- Khi chưa có vai trò nào, backend khởi tạo **Nhân viên phục vụ**. Các quyền Admin đã chỉnh được giữ khi khởi động lại.
- Trang khách hàng có tìm kiếm, lọc và phân trang. Tài khoản mới tự hoạt động; Admin khóa/mở khi cần. Thao tác `/api/user/remove` cũ chuyển thành khóa để giữ liên kết hồ sơ và đơn hàng. Website vận hành theo mô hình một nhà hàng.
- Role và trạng thái tài khoản được đọc từ MongoDB khi gọi API. Token hết hạn sau 1 ngày; hai giao diện kiểm tra lại phiên qua `/api/user/me` khi tải trang.

Tạo Admin: điền `ADMIN_EMAIL`, `ADMIN_PASSWORD` (ít nhất 8 ký tự), tùy chọn `ADMIN_NAME` trong `.env`, rồi chạy tại `food-deliver/back-end`:

```sh
npm run create-admin
npm run server
```

Lệnh tạo Admin mã hóa mật khẩu bằng bcrypt, không thay đổi tài khoản đã tồn tại. Xóa `ADMIN_PASSWORD` khỏi `.env` sau khi tạo xong.

Kiểm thử backend: `npm test` (giả lập thao tác database, không ghi dữ liệu thật). Build giao diện: chạy `npm run build` trong `front-end` và `admin`.

## Đặt hàng không cần đăng nhập

- Khách chọn món, thêm vào giỏ, nhập tên, số điện thoại và địa chỉ rồi đặt COD. Email không bắt buộc. Giỏ khách được giữ trên trình duyệt khi tải lại trang.
- Đặt thành công nhận **mã đơn** và **mã tra cứu riêng**. Mở **Tra cứu đơn** (`/myorders`), nhập cả hai mã để xem đơn; chỉ hủy được khi **Chờ xác nhận**. Không xóa đơn đã hủy.
- MongoDB lưu đơn trong `orders`, không tạo tài khoản khách tự động. Giá và phí được tính lại tại backend; gửi lại yêu cầu sau lỗi mạng trả cùng đơn để tránh trùng.
- Nhân viên có quyền `order.view` thấy đơn tại màn hình Đơn hàng. Danh sách tự cập nhật mỗi 15 giây và có nút Làm mới.
- Hai mã được lưu trên trình duyệt đã đặt hàng; cần giữ lại để tra cứu trên thiết bị khác. MongoDB chỉ lưu bản băm của mã tra cứu.
- Mã đơn có dạng `FD-0001` đến `FD-9999`, cấp bằng bộ đếm nguyên tử trong MongoDB. Hết dải thì chặn tạo đơn, không quay vòng hoặc cắt mã gây trùng. Khi khởi động, đơn cũ được chuyển sang mã bốn số và đồng bộ mã trên hóa đơn trong cùng transaction; mã cũ giữ làm bí danh tra cứu. Không đổi tiền, trạng thái hoặc mốc xử lý. Bộ đếm không lùi; chạy lại không đổi mã lần nữa.

## Xác nhận, giao hàng và thu COD

- Tại **Đơn hàng → Chi tiết**, nhân viên có quyền xác nhận bấm **Cập nhật đơn hàng** để chuyển sang **Đã xác nhận**. Một transaction đổi trạng thái và tạo đúng một hóa đơn `UNPAID` trong `invoices`. Hóa đơn giữ bản sao thông tin và giá đã chốt; lỗi tạo hóa đơn sẽ hoàn tác xác nhận. Gửi lại không tạo thêm hóa đơn.
- Admin cấp vai trò xử lý đơn các quyền **Xem tất cả đơn hàng**, **Xác nhận đơn hàng**, **Cập nhật trạng thái đơn**, **Phân công giao hàng**, **Xem hóa đơn**. Vai trò đã có được giữ nguyên, Admin chủ động bổ sung quyền mới.
- Tạo vai trò **Nhân viên giao hàng** với ba quyền: **Giao hàng và xem đơn được phân công**, **Xem hóa đơn**, **Ghi nhận đã thu tiền COD**; gán cho tài khoản nhân viên. Quyền **Xem tất cả đơn hàng** chỉ dành cho người cần xem toàn bộ danh sách.
- Đơn đi theo thứ tự Đã xác nhận → Đang chuẩn bị → Đang giao → Hoàn thành. Chọn người giao trước khi bắt đầu giao. Người giao chỉ được xem và thao tác trên đơn đã phân công; có thể phân công lại trước khi thu tiền hoặc hoàn thành.
- Khi nhận đủ tiền, nhập số COD thực thu (bằng tổng phải trả, sau khi trả tiền thừa nếu có) rồi chọn **Đã giao và thu đủ tiền**. Hóa đơn và đơn được cập nhật cùng transaction, lưu người/thời điểm thu; gửi lại không ghi thu lần hai.
- Có thể cập nhật **Hoàn thành** trước khi thu tiền. Đơn vẫn giữ hóa đơn chưa thanh toán, sau đó người có quyền ghi nhận COD có thể thu bổ sung. Không tự đánh dấu thanh toán khi xác nhận hoặc giao xong.
- Hóa đơn nằm trong chi tiết đơn, không có chức năng sửa/xóa tiền đã chốt. Đơn cũ đã xử lý nhưng thiếu hóa đơn sẽ bị chặn xử lý tiếp để đối chiếu, không tự phát sinh hóa đơn hay tiền thu lịch sử.

Kiểm thử transaction trên MongoDB riêng (PowerShell, tại `food-deliver/back-end`, dùng URI trong `.env`):

```powershell
$env:RUN_MONGO_ORDER_TESTS='1'
node --import dotenv/config --test tests/orderWorkflow.test.js
Remove-Item Env:RUN_MONGO_ORDER_TESTS
```

Bộ test tạo database `cnpm_order_test_<mã ngẫu nhiên>` rồi xóa database thử khi kết thúc; không ghi vào database `FastFood`.

## Bố cục quản trị

- **TRANG CHỦ → Đơn hàng** (`/orders`): danh sách, tìm kiếm, lọc trạng thái, sắp xếp và phân trang. Cột **Xử lý → Chi tiết** mở trang `/orders/:id`; tải lại hoặc gửi liên kết vẫn mở đúng đơn theo quyền tài khoản. Bộ lọc được giữ khi quay lại danh sách.
- Chi tiết đơn gồm món và tổng tiền, người nhận, giao hàng, hóa đơn, tiến trình và các thao tác cập nhật theo quyền. Giá lấy từ đơn đã chốt.
- **TÀI CHÍNH → Báo cáo** (`/reports`, dành cho Admin): thống kê 7/30 ngày và biểu đồ doanh thu. Doanh thu chỉ gồm đơn hoàn thành có hóa đơn đã thanh toán, ghi nhận tại thời điểm muộn hơn giữa hoàn thành và thu tiền; đơn chưa thu tiền không được tính doanh thu. Tiền chưa thu là tổng hóa đơn chưa thanh toán được lập trong kỳ.
- **NHÀ HÀNG → Quản lý thực đơn → Món ăn / Danh mục / Thêm món**; tiếp theo là **Khách hàng** và **Nhân viên**. Không có mục Bếp. Năm danh mục gốc **Main course, Drinks, Dessert, Fast food, Bakery** luôn hiện dù chưa có món và dùng tên tiếng Anh trong Admin. Danh mục gốc không bị xóa; danh mục thêm có thể xóa khi không còn món. Thêm danh mục dùng được ở form thêm/sửa món; đơn và hóa đơn giữ bản sao đã chốt.
- Bảng món có tìm kiếm, lọc danh mục, lọc tình trạng, bật/tắt đang bán và số đơn đặt trong 30 ngày (không tính đơn hủy). Nhóm món mới có món kinh doanh xuất hiện trong bộ lọc thực đơn của web khách.
