import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Navbar from './components/Navbar/Navbar'
import Sidebar from './components/Sidebar/Sidebar'
import Login from './pages/Login/Login'
import User from './pages/User/User'
import Staff from './pages/Staff/Staff'
import Orders from './pages/Orders/Orders'
import Reports from './pages/Reports/Reports'
import Add from './pages/Product/Add'
import List from './pages/Product/List'
import Update from './pages/Product/Update'
import Categories from './pages/Product/Categories'
import Invoices from './pages/Invoices/Invoices'
import Inventory from './pages/Inventory/Inventory'
import Promotions from './pages/Promotions/Promotions'

const url = 'http://localhost:4000'

const App = () => {
    const [user, setUser] = useState(null)
    const [checking, setChecking] = useState(true)
    const [authError, setAuthError] = useState('')
    const logout = useCallback(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        setUser(null)
        setAuthError('')
    }, [])

    const refreshUser = useCallback(async () => {
        const token = localStorage.getItem('token')
        if (!token) return
        const { data } = await axios.get(`${url}/api/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
        })
        if (localStorage.getItem('token') !== token) return
        if (!['admin', 'staff'].includes(data.user?.role)) {
            const error = new Error('Tài khoản không có quyền truy cập quản trị.')
            error.code = 'ACCESS_DENIED'
            throw error
        }
        localStorage.setItem('role', data.user.role)
        setUser(data.user)
    }, [])

    const restore = useCallback(async () => {
        const token = localStorage.getItem('token')
        try {
            await refreshUser()
            setAuthError('')
            return true
        } catch (error) {
            if (localStorage.getItem('token') !== token) return false
            if (error.response?.status === 401 ||
                error.response?.data?.code === 'ACCOUNT_DISABLED' || error.code === 'ACCESS_DENIED') {
                logout()
            } else if (localStorage.getItem('token')) {
                setAuthError('Chưa kết nối được máy chủ. Bạn có thể thử kết nối lại để tiếp tục phiên làm việc.')
            }
            return false
        } finally {
            setChecking(false)
        }
    }, [refreshUser, logout])

    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.config?.url?.startsWith(`${url}/api/`) &&
                    error.config.headers?.Authorization === `Bearer ${localStorage.getItem('token')}`) {
                    if (
                        error.response?.status === 401 ||
                        error.response?.data?.code === 'ACCOUNT_DISABLED'
                    )
                        logout()
                    else if (error.response?.data?.code === 'PERMISSION_DENIED') restore()
                }
                return Promise.reject(error)
            },
        )
        restore()
        return () => {
            axios.interceptors.response.eject(interceptor)
        }
    }, [logout, restore])

    const login = async (token) => {
        localStorage.setItem('token', token)
        if (!await restore()) {
            throw new Error('Chưa thể tải phiên làm việc. Vui lòng thử lại.')
        }
    }
    const endSession = async () => {
        try {
            await axios.post(`${url}/api/user/logout`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, timeout: 10000,
            })
            logout()
        } catch (error) {
            if (error.response?.status === 401 || error.response?.data?.code === 'ACCOUNT_DISABLED') logout()
            else window.alert('Chưa đăng xuất được. Vui lòng thử lại.')
        }
    }
    const can = (permission) => user?.role === 'admin' || user?.permissions?.includes(permission)
    const canViewReports = can('report.view')
    const canBrowseProducts = ['product.view', 'product.create', 'product.update', 'product.delete'].some(can)
    const canViewOrders = user?.role === 'admin' || ['order.view', 'order.deliver'].some(permission => user?.permissions?.includes(permission))
    const canViewInvoices = user?.role === 'admin' || user?.permissions?.includes('invoice.view')
    const canViewInventory = user?.role === 'admin' || user?.permissions?.includes('inventory.view')
    const canManagePromotions = user?.role === 'admin' || user?.permissions?.includes('promotion.manage')
    const home = canViewOrders ? '/orders' : canViewInvoices ? '/invoices' : canViewInventory ? '/inventory' :
        canManagePromotions ? '/promotions' : canViewReports ? '/reports' : canBrowseProducts ? '/products/list' :
            can('product.create') ? '/products/add' : can('category.manage') ? '/products/categories' :
                can('staff.view') ? '/staff' : '/access'

    if (checking) return <div className="loading-screen">Đang tải…</div>
    if (authError && !user) return (
        <div className="loading-screen">
            <section className="panel empty-state" role="alert">
                <h2>Kết nối tạm gián đoạn</h2>
                <p>{authError}</p>
                <button className="button" onClick={() => { setChecking(true); restore() }}>
                    Thử kết nối lại
                </button>
            </section>
        </div>
    )
    return (
        <>
            <ToastContainer position="bottom-right" limit={2} autoClose={2500} />
            {!user ? (
                <Routes>
                    <Route path="/login" element={<Login url={url} onLogin={login} />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            ) : (
                <div className="admin-shell">
                    <Sidebar user={user} canViewOrders={canViewOrders} canViewInvoices={canViewInvoices}
                        canViewInventory={canViewInventory} canManagePromotions={canManagePromotions} canViewReports={canViewReports} />
                    <div className="admin-main">
                        <Navbar user={user} onLogout={endSession} />
                        <main className="admin-content">
                            <Routes>
                                {canManagePromotions && <Route path="/promotions" element={<Promotions url={url} />} />}
                                {canViewInventory && (
                                    <Route path="/inventory/:section?" element={<Inventory url={url} user={user} />} />
                                )}
                                {canViewInvoices && (
                                    <Route path="/invoices/:invoiceId?" element={<Invoices url={url} user={user} />} />
                                )}
                                {canViewOrders && (
                                    <Route
                                        path="/orders/:orderId?"
                                        element={<Orders key="orders" url={url} user={user} />}
                                    />
                                )}
                                {canViewReports && <Route path="/reports/:section?" element={<Reports url={url} />} />}
                                {canBrowseProducts && <>
                                    <Route path="/products" element={<List url={url} user={user} />} />
                                    <Route path="/products/list" element={<List url={url} user={user} />} />
                                </>}
                                {can('category.manage') && <Route path="/products/categories" element={<Categories url={url} />} />}
                                {can('product.create') && <Route path="/products/add" element={<Add url={url} />} />}
                                {can('product.update') && <Route path="/products/update" element={<Update url={url} />} />}
                                {can('staff.view') && <Route path="/staff" element={<Staff url={url} user={user} />} />}
                                {user.role === 'admin' && (
                                    <>
                                        <Route path="/user" element={<User url={url} />} />
                                        <Route path="/accounts" element={<User key="accounts" url={url} all />} />
                                    </>
                                )}
                                <Route
                                    path="/access"
                                    element={
                                        <section className="panel empty-state">
                                            <h2>Chưa có chức năng được cấp</h2>
                                            <p>Liên hệ quản trị viên để được cấp quyền.</p>
                                        </section>
                                    }
                                />
                                <Route path="*" element={<Navigate to={home} replace />} />
                            </Routes>
                        </main>
                    </div>
                </div>
            )}
        </>
    )
}

export default App
