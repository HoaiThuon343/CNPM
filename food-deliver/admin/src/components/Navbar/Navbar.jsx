import './Navbar.css'
import { Link, useLocation } from 'react-router-dom'
import { reportSections } from '../../pages/Reports/reportSections'

const pageLabels = {
    '/accounts': 'Tài khoản',
    '/orders': 'Đơn hàng',
    '/invoices': 'Hóa đơn',
    '/reports': 'Báo cáo',
    '/staff': 'Nhân viên',
    '/user': 'Khách hàng',
    '/products': 'Quản lý thực đơn / Món ăn',
    '/products/list': 'Quản lý thực đơn / Món ăn',
    '/products/categories': 'Quản lý thực đơn / Danh mục',
    '/products/add': 'Quản lý thực đơn / Thêm món',
    '/products/update': 'Quản lý thực đơn / Sửa món',
    '/inventory': 'Tồn kho',
    '/inventory/ingredients': 'Nguyên liệu',
    '/inventory/suppliers': 'Nhà cung cấp',
    '/inventory/purchases': 'Phiếu nhập',
    '/promotions': 'Ưu đãi và mã giảm giá',
}

const Navbar = ({ user, onLogout }) => {
    const { pathname, search } = useLocation()
    const path = pathname.replace(/\/$/, '')
    const report = path.startsWith('/reports/') ? reportSections[path.split('/')[2]] : null
    const parent = ['/orders', '/invoices'].find((route) => path.startsWith(`${route}/`))
    const roleName = user.role === 'admin' ? 'Quản trị viên' : user.roleName
    return (
        <header className="navbar">
            <span className="workspace-label">
                {parent ? (
                    <>
                        <Link to={{ pathname: parent, search }}>{pageLabels[parent]}</Link>
                        <span className="workspace-separator" aria-hidden="true">/</span>
                        {parent === '/orders' ? 'Chi tiết đơn' : 'Chi tiết hóa đơn'}
                    </>
                ) : (
                    (report && `Báo cáo / ${report.title}`) || pageLabels[path] || 'Quyền truy cập'
                )}
            </span>
            <div className="navbar-right">
                <span className="workspace-status">
                    <i aria-hidden="true" /> FB
                </span>
                <div className="navbar-account">
                    <span className="user-avatar" aria-hidden="true">{user.name?.slice(0, 2).toUpperCase()}</span>
                    <div className="navbar-identity">
                        <strong title={user.name}>{user.name}</strong>
                        <small title={roleName}>{roleName}</small>
                    </div>
                </div>
                <button className="button button-light" onClick={onLogout}>
                    Đăng xuất
                </button>
            </div>
        </header>
    )
}

export default Navbar
