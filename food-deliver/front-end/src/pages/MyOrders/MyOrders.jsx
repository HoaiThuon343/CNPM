import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { StoreContext } from '../../context/storeContext'
import { formatMoney } from '../../../../shared/money.js'
import './MyOrders.css'

const statuses = {
    PENDING: 'Ch\u1edd x\u00e1c nh\u1eadn',
    CONFIRMED: '\u0110\u00e3 x\u00e1c nh\u1eadn',
    PREPARING: '\u0110ang chu\u1ea9n b\u1ecb',
    DELIVERING: '\u0110ang giao',
    COMPLETED: 'Ho\u00e0n th\u00e0nh',
    CANCELLED: '\u0110\u00e3 h\u1ee7y',
}
const dateText = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận'

const MyOrders = () => {
    const { url, token } = useContext(StoreContext)
    const location = useLocation()
    const receipt = location.state
    const [credentials, setCredentials] = useState({
        orderCode: receipt?.order?.orderCode || '',
        trackingCode: receipt?.trackingCode || '',
    })
    const [selected, setSelected] = useState(receipt?.order || null)
    const [history, setHistory] = useState([])
    const [filter, setFilter] = useState('')
    const [memberId, setMemberId] = useState(receipt?.memberOrderId || '')
    const memberRef = useRef(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(() => {
        try {
            const data = JSON.parse(localStorage.getItem('guestOrders') || '[]')
            return Array.isArray(data)
                ? data.filter(
                      (item) =>
                          item && typeof item.orderCode === 'string' && typeof item.trackingCode === 'string',
                  )
                : []
        } catch {
            return []
        }
    })
    const loadHistory = useCallback(async () => {
        if (!token) {
            setHistory([])
            return
        }
        try {
            const { data } = await axios.post(
                `${url}/api/order/userorders`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            )
            setHistory(data.data || [])
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không tải được đơn hàng.')
        }
    }, [url, token])
    useEffect(() => {
        loadHistory()
    }, [loadHistory])
    const memberOrder = history.find(order => order._id === memberId)
    const memberKey = memberOrder?._id
    useEffect(() => {
        if (memberKey) memberRef.current?.scrollIntoView({ block: 'start' })
    }, [memberKey])

    const lookup = useCallback(
        async (values) => {
            setBusy(true)
            setError('')
            setSelected(null)
            setCredentials(values)
            try {
                const { data } = await axios.post(`${url}/api/order/lookup`, values)
                setSelected(data.order)
                const current = { orderCode: data.order.orderCode, trackingCode: values.trackingCode }
                setCredentials(current)
                setSaved((previous) =>
                    previous.map((item) => (item.trackingCode === values.trackingCode ? current : item)),
                )
                try {
                    const stored = JSON.parse(localStorage.getItem('guestOrders') || '[]')
                    if (Array.isArray(stored))
                        localStorage.setItem(
                            'guestOrders',
                            JSON.stringify(
                                stored.map((item) =>
                                    item?.trackingCode === values.trackingCode ? current : item,
                                ),
                            ),
                        )
                } catch {
                    /* The codes can still be copied from the form. */
                }
            } catch (error) {
                setError(error.response?.data?.message || 'Không tra cứu được đơn. Vui lòng thử lại.')
            } finally {
                setBusy(false)
            }
        },
        [url],
    )
    useEffect(() => {
        if (receipt?.order?.orderCode && receipt?.trackingCode) {
            lookup({
                orderCode: receipt.order.orderCode,
                trackingCode: receipt.trackingCode,
            })
        }
    }, [receipt, lookup])

    const cancel = async (order, guest) => {
        if (!window.confirm('Bạn muốn hủy đơn hàng này?')) return
        setBusy(true)
        setError('')
        try {
            const { data } = await axios.post(
                `${url}/api/order/${guest ? 'guest/cancel' : 'cancel'}`,
                guest ? credentials : { orderId: order._id },
                token && !guest ? { headers: { Authorization: `Bearer ${token}` } } : {},
            )
            if (guest) setSelected(data.order)
            else await loadHistory()
            toast.success('Đã hủy đơn hàng.')
        } catch (error) {
            setError(error.response?.data?.message || 'Không hủy được đơn hàng.')
            if (guest) {
                try {
                    const { data } = await axios.post(`${url}/api/order/lookup`, credentials)
                    setSelected(data.order)
                } catch {
                    setSelected(null)
                }
            } else await loadHistory()
        } finally {
            setBusy(false)
        }
    }
    const copyCodes = async () => {
        try {
            await navigator.clipboard.writeText(
                `Mã đơn: ${credentials.orderCode}\nMã tra cứu: ${credentials.trackingCode}`,
            )
            toast.success('Đã sao chép hai mã.')
        } catch {
            toast.info('Vui lòng chọn và sao chép hai mã trong ô bên trên.')
        }
    }
    const renderOrder = (order, guest) => (
        <article className="order-card" key={order.orderId || order._id}>
            <div className="order-card-heading">
                <strong>{order.orderCode || order._id}</strong>
                <span className={`order-status status-${order.status}`}>
                    {statuses[order.status] || order.status}
                </span>
            </div>
            <p>
                {order.address?.name} · {order.address?.phone}
            </p>
            <p className="order-muted">{order.address?.address}</p>
            {order.note && <p className="order-note"><strong>Ghi chú</strong><br />{order.note}</p>}
            <div className="order-lines">
                {order.items.map((item, index) => (
                    <div key={item.productId || index}>
                        <span>
                            {item.name} × {item.quantity}
                            <small className="order-muted">Đơn giá {formatMoney(item.price)}</small>
                        </span>
                        <span>{formatMoney(item.price * item.quantity)}</span>
                    </div>
                ))}
            </div>
            <div className="order-card-footer">
                <div>
                    <small>Tiền món {formatMoney(order.subtotal)} · Phí giao {formatMoney(order.deliveryFee)}</small>
                    <strong>{formatMoney(order.amount)}</strong>
                    {order.promotionCode && <small>Ưu đãi {order.promotionCode}: −{formatMoney(order.discountAmount)}</small>}
                    <small>Thanh toán COD · {dateText(order.date)}</small>
                    <small>
                        {order.paymentStatus === 'PAID' ? 'Đã thanh toán COD' : 'Chưa thanh toán COD'}
                    </small>
                    {order.completedAt && (
                        <small>Giao xong: {new Date(order.completedAt).toLocaleString('vi-VN')}</small>
                    )}
                </div>
                {order.status === 'PENDING' && (
                    <button disabled={busy} onClick={() => cancel(order, guest)}>
                        Hủy đơn
                    </button>
                )}
            </div>
            <ol className="customer-order-timeline" aria-label="Tiến trình đơn hàng">
                {[
                    ['PENDING', order.date], ['CONFIRMED', order.confirmedAt],
                    ['PREPARING', order.preparingAt], ['DELIVERING', order.deliveringAt],
                    ['COMPLETED', order.completedAt], ...(order.status === 'CANCELLED' ? [['CANCELLED', order.cancelledAt]] : []),
                ].filter(([step, time]) => order.status !== 'CANCELLED' || step === 'PENDING' || step === 'CANCELLED' || time)
                    .map(([step, time]) => <li key={step} aria-current={order.status === step ? 'step' : undefined}>
                        <strong>{statuses[step]}</strong>
                        <small>{time ? dateText(time) : Object.keys(statuses).indexOf(step) <= Object.keys(statuses).indexOf(order.status)
                            ? 'Chưa ghi nhận thời điểm' : 'Chưa thực hiện'}</small>
                    </li>)}
            </ol>
        </article>
    )

    return (
        <section className="my-orders">
            <h2>{receipt ? 'Đặt hàng thành công' : 'Tra cứu đơn hàng'}</h2>
            <p className="order-muted">
                Nhập mã đơn và mã tra cứu riêng để xem đơn. Bạn có thể hủy khi đơn còn chờ xác nhận.
            </p>
            {receipt?.trackingCode && (
                <p className="order-notice">
                    Hãy giữ hai mã bên dưới để tra cứu trên thiết bị khác. Chỉ chia sẻ mã tra cứu với người
                    bạn tin tưởng.
                </p>
            )}
            <form
                className="order-lookup"
                onSubmit={(event) => {
                    event.preventDefault()
                    lookup(credentials)
                }}
            >
                <label>
                    Mã đơn
                    <input
                        required
                        name="orderCode"
                        value={credentials.orderCode}
                        onChange={(event) => {
                            setCredentials((previous) => ({
                                ...previous,
                                orderCode: event.target.value,
                            }))
                            setSelected(null)
                        }}
                        placeholder="FD-0001"
                    />
                </label>
                <label>
                    Mã tra cứu
                    <input
                        required
                        name="trackingCode"
                        value={credentials.trackingCode}
                        onChange={(event) => {
                            setCredentials((previous) => ({
                                ...previous,
                                trackingCode: event.target.value,
                            }))
                            setSelected(null)
                        }}
                        autoComplete="off"
                    />
                </label>
                <button disabled={busy}>{busy ? 'Đang tải...' : 'Tra cứu'}</button>
            </form>
            {error && (
                <p className="order-error" role="alert">
                    {error}
                </p>
            )}
            {selected && renderOrder(selected, true)}
            {selected && <button onClick={copyCodes}>Sao chép hai mã</button>}
            {saved.length > 0 && (
                <div className="saved-orders">
                    <h3>Đơn đã lưu trên thiết bị này</h3>
                    {saved.map((item) => (
                        <button key={item.orderCode} disabled={busy} onClick={() => lookup(item)}>
                            {item.orderCode}
                        </button>
                    ))}
                </div>
            )}
            {token && (
                <>
                    <div className="order-history-heading">
                        <h3>Đơn hàng của tài khoản</h3>
                        <select
                            aria-label="Lọc trạng thái đơn"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {Object.entries(statuses).map(([key, value]) => (
                                <option value={key} key={key}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        <button onClick={loadHistory}>Làm mới</button>
                    </div>
                    <div className="customer-orders-scroll"><table className="customer-orders-table">
                        <thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Tổng tiền</th><th>Trạng thái</th><th>Xem đơn</th></tr></thead>
                        <tbody>{history.filter(order => !filter || order.status === filter).map(order => (
                            <tr key={order._id} className={memberId === order._id ? 'selected-order' : ''}
                                onClick={() => setMemberId(order._id)}>
                                <td>{order.orderCode || order._id}</td><td>{dateText(order.date)}</td>
                                <td>{formatMoney(order.amount)}</td><td>{statuses[order.status]}</td>
                                <td><button onClick={() => setMemberId(order._id)}>Chi tiết</button></td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                    {history.filter(order => !filter || order.status === filter).length === 0 && <p className="order-muted">Không có đơn hàng phù hợp.</p>}
                    {memberOrder && <section ref={memberRef} className="customer-order-detail" aria-label="Chi tiết đơn của tôi">
                        <div className="order-history-heading"><h3>Chi tiết đơn hàng</h3><button onClick={() => setMemberId('')}>Đóng</button></div>
                        {renderOrder(memberOrder, false)}
                    </section>}
                </>
            )}
        </section>
    )
}

export default MyOrders
