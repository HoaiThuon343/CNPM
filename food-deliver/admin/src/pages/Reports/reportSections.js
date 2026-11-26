const count = ['count', 'Số hóa đơn', 'number']
const amount = ['amount', 'Tổng tiền', 'USD']

export const reportSections = {
    revenue: {
        title: 'Doanh thu',
        columns: [['date', 'Kỳ'], count, ['amount', 'Doanh thu', 'USD']],
        note: 'Doanh thu được ghi nhận khi đơn đã hoàn thành và hóa đơn đã thanh toán, theo thời điểm điều kiện sau cùng được đáp ứng.',
    },
    invoices: {
        title: 'Thống kê hóa đơn',
        columns: [['date', 'Ngày lập'], ['status', 'Trạng thái'], count, amount],
    },
    staff: {
        title: 'Hóa đơn theo nhân viên',
        byYear: true,
        columns: [['name', 'Nhân viên lập hóa đơn'], count, amount],
    },
    customers: {
        title: 'Hóa đơn theo khách hàng',
        byYear: true,
        columns: [['name', 'Khách hàng'], ['type', 'Loại khách'], count, amount],
        note: 'Khách có tài khoản được nhóm theo tài khoản. Khách vãng lai được nhóm theo số điện thoại khi có.',
    },
    products: {
        title: 'Doanh thu sản phẩm',
        byYear: true,
        columns: [['name', 'Món ăn'], ['quantity', 'Số lượng', 'number'], ['amount', 'Thành tiền món', 'USD']],
        note: 'Thành tiền món lấy theo số lượng và đơn giá trên hóa đơn, trước giảm giá và chưa gồm phí giao hàng.',
    },
    discounts: {
        title: 'Trước và sau giảm giá',
        columns: [count, ['before', 'Tổng trước giảm', 'USD'], ['discount', 'Tổng giảm giá', 'USD'], ['amount', 'Tổng sau giảm', 'USD']],
    },
    purchases: {
        title: 'Chi phí nhập nguyên liệu',
        columns: [['code', 'Mã phiếu'], ['date', 'Ngày xác nhận'], ['name', 'Nhà cung cấp'],
            ['currency', 'Tiền tệ'], ['amount', 'Tổng tiền phiếu', 'currency']],
        note: 'Khi lọc theo nguyên liệu, báo cáo tính toàn bộ giá trị các phiếu có nguyên liệu đã chọn.',
    },
    stock: {
        title: 'Thống kê tồn kho',
        columns: [['code', 'Mã nguyên liệu'], ['name', 'Nguyên liệu'], ['unit', 'Đơn vị'],
            ['stock', 'Tồn hiện tại', 'number'], ['minimum', 'Tồn tối thiểu', 'number'], ['low', 'Cảnh báo']],
    },
    'cash-flow': {
        title: 'Thu – chi nhập hàng',
        columns: [['currency', 'Tiền tệ'], ['income', 'Doanh thu', 'currency'],
            ['expenses', 'Chi nhập hàng', 'currency'], ['balance', 'Chênh lệch', 'currency']],
        note: 'Chênh lệch chưa gồm chi phí vận hành khác. Số liệu được tính riêng theo từng đồng tiền.',
    },
}
