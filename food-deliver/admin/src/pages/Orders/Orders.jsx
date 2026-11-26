import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { formatMoney } from '../../../../shared/money.js'
import OrderDetail from './OrderDetail'
import './Orders.css'

const statusNames = {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    PREPARING: 'Đang chuẩn bị',
    DELIVERING: 'Đang giao',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
}
const vietnamDay = value => {
    const date = Date.parse(value + 'T00:00:00+07:00')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date) ||
        new Date(date + 7 * 3600000).toISOString().slice(0, 10) !== value) return NaN
    return date
}

const Orders = ({ url, user }) => {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [params, setParams] = useSearchParams()
    const { orderId } = useParams()
    const navigate = useNavigate()
    const detailRef = useRef(null)
    const selected = orderId ? orders.find((item) => item._id === orderId) : null
    const selectedId = selected?._id
    const token = localStorage.getItem('token')
    const load = useCallback(
        async (silent = false) => {
            if (!silent) setLoading(true)
            try {
                const { data } = await axios.post(
                    `${url}/api/order/list`,
                    {},
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        timeout: 10000,
                    },
                )
                setOrders(data.data)
                setError('')
            } catch (error) {
                setError(error.response?.data?.message || 'Không tải được đơn hàng. Vui lòng thử lại.')
            } finally {
                if (!silent) setLoading(false)
            }
        },
        [url, token],
    )
    useEffect(() => {
        load()
        const timer = setInterval(() => load(true), 15000)
        return () => clearInterval(timer)
    }, [load])
    useEffect(() => {
        if (selectedId && window.matchMedia('(max-width: 1000px)').matches) {
            detailRef.current?.scrollIntoView({ block: 'start' })
        }
    }, [selectedId])

    const suffix = params.size ? `?${params}` : ''
    const listUrl = `/orders${suffix}`
    const detailUrl = (id) => `/orders/${id}${suffix}`
    const search = params.get('search') || ''
    const status = params.get('status') || ''
    const sort = params.get('sort') || 'pending'
    const from = params.get('from') || ''
    const to = params.get('to') || ''
    const start = from ? vietnamDay(from) : -Infinity
    const end = to ? vietnamDay(to) + 86400000 : Infinity
    const invalidDates = Number.isNaN(start) || Number.isNaN(end) || start >= end
    const changeFilter = (key, value) =>
        setParams(
            (previous) => {
                const next = new URLSearchParams(previous)
                if (value) next.set(key, value)
                else next.delete(key)
                next.delete('page')
                return next
            },
            { replace: true },
        )
    const rows = orders
        .filter(
            (order) =>
                !invalidDates &&
                (!from || Date.parse(order.date) >= start) &&
                (!to || Date.parse(order.date) < end) &&
                (!status || order.status === status) &&
                [
                    order.orderCode,
                    order._id,
                    order.address?.name,
                    order.address?.phone,
                    order.customerId?.userId?.name,
                    order.customerId?.userId?.email,
                    order.customerId?.userId?.phone,
                    order.customerId?.phone,
                    order.deliveryStaffName,
                    order.invoice?.invoiceCode,
                ].some((value) =>
                    value?.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
                ),
        )
        .sort((a, b) => {
            if (sort === 'pending' && (a.status === 'PENDING') !== (b.status === 'PENDING'))
                return a.status === 'PENDING' ? -1 : 1
            return sort === 'oldest'
                ? new Date(a.date) - new Date(b.date)
                : new Date(b.date) - new Date(a.date)
        })
    const pages = Math.max(1, Math.ceil(rows.length / 20))
    const page = Math.min(pages, Math.max(1, Math.trunc(Number(params.get('page'))) || 1))
    const courierOnly = user.role !== 'admin' && !user.permissions?.includes('order.view')
    return (
        <div className="orders-page">
            <div className="page-heading">
                <div>
                    <h1>{courierOnly ? 'Đơn được phân công' : 'Đơn hàng'}</h1>
                    <p>Theo dõi, tiếp nhận và xử lý đơn giao hàng.</p>
                </div>
                <button className="button button-light" onClick={() => load()} disabled={loading}>
                    Làm mới
                </button>
            </div>
            {error && (
                <p className="form-error" role="alert">
                    {error}
                </p>
            )}
            <div className={`orders-layout${orderId ? ' with-detail' : ''}`}>
                <section className="panel orders-main">
                    <div className="orders-filters">
                        <div className="order-status-tabs" aria-label="Lọc trạng thái đơn">
                            {[['', 'Tất cả'], ...Object.entries(statusNames)].map(([code, name]) => (
                                <button
                                    key={code}
                                    aria-pressed={status === code}
                                    className={status === code ? 'active' : ''}
                                    onClick={() => changeFilter('status', code)}
                                >
                                    {name}
                                    <span>
                                        {code
                                            ? orders.filter((order) => order.status === code).length
                                            : orders.length}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="toolbar">
                            <label className="field">Từ ngày<input type="date" value={from} max={to || undefined}
                                onChange={event => changeFilter('from', event.target.value)} /></label>
                            <label className="field">Đến ngày<input type="date" value={to} min={from || undefined}
                                onChange={event => changeFilter('to', event.target.value)} /></label>
                        </div>
                        {invalidDates && <p className="form-error" role="alert">Khoảng ngày không hợp lệ.</p>}
                        <div className="toolbar">
                            <input
                                aria-label="Tìm đơn hàng"
                                placeholder="Tìm mã đơn, khách hàng, số điện thoại…"
                                value={search}
                                onChange={(event) => changeFilter('search', event.target.value)}
                            />
                            <select
                                aria-label="Sắp xếp đơn hàng"
                                value={sort}
                                onChange={(event) => changeFilter('sort', event.target.value)}
                            >
                                <option value="pending">Ưu tiên chờ xác nhận</option>
                                <option value="newest">Mới nhất trước</option>
                                <option value="oldest">Cũ nhất trước</option>
                            </select>
                        </div>
                    </div>
                    {loading ? (
                        <div className="empty-state">Đang tải đơn hàng…</div>
                    ) : rows.length === 0 ? (
                        <div className="empty-state">Không có đơn hàng phù hợp.</div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table orders-table">
                                <thead>
                                    <tr>
                                        <th>Mã đơn</th>
                                        <th>Khách hàng</th>
                                        <th className="order-extra">Số món</th>
                                        <th>Tổng tiền</th>
                                        <th>Trạng thái</th>
                                        <th className="order-extra">Người giao</th>
                                        <th className="order-extra">Thời gian đặt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice((page - 1) * 20, page * 20).map((order) => (
                                        <tr
                                            key={order._id}
                                            className={order._id === selectedId ? 'order-selected' : undefined}
                                            onClick={(event) => {
                                                if (order._id !== selectedId && !event.target.closest('a')) {
                                                    navigate(detailUrl(order._id))
                                                }
                                            }}
                                        >
                                            <td>
                                                <Link
                                                    className="order-code"
                                                    to={detailUrl(order._id)}
                                                    aria-current={order._id === selectedId ? 'true' : undefined}
                                                    aria-controls={orderId ? 'order-detail' : undefined}
                                                >
                                                    {order.orderCode || `#${order._id.slice(-8).toUpperCase()}`}
                                                </Link>
                                            </td>
                                            <td>
                                                <strong>{order.customerId?.userId?.name || order.address?.name || 'Khách vãng lai'}</strong>
                                                <small>{order.customerId?.userId?.phone || order.customerId?.phone || order.address?.phone}</small>
                                            </td>
                                            <td className="order-extra">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                                            <td>
                                                <strong>{formatMoney(order.amount)}</strong>
                                            </td>
                                            <td>
                                                <span className={`badge order-badge status-${order.status}`}>
                                                    {statusNames[order.status] || 'Chưa xác định'}
                                                </span>
                                            </td>
                                            <td className="order-extra">{order.deliveryStaffName || 'Chưa phân công'}</td>
                                            <td className="order-extra">
                                                {new Date(order.date).toLocaleTimeString('vi-VN', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                                <small>{new Date(order.date).toLocaleDateString('vi-VN')}</small>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="panel-heading orders-pagination">
                        <span>
                            {rows.length} đơn hàng · Trang {page}/{pages}
                        </span>
                        <div className="toolbar">
                            <button
                                className="button button-light"
                                disabled={page <= 1}
                                onClick={() =>
                                    setParams(
                                        (previous) => {
                                            const next = new URLSearchParams(previous)
                                            next.set('page', String(page - 1))
                                            return next
                                        },
                                        { replace: true },
                                    )
                                }
                            >
                                Trước
                            </button>
                            <button
                                className="button button-light"
                                disabled={page >= pages}
                                onClick={() =>
                                    setParams(
                                        (previous) => {
                                            const next = new URLSearchParams(previous)
                                            next.set('page', String(page + 1))
                                            return next
                                        },
                                        { replace: true },
                                    )
                                }
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </section>
                {orderId && (
                    <aside id="order-detail" className="orders-sub" aria-label="Chi tiết đơn hàng" ref={detailRef}>
                        <div className="orders-sub-heading">
                            <h2>{selected ? `Đơn ${selected.orderCode || `#${selected._id.slice(-8).toUpperCase()}`}` : 'Chi tiết đơn hàng'}</h2>
                            <Link className="button button-light" to={listUrl}>Đóng ×</Link>
                        </div>
                        {selected ? (
                            <OrderDetail
                                key={selected._id}
                                order={selected}
                                url={url}
                                user={user}
                                statusNames={statusNames}
                                onRefresh={load}
                                onUpdated={(updated) => setOrders((previous) =>
                                    previous.map((item) => item._id === updated._id ? updated : item))}
                            />
                        ) : (
                            <div className="panel empty-state">
                                {loading ? 'Đang tải chi tiết đơn hàng…' : error ? 'Chưa tải được đơn hàng.' :
                                    'Đơn không tồn tại hoặc bạn chưa được phân công xử lý.'}
                            </div>
                        )}
                    </aside>
                )}
            </div>
        </div>
    )
}

export default Orders
