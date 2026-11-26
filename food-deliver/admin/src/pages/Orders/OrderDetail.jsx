import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { formatMoney } from '../../../../shared/money.js'
import './Orders.css'

const dateText = (value) => (value ? new Date(value).toLocaleString('vi-VN') : 'Chưa ghi nhận thời điểm')

const OrderDetail = ({ order, url, user, statusNames, onUpdated, onRefresh }) => {
    const [couriers, setCouriers] = useState([])
    const [deliveryStaffId, setDeliveryStaffId] = useState(order.deliveryStaffId || '')
    const [saving, setSaving] = useState(false)
    const [actionError, setActionError] = useState('')
    const can = (permission) => user.role === 'admin' || user.permissions?.includes(permission)
    const canAssignOrder = Boolean(can('order.assignDelivery')) &&
        ['CONFIRMED', 'PREPARING', 'DELIVERING'].includes(order.status) && order.paymentStatus !== 'PAID'
    const canDeliver = can('order.updateStatus') || can('order.deliver')
    const token = localStorage.getItem('token')
    useEffect(() => {
        if (!canAssignOrder) return
        const controller = new AbortController()
        axios
            .get(`${url}/api/order/delivery-staff`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })
            .then(({ data }) => setCouriers(data.data))
            .catch((error) => {
                if (!axios.isCancel(error))
                    setActionError(error.response?.data?.message || 'Không tải được nhân viên giao hàng.')
            })
        return () => controller.abort()
    }, [url, token, canAssignOrder])
    const updateOrder = async (path, values) => {
        setSaving(true)
        setActionError('')
        try {
            const { data } = await axios.post(
                `${url}/api/order/${path}`,
                { orderId: order._id, ...values },
                { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 },
            )
            onUpdated({ ...data.data, invoice: data.invoice || order.invoice })
            toast.success('Đã cập nhật đơn hàng.', { toastId: 'order-update' })
        } catch (error) {
            setActionError(
                error.response?.data?.message ||
                    'Chưa nhận được kết quả. Vui lòng kiểm tra trạng thái hoặc thử lại.',
            )
            await onRefresh(true)
        } finally {
            setSaving(false)
        }
    }
    const nextAction = {
        PENDING: { status: 'CONFIRMED', allowed: can('order.confirm') },
        CONFIRMED: { status: 'PREPARING', allowed: can('order.updateStatus') },
        PREPARING: { status: 'DELIVERING', allowed: order.deliveryStaffId && canDeliver },
        DELIVERING: { status: 'COMPLETED', allowed: canDeliver },
    }[order.status]
    const timeline = [
        ['PENDING', 'Đặt hàng', order.date],
        ['CONFIRMED', 'Xác nhận đơn', order.confirmedAt],
        ['PREPARING', 'Chuẩn bị món', order.preparingAt],
        ['DELIVERING', 'Giao hàng', order.deliveringAt],
        ['COMPLETED', 'Hoàn thành', order.completedAt],
    ]
    const currentStep = timeline.findIndex(([status]) => status === order.status)
    const invoice = order.invoice
    const amountReceived = Number(invoice?.amount ?? order.amount)
    return (
        <div className="order-detail-page">
            {actionError && (
                <p className="form-error order-alert" role="alert">
                    {actionError}
                </p>
            )}
            <div className="order-detail-grid">
                <div className="order-detail-main">
                    <section className="panel">
                        <div className="panel-heading">
                            <h2>Món đã đặt</h2>
                            <span className={`badge order-badge status-${order.status}`}>
                                {statusNames[order.status] || 'Chưa xác định'}
                            </span>
                        </div>
                        <div className="table-scroll">
                            <table className="data-table order-items-table">
                                <thead>
                                    <tr>
                                        <th>Món ăn</th>
                                        <th>Số lượng</th>
                                        <th>Đơn giá</th>
                                        <th>Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, index) => (
                                        <tr key={item.productId || index}>
                                            <td>
                                                <strong>{item.name}</strong>
                                            </td>
                                            <td>{item.quantity}</td>
                                            <td>{formatMoney(item.price)}</td>
                                            <td>{formatMoney(item.price * item.quantity)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <dl className="order-totals">
                            <div>
                                <dt>Tiền món</dt>
                                <dd>{formatMoney(order.subtotal)}</dd>
                            </div>
                            <div>
                                <dt>Phí giao hàng</dt>
                                <dd>{formatMoney(order.deliveryFee)}</dd>
                            </div>
                            {order.promotionCode && (
                                <div>
                                    <dt>Giảm giá ({order.promotionCode})</dt>
                                    <dd>−{formatMoney(order.discountAmount)}</dd>
                                </div>
                            )}
                            <div className="order-grand-total">
                                <dt>Tổng thanh toán</dt>
                                <dd>{formatMoney(order.amount)}</dd>
                            </div>
                        </dl>
                    </section>
                    {(nextAction?.allowed ||
                        canAssignOrder ||
                        (order.status === 'PREPARING' && !order.deliveryStaffId && canDeliver)) && (
                        <section className="panel">
                            <div className="panel-heading">
                                <h2>Cập nhật đơn hàng</h2>
                            </div>
                            <div className="panel-body order-update-fields">
                                {nextAction?.allowed && (
                                    <form
                                        className="order-action-form"
                                        onSubmit={(event) => {
                                            event.preventDefault()
                                            updateOrder('status', { status: nextAction.status })
                                        }}
                                    >
                                        <label className="field">
                                            Trạng thái tiếp theo
                                            <input
                                                aria-label="Trạng thái tiếp theo"
                                                value={statusNames[nextAction.status]}
                                                readOnly
                                            />
                                        </label>
                                        <button className="button" disabled={saving}>
                                            {order.status === 'PENDING' ? 'Xác nhận đơn' : 'Cập nhật đơn hàng'}
                                        </button>
                                        <p className="muted">
                                            {order.status === 'PENDING'
                                                ? 'Xác nhận đơn sẽ lập hóa đơn và kết thúc thời gian khách được hủy.'
                                                : order.status === 'DELIVERING' &&
                                                    order.paymentStatus !== 'PAID'
                                                  ? 'Giao xong vẫn giữ trạng thái chưa thanh toán nếu chưa ghi nhận COD.'
                                                  : 'Chuyển đơn sang bước xử lý tiếp theo.'}
                                        </p>
                                    </form>
                                )}
                                {canAssignOrder && (
                                    <form
                                        className="order-action-form"
                                        onSubmit={(event) => {
                                            event.preventDefault()
                                            updateOrder('assign', { staffId: deliveryStaffId })
                                        }}
                                    >
                                        <label className="field">
                                            Nhân viên giao hàng
                                            <select
                                                name="deliveryStaffId"
                                                required
                                                disabled={saving}
                                                value={deliveryStaffId}
                                                onChange={(event) => setDeliveryStaffId(event.target.value)}
                                            >
                                                <option value="">Chọn người giao</option>
                                                {couriers.map((staff) => (
                                                    <option key={staff._id} value={staff._id}>
                                                        {staff.name} ({staff.staffCode})
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <button
                                            className="button button-light"
                                            disabled={saving || !deliveryStaffId}
                                        >
                                            Phân công giao hàng
                                        </button>
                                        {couriers.length === 0 && (
                                            <p className="muted">
                                                Chưa có nhân viên đang hoạt động được cấp quyền giao hàng.
                                            </p>
                                        )}
                                    </form>
                                )}
                                {order.status === 'PREPARING' && !order.deliveryStaffId && (
                                    <p className="muted">
                                        Cần phân công người giao trước khi bắt đầu giao hàng.
                                    </p>
                                )}
                            </div>
                        </section>
                    )}
                    {can('invoice.view') && (
                        <section className="panel">
                            <div className="panel-heading">
                                <h2>Hóa đơn</h2>
                                {invoice && (
                                    <span
                                        className={`badge ${invoice.paymentStatus === 'PAID' ? 'badge-green' : 'badge-amber'}`}
                                    >
                                        {invoice.paymentStatus === 'PAID'
                                            ? 'Đã thanh toán'
                                            : 'Chưa thanh toán'}
                                    </span>
                                )}
                            </div>
                            <div className="panel-body">
                                {invoice ? (
                                    <dl className="order-info">
                                        <div>
                                            <dt>Mã hóa đơn</dt>
                                            <dd>
                                                <strong>{invoice.invoiceCode}</strong>
                                                <Link className="button-link" to={`/invoices/${invoice._id}`}>
                                                    Xem hóa đơn
                                                </Link>
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Ngày lập</dt>
                                            <dd>{dateText(invoice.createdAt)}</dd>
                                        </div>
                                        <div>
                                            <dt>Người lập</dt>
                                            <dd>{invoice.createdByName || 'Chưa ghi nhận'}</dd>
                                        </div>
                                        <div>
                                            <dt>Phải thu</dt>
                                            <dd>{formatMoney(invoice.amount)}</dd>
                                        </div>
                                        {invoice.paidAt && (
                                            <>
                                                <div>
                                                    <dt>Đã thu</dt>
                                                    <dd>{formatMoney(invoice.paidAmount)}</dd>
                                                </div>
                                                <div>
                                                    <dt>Người thu</dt>
                                                    <dd>{invoice.paidByName || 'Chưa ghi nhận'}</dd>
                                                </div>
                                                <div>
                                                    <dt>Thời điểm thu</dt>
                                                    <dd>{dateText(invoice.paidAt)}</dd>
                                                </div>
                                            </>
                                        )}
                                    </dl>
                                ) : (
                                    <p className="muted">
                                        {order.status === 'PENDING' || order.status === 'CANCELLED'
                                            ? 'Đơn chưa phát sinh hóa đơn.'
                                            : 'Đơn chưa có hóa đơn để đối chiếu.'}
                                    </p>
                                )}
                            </div>
                        </section>
                    )}
                    {can('invoice.markPaid') &&
                        ['DELIVERING', 'COMPLETED'].includes(order.status) &&
                        order.paymentStatus !== 'PAID' && (
                            <section className="panel">
                                <div className="panel-heading">
                                    <h2>Ghi nhận tiền khi giao hàng</h2>
                                </div>
                                <form
                                    className="panel-body order-action-form"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        const completeDelivery = Boolean(
                                            order.status === 'DELIVERING' && canDeliver,
                                        )
                                        if (
                                            window.confirm(
                                                `Xác nhận đã nhận đủ ${formatMoney(amountReceived)}${completeDelivery ? ' và giao hàng thành công' : ''}?`,
                                            )
                                        )
                                            updateOrder('payment', {
                                                amountReceived,
                                                completeDelivery,
                                            })
                                    }}
                                >
                                    <label className="field">
                                        Số tiền thực thu (USD)
                                        <input
                                            name="amountReceived"
                                            value={amountReceived.toFixed(2)}
                                            readOnly
                                        />
                                    </label>
                                    <button className="button" disabled={saving}>
                                        {order.status === 'DELIVERING' && canDeliver
                                            ? 'Đã giao và thu đủ tiền'
                                            : 'Ghi nhận đã thu tiền'}
                                    </button>
                                    <p className="muted">
                                        Số tiền cố định theo hóa đơn. Chỉ xác nhận khi đã nhận đủ tiền từ khách.
                                    </p>
                                </form>
                            </section>
                        )}
                </div>
                <aside className="order-detail-side">
                    <section className="panel">
                        <div className="panel-heading"><h2>Khách đặt hàng</h2></div>
                        <div className="panel-body">
                            {order.customerId ? <>
                                <strong>{order.customerId.userId?.name || 'Tài khoản khách hàng cũ'}</strong>
                                <p>{order.customerId.userId?.email}</p>
                                <p>{order.customerId.userId?.phone || order.customerId.phone}</p>
                            </> : <p>Khách chưa đăng nhập</p>}
                        </div>
                    </section>
                    <section className="panel">
                        <div className="panel-heading">
                            <h2>Người nhận</h2>
                        </div>
                        <div className="panel-body order-recipient">
                            <span className="user-avatar">
                                {order.address?.name?.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                                <strong>{order.address?.name || 'Khách vãng lai'}</strong>
                                <a href={`tel:${order.address?.phone}`}>{order.address?.phone}</a>
                                {order.address?.email && <p>{order.address.email}</p>}
                            </div>
                            <p className="order-delivery-address">{order.address?.address}</p>
                        </div>
                    </section>
                    {order.note && <section className="panel">
                        <div className="panel-heading"><h2>Ghi chú đơn hàng</h2></div>
                        <p className="panel-body" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{order.note}</p>
                    </section>}
                    <section className="panel">
                        <div className="panel-heading">
                            <h2>Thông tin đơn hàng</h2>
                        </div>
                        <dl className="order-info order-info-padded">
                            <div>
                                <dt>Hình thức</dt>
                                <dd>Giao hàng tận nơi</dd>
                            </div>
                            <div>
                                <dt>Thanh toán</dt>
                                <dd>COD</dd>
                            </div>
                            <div>
                                <dt>Tình trạng thu tiền</dt>
                                <dd>
                                    <span
                                        className={`badge ${order.paymentStatus === 'PAID' ? 'badge-green' : 'badge-amber'}`}
                                    >
                                        {order.paymentStatus === 'PAID' ? 'Đã thu tiền' : 'Chưa thu tiền'}
                                    </span>
                                </dd>
                            </div>
                            <div>
                                <dt>Người giao</dt>
                                <dd>{order.deliveryStaffName || 'Chưa phân công'}</dd>
                            </div>
                            {order.assignedAt && (
                                <div>
                                    <dt>Phân công lúc</dt>
                                    <dd>{dateText(order.assignedAt)}</dd>
                                </div>
                            )}
                            {order.confirmedByName && (
                                <div>
                                    <dt>Người xác nhận</dt>
                                    <dd>{order.confirmedByName}</dd>
                                </div>
                            )}
                        </dl>
                    </section>
                    <section className="panel">
                        <div className="panel-heading">
                            <h2>Tiến trình đơn hàng</h2>
                        </div>
                        <ol className="order-timeline">
                            {timeline.map(([status, name, time], index) => (
                                <li
                                    key={status}
                                    className={
                                        order.status === status
                                            ? 'current'
                                            : time || (currentStep >= index && order.status !== 'CANCELLED')
                                              ? 'done'
                                              : ''
                                    }
                                >
                                    <span className="timeline-dot">
                                        {time || (currentStep > index && order.status !== 'CANCELLED')
                                            ? '✓'
                                            : index + 1}
                                    </span>
                                    <div>
                                        <strong>{name}</strong>
                                        <small>
                                            {time
                                                ? dateText(time)
                                                : currentStep >= index && order.status !== 'CANCELLED'
                                                  ? 'Chưa ghi nhận thời điểm'
                                                  : 'Chưa thực hiện'}
                                        </small>
                                    </div>
                                </li>
                            ))}
                            {order.status === 'CANCELLED' && (
                                <li className="cancelled">
                                    <span className="timeline-dot">×</span>
                                    <div>
                                        <strong>Đã hủy</strong>
                                        <small>{dateText(order.cancelledAt)}</small>
                                    </div>
                                </li>
                            )}
                        </ol>
                    </section>
                </aside>
            </div>
        </div>
    )
}

export default OrderDetail
