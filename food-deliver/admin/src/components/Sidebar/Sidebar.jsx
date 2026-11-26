import { NavLink, useLocation } from 'react-router-dom'
import './Sidebar.css'
import brandIcon from '../../../../shared/Icon.svg'
import { reportSections } from '../../pages/Reports/reportSections'

const iconPaths = {
    menu: 'M5 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2M3 7h4M3 12h4M3 17h4M9.5 11.5l2.5-2 2 1.5 3-3v5H9.5zM10 16h7M10 18.5h3M11 6.5h.01',
    customers: 'M11 19H3v-1a4 4 0 0 1 4-4h2m1.5-4.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 19h-9v-1a4 4 0 0 1 4-4h1a4 4 0 0 1 4 4zM19.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    staff: 'M6 2.5h12a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM10 5.5h4M15 11.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM5 19c1.4-2 4-3 7-3s5.6 1 7 3',
    supplier: 'M4 17H3V5h12v12H8m7 0h2m4 0h1v-5l-3-4h-4m-7 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    purchase: 'M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 8V6a4 4 0 0 1 8 0v2m-7 6 2 2 4-4',
    invoice: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM2 10h20M6 14h2v2H6z',
    report: 'M2 21h20M4 21v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m2 0V11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v10m2 0V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16',
    offer: 'M3 5v7l9 9m-6-9V4h8l8 8-8 8zM10 8h.01',
}

const SidebarIcon = ({ name }) => (
    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={iconPaths[name]} />
    </svg>
)

const Sidebar = ({ user, canViewOrders, canViewInvoices, canViewInventory, canManagePromotions, canViewReports }) => {
    const can = (permission) => user.role === 'admin' || user.permissions?.includes(permission)
    const canBrowseProducts = ['product.view', 'product.create', 'product.update', 'product.delete'].some(can)
    const canMenu = canBrowseProducts || can('category.manage')
    const { pathname, search } = useLocation()
    const invoiceStatus = new URLSearchParams(search).get('status') || ''
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <img className="brand-mark" src={brandIcon} alt="" />FB<small>QUẢN TRỊ NHÀ HÀNG</small>
            </div>
            <nav>
                <p className="nav-label">TRANG CHỦ</p>
                {canViewOrders && (
                    <NavLink to="/orders">
                        <span>▤</span>Đơn hàng
                    </NavLink>
                )}
                {(canMenu || can('staff.view') || user.role === 'admin') && (
                    <>
                        <p className="nav-label">NHÀ HÀNG</p>
                        {canMenu && <details
                            className="nav-group"
                            key={pathname.startsWith('/products')}
                            open={pathname.startsWith('/products')}
                        >
                            <summary>
                                <SidebarIcon name="menu" />Quản lý thực đơn<span className="nav-chevron">⌄</span>
                            </summary>
                            <div className="nav-submenu">
                                {canBrowseProducts && <NavLink to="/products/list">Món ăn</NavLink>}
                                {can('category.manage') && <NavLink to="/products/categories">Danh mục</NavLink>}
                                {can('product.create') && <NavLink to="/products/add">Thêm món</NavLink>}
                            </div>
                        </details>}
                        {user.role === 'admin' && <>
                        <NavLink to="/user">
                            <SidebarIcon name="customers" />Khách hàng
                        </NavLink>
                        <NavLink to="/accounts"><SidebarIcon name="staff" />Tài khoản</NavLink>
                        </>}
                        {can('staff.view') && <NavLink to="/staff"><SidebarIcon name="staff" />Nhân viên</NavLink>}
                    </>
                )}
                {canViewInventory && (
                    <>
                        <p className="nav-label">KHO HÀNG</p>
                        <NavLink to="/inventory" end><span>▣</span>Tồn kho</NavLink>
                        <NavLink to="/inventory/ingredients"><span>◇</span>Nguyên liệu</NavLink>
                        <NavLink to="/inventory/suppliers"><SidebarIcon name="supplier" />Nhà cung cấp</NavLink>
                        <NavLink to="/inventory/purchases"><SidebarIcon name="purchase" />Phiếu nhập</NavLink>
                    </>
                )}
                {(canViewInvoices || canViewReports) && <p className="nav-label">TÀI CHÍNH</p>}
                {canViewInvoices && (
                    <details className="nav-group" key={pathname.startsWith('/invoices')} open={pathname.startsWith('/invoices')}>
                        <summary><SidebarIcon name="invoice" />Hóa đơn<span className="nav-chevron">⌄</span></summary>
                        <div className="nav-submenu">
                            {[['', 'Danh sách hóa đơn'], ['UNPAID', 'Chưa thanh toán'], ['PAID', 'Đã thanh toán']].map(([status, name]) => (
                                <NavLink key={status} to={`/invoices${status ? `?status=${status}` : ''}`}
                                    className={() => pathname.startsWith('/invoices') && invoiceStatus === status ? 'active' : ''}>
                                    {name}
                                </NavLink>
                            ))}
                        </div>
                    </details>
                )}
                {canViewReports && (
                    <details className="nav-group" key={`reports-${pathname.startsWith('/reports')}`} open={pathname.startsWith('/reports')}>
                        <summary><SidebarIcon name="report" />Báo cáo<span className="nav-chevron">⌄</span></summary>
                        <div className="nav-submenu">
                            {Object.entries(reportSections).map(([section, { title }]) => (
                                <NavLink key={section} to={section === 'revenue' ? '/reports' : `/reports/${section}`} end>
                                    {title}
                                </NavLink>
                            ))}
                        </div>
                    </details>
                )}
                {canManagePromotions && (
                    <>
                        <p className="nav-label">TIẾP THỊ</p>
                        <NavLink to="/promotions"><SidebarIcon name="offer" />Ưu đãi và mã giảm giá</NavLink>
                    </>
                )}
                {!canViewOrders && !canViewInvoices && !canViewInventory && !canManagePromotions && !canViewReports && !canMenu && !can('staff.view') && user.role !== 'admin' &&
                    <NavLink to="/access">Quyền truy cập</NavLink>}
            </nav>
            <div className="sidebar-footer">
                <strong>FB</strong>
                <small>Quản lý nhà hàng</small>
            </div>
        </aside>
    )
}

export default Sidebar
