import mongoose from 'mongoose';

export const permissions = [
    { code: 'staff.view', name: 'Xem danh sách, chi tiết và tìm kiếm nhân viên' },
    { code: 'report.view', name: 'Xem báo cáo thống kê' },
    { code: 'product.view', name: 'Xem danh sách món trên trang quản trị' },
    { code: 'product.create', name: 'Thêm món ăn' },
    { code: 'product.update', name: 'Sửa món và tình trạng kinh doanh' },
    { code: 'product.delete', name: 'Xóa hoặc ngừng kinh doanh món ăn' },
    { code: 'category.manage', name: 'Thêm, sửa, ẩn và xóa danh mục món' },
    { code: 'order.view', name: 'Xem tất cả đơn hàng' },
    { code: 'order.confirm', name: 'Xác nhận đơn hàng' },
    { code: 'order.updateStatus', name: 'Cập nhật trạng thái đơn' },
    { code: 'order.assignDelivery', name: 'Phân công giao hàng' },
    { code: 'order.deliver', name: 'Giao hàng và xem đơn được phân công' },
    { code: 'invoice.view', name: 'Xem và tra cứu hóa đơn theo phạm vi đơn được cấp' },
    { code: 'invoice.markPaid', name: 'Ghi nhận đã thu tiền COD' },
    { code: 'promotion.manage', name: 'Quản lý khuyến mãi và xem lịch sử sử dụng' },
    { code: 'inventory.view', name: 'Xem kho hàng và lịch sử nhập' },
    { code: 'inventory.manage', name: 'Quản lý nguyên liệu và nhà cung cấp' },
    { code: 'purchase.edit', name: 'Lập, sửa và hủy phiếu nhập' },
    { code: 'purchase.confirm', name: 'Xác nhận phiếu nhập và cộng tồn' },
];

const roleSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        description: { type: String, trim: true, default: '' },
        permissions: [
            { type: String, enum: permissions.map((item) => item.code) },
        ],
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

const roleModel = mongoose.models.Role || mongoose.model('Role', roleSchema);

export const initializeRoles = async () => {
    if (await roleModel.exists({})) return;
    try {
        await roleModel.updateOne(
            { name: 'Nhân viên phục vụ' },
            {
                $setOnInsert: {
                    permissions: permissions
                        .filter(
                            (item) =>
                                (item.code.startsWith('order.') && item.code !== 'order.deliver') ||
                                item.code === 'invoice.view',
                        )
                        .map((item) => item.code),
                    status: 'active',
                },
            },
            { upsert: true, runValidators: true },
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
};

export default roleModel;
