import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { formatMoney, toCents } from '../../../../shared/money.js'
import './Invoices.css'

const paymentNames = { UNPAID: 'Chưa thanh toán', PAID: 'Đã thanh toán' }
const orderNames = {
    CONFIRMED: 'Đã xác nhận',
    PREPARING: 'Đang chuẩn bị',
    DELIVERING: 'Đang giao',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
}
const fields = {
    createdAt: 'Ngày lập',
    totalBeforeDiscount: 'Tổng trước giảm',
    discountAmount: 'Giá trị giảm',
    amount: 'Tổng tiền',
    paymentStatus: 'Trạng thái thanh toán',
}
const operators = { eq: '=', ne: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤' }
const dateText = (value) =>
    value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }) : 'Chưa ghi nhận'
const dayKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const isDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
const compare = (left, operator, right) =>
    ({
        eq: left === right,
        ne: left !== right,
        gt: left > right,
        lt: left < right,
        gte: left >= right,
        lte: left <= right,
    })[operator]
const readConditions = (value) => {
    const conditions = JSON.parse(value || '[]')
    if (!Array.isArray(conditions) || conditions.length > 12)
        throw new Error('Chỉ dùng tối đa 12 điều kiện nâng cao.')
    for (const rule of conditions) {
        if (!rule || !Object.hasOwn(fields, rule.field) || !Object.hasOwn(operators, rule.operator))
            throw new Error('Điều kiện tìm kiếm không hợp lệ.')
        if (rule.field === 'paymentStatus') {
            if (!['eq', 'ne'].includes(rule.operator) || !Object.hasOwn(paymentNames, rule.value))
                throw new Error('Trạng thái thanh toán chỉ dùng phép so sánh = hoặc ≠.')
        } else if (rule.field === 'createdAt') {
            if (typeof rule.value !== 'string' || !isDate(rule.value))
                throw new Error('Ngày trong điều kiện nâng cao không hợp lệ.')
        } else {
            if (typeof rule.value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(rule.value))
                throw new Error('Số tiền phải không âm và có tối đa hai chữ số thập phân.')
            try {
                toCents(rule.value)
            } catch {
                throw new Error('Số tiền vượt giới hạn cho phép.')
            }
        }
    }
    return conditions
}

const Invoices = ({ url, user }) => {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [draftConditions, setDraftConditions] = useState([])
    const [advancedError, setAdvancedError] = useState('')
    const [params, setParams] = useSearchParams()
    const { invoiceId } = useParams()
    const navigate = useNavigate()
    const detailRef = useRef(null)
    const token = localStorage.getItem('token')
    const can = (permission) => user.role === 'admin' || user.permissions?.includes(permission)
    const load = useCallback(
        async (signal) => {
            setLoading(true)
            try {
                const { data } = await axios.get(`${url}/api/order/invoices`, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 15000,
                    signal,
                })
                if (!signal?.aborted) {
                    setInvoices(data.data)
                    setError('')
                }
            } catch (error) {
                if (!axios.isCancel(error))
                    setError(error.response?.data?.message || 'Không tải được hóa đơn. Vui lòng thử lại.')
            } finally {
                if (!signal?.aborted) setLoading(false)
            }
        },
        [url, token],
    )
    useEffect(() => {
        const controller = new AbortController()
        load(controller.signal)
        return () => controller.abort()
    }, [load])
    useEffect(() => {
        if (invoiceId && !loading && window.matchMedia('(max-width: 1000px)').matches)
            detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [invoiceId, loading])
    const changeFilter = (key, value) =>
        setParams(
            (previous) => {
                const next = new URLSearchParams(previous)
                if (value) next.set(key, value)
                else next.delete(key)
                if (key !== 'page') next.delete('page')
                return next
            },
            { replace: true },
        )
    const markPaid = async (invoice) => {
        if (
            !window.confirm(
                `Xác nhận đã thu đủ ${formatMoney(invoice.amount)} tiền COD cho hóa đơn ${invoice.invoiceCode}?`,
            )
        )
            return
        setSaving(true)
        setError('')
        try {
            const { data } = await axios.post(
                `${url}/api/order/payment`,
                {
                    orderId: invoice.orderId,
                    amountReceived: invoice.amount,
                },
                { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 },
            )
            setInvoices((previous) =>
                previous.map((item) =>
                    item._id === invoice._id
                        ? {
                              ...item,
                              ...data.invoice,
                              order: { ...item.order, status: data.data.status },
                          }
                        : item,
                ),
            )
            toast.success('Đã ghi nhận thanh toán COD.')
        } catch (error) {
            await load()
            setError(
                error.response?.data?.message ||
                    'Chưa nhận được kết quả thu tiền. Kiểm tra trạng thái trước khi thử lại.',
            )
        } finally {
            setSaving(false)
        }
    }
    const status = params.get('status') || ''
    const search = (params.get('search') || '').trim().toLocaleLowerCase('vi')
    const from = params.get('from') || ''
    const to = params.get('to') || ''
    let conditions = [],
        filterError = ''
    try {
        if (status && !Object.hasOwn(paymentNames, status))
            throw new Error('Trạng thái thanh toán không hợp lệ.')
        if ((from && !isDate(from)) || (to && !isDate(to))) throw new Error('Ngày lọc không hợp lệ.')
        if (from && to && from > to) throw new Error('Từ ngày phải trước hoặc bằng đến ngày.')
        conditions = readConditions(params.get('conditions'))
    } catch (error) {
        filterError = error instanceof SyntaxError ? 'Điều kiện nâng cao không hợp lệ.' : error.message
    }
    const rows = filterError
        ? []
        : invoices.filter((invoice) => {
              const day = dayKey(invoice.createdAt)
              return (
                  (!status || invoice.paymentStatus === status) &&
                  (!from || day >= from) &&
                  (!to || day <= to) &&
                  [
                      invoice.invoiceCode,
                      invoice.orderCode,
                      invoice.address?.name,
                      invoice.address?.phone,
                      invoice.address?.email,
                  ].some((value) => value?.toLocaleLowerCase('vi').includes(search)) &&
                  conditions.every(({ field, operator, value }) =>
                      compare(
                          field === 'createdAt'
                              ? day
                              : field === 'paymentStatus'
                                ? invoice[field]
                                : toCents(invoice[field]),
                          operator,
                          field === 'createdAt' || field === 'paymentStatus' ? value : toCents(Number(value)),
                      ),
                  )
              )
          })
    const total = (items) => items.reduce((sum, invoice) => sum + toCents(invoice.amount), 0) / 100
    const pages = Math.max(1, Math.ceil(rows.length / 20))
    const page = Math.min(pages, Math.max(1, Math.trunc(Number(params.get('page'))) || 1))
    const listUrl = `/invoices${params.size ? `?${params}` : ''}`
    const selectInvoice = (id) => navigate(`/invoices/${id}${params.size ? `?${params}` : ''}`)
    const selected = invoices.find((invoice) => invoice._id === invoiceId)
    const paymentBadge = (invoice) => (
        <span className={`badge ${invoice.paymentStatus === 'PAID' ? 'badge-green' : 'badge-amber'}`}>
            {paymentNames[invoice.paymentStatus]}
        </span>
    )
    return (
        <div className="invoices-page">
            <div className="page-heading">
                <div>
                    <h1>Hóa đơn</h1>
                    <p>
                        {invoiceId
                            ? 'Thông tin được lưu tại thời điểm xác nhận đơn hàng.'
                            : 'Tra cứu hóa đơn và theo dõi thanh toán COD.'}
                    </p>
                </div>
                <div className="toolbar">
                    <button
                        className="button button-light"
                        disabled={loading || saving}
                        onClick={() => load()}
                    >
                        Làm mới
                    </button>
                </div>
            </div>
            {error && (
                <p className="form-error invoice-alert" role="alert">
                    {error}
                </p>
            )}
            {loading ? (
                <section className="panel empty-state">Đang tải hóa đơn…</section>
            ) : (
                <div className={`invoice-workspace ${invoiceId ? 'has-selection' : ''}`}>
                    <div className="invoice-main">
                        <section className="panel">
                            <div className="invoice-filters">
                                <div className="invoice-tabs" aria-label="Trạng thái thanh toán">
                                    {[['', 'Tất cả'], ...Object.entries(paymentNames)].map(
                                        ([value, name]) => (
                                            <button
                                                key={value}
                                                className={status === value ? 'active' : ''}
                                                aria-pressed={status === value}
                                                onClick={() => changeFilter('status', value)}
                                            >
                                                {name}
                                                <span>
                                                    {value
                                                        ? invoices.filter(
                                                              (invoice) => invoice.paymentStatus === value,
                                                          ).length
                                                        : invoices.length}
                                                </span>
                                            </button>
                                        ),
                                    )}
                                </div>
                                <div className="invoice-search">
                                    <label className="field">
                                        Tìm hóa đơn
                                        <input
                                            placeholder="Mã hóa đơn, mã đơn, tên, số điện thoại…"
                                            value={params.get('search') || ''}
                                            onChange={(event) => changeFilter('search', event.target.value)}
                                        />
                                    </label>
                                    <label className="field">
                                        Từ ngày
                                        <input
                                            type="date"
                                            value={from}
                                            onChange={(event) => changeFilter('from', event.target.value)}
                                        />
                                    </label>
                                    <label className="field">
                                        Đến ngày
                                        <input
                                            type="date"
                                            value={to}
                                            onChange={(event) => changeFilter('to', event.target.value)}
                                        />
                                    </label>
                                    <button
                                        className="button button-light"
                                        onClick={() => {
                                            setParams({})
                                            setDraftConditions([])
                                            setAdvancedError('')
                                        }}
                                    >
                                        Xóa bộ lọc
                                    </button>
                                </div>
                                <details className="invoice-advanced">
                                    <summary
                                        onClick={(event) => {
                                            if (!event.currentTarget.parentElement.open) {
                                                setDraftConditions(conditions)
                                                setAdvancedError('')
                                            }
                                        }}
                                    >
                                        Tìm kiếm nâng cao
                                        {conditions.length ? ` (${conditions.length} điều kiện)` : ''}
                                    </summary>
                                    <form
                                        onSubmit={(event) => {
                                            event.preventDefault()
                                            try {
                                                readConditions(JSON.stringify(draftConditions))
                                                changeFilter(
                                                    'conditions',
                                                    draftConditions.length
                                                        ? JSON.stringify(draftConditions)
                                                        : '',
                                                )
                                                setAdvancedError('')
                                            } catch (error) {
                                                setAdvancedError(error.message)
                                            }
                                        }}
                                    >
                                        {draftConditions.map((rule, index) => (
                                            <div className="invoice-condition" key={index}>
                                                <label className="field">
                                                    Trường
                                                    <select
                                                        value={rule.field}
                                                        onChange={(event) =>
                                                            setDraftConditions((previous) =>
                                                                previous.map((item, i) =>
                                                                    i === index
                                                                        ? {
                                                                              field: event.target.value,
                                                                              operator: 'eq',
                                                                              value:
                                                                                  event.target.value ===
                                                                                  'paymentStatus'
                                                                                      ? 'UNPAID'
                                                                                      : '',
                                                                          }
                                                                        : item,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        {Object.entries(fields).map(([key, name]) => (
                                                            <option key={key} value={key}>
                                                                {name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="field">
                                                    So sánh
                                                    <select
                                                        value={rule.operator}
                                                        onChange={(event) =>
                                                            setDraftConditions((previous) =>
                                                                previous.map((item, i) =>
                                                                    i === index
                                                                        ? {
                                                                              ...item,
                                                                              operator: event.target.value,
                                                                          }
                                                                        : item,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        {Object.entries(operators)
                                                            .filter(
                                                                ([key]) =>
                                                                    rule.field !== 'paymentStatus' ||
                                                                    ['eq', 'ne'].includes(key),
                                                            )
                                                            .map(([key, name]) => (
                                                                <option key={key} value={key}>
                                                                    {name}
                                                                </option>
                                                            ))}
                                                    </select>
                                                </label>
                                                <label className="field">
                                                    Giá trị
                                                    {rule.field === 'paymentStatus' ? (
                                                        <select
                                                            value={rule.value}
                                                            onChange={(event) =>
                                                                setDraftConditions((previous) =>
                                                                    previous.map((item, i) =>
                                                                        i === index
                                                                            ? {
                                                                                  ...item,
                                                                                  value: event.target.value,
                                                                              }
                                                                            : item,
                                                                    ),
                                                                )
                                                            }
                                                        >
                                                            {Object.entries(paymentNames).map(
                                                                ([key, name]) => (
                                                                    <option key={key} value={key}>
                                                                        {name}
                                                                    </option>
                                                                ),
                                                            )}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            required
                                                            type={
                                                                rule.field === 'createdAt' ? 'date' : 'number'
                                                            }
                                                            min={rule.field === 'createdAt' ? undefined : '0'}
                                                            step={
                                                                rule.field === 'createdAt'
                                                                    ? undefined
                                                                    : '0.01'
                                                            }
                                                            value={rule.value}
                                                            onChange={(event) =>
                                                                setDraftConditions((previous) =>
                                                                    previous.map((item, i) =>
                                                                        i === index
                                                                            ? {
                                                                                  ...item,
                                                                                  value: event.target.value,
                                                                              }
                                                                            : item,
                                                                    ),
                                                                )
                                                            }
                                                        />
                                                    )}
                                                </label>
                                                <button
                                                    className="button button-light button-danger"
                                                    type="button"
                                                    aria-label={`Bỏ điều kiện ${index + 1}`}
                                                    onClick={() =>
                                                        setDraftConditions((previous) =>
                                                            previous.filter((_, i) => i !== index),
                                                        )
                                                    }
                                                >
                                                    Bỏ
                                                </button>
                                            </div>
                                        ))}
                                        {advancedError && (
                                            <p className="form-error" role="alert">
                                                {advancedError}
                                            </p>
                                        )}
                                        <div className="toolbar">
                                            <button
                                                type="button"
                                                className="button button-light"
                                                disabled={draftConditions.length >= 12}
                                                onClick={() =>
                                                    setDraftConditions((previous) => [
                                                        ...previous,
                                                        {
                                                            field: 'amount',
                                                            operator: 'gte',
                                                            value: '',
                                                        },
                                                    ])
                                                }
                                            >
                                                Thêm điều kiện
                                            </button>
                                            <button className="button">Áp dụng điều kiện</button>
                                        </div>
                                    </form>
                                </details>
                                {filterError && (
                                    <p className="form-error" role="alert">
                                        {filterError}
                                    </p>
                                )}
                                <div className="invoice-summary">
                                    <strong>
                                        {rows.length} hóa đơn · Tổng phải thanh toán:{' '}
                                        {formatMoney(total(rows))}
                                    </strong>
                                    <span>
                                        Chưa thanh toán:{' '}
                                        {formatMoney(
                                            total(
                                                rows.filter((invoice) => invoice.paymentStatus === 'UNPAID'),
                                            ),
                                        )}
                                    </span>
                                    <span>
                                        Đã thanh toán:{' '}
                                        {formatMoney(
                                            total(rows.filter((invoice) => invoice.paymentStatus === 'PAID')),
                                        )}
                                    </span>
                                </div>
                            </div>
                            {!rows.length ? (
                                <div className="empty-state">
                                    {filterError
                                        ? 'Vui lòng sửa điều kiện lọc.'
                                        : 'Không có hóa đơn phù hợp.'}
                                </div>
                            ) : (
                                <div className="table-scroll">
                                    <table className="data-table invoices-table">
                                        <thead>
                                            <tr>
                                                <th>Hóa đơn / Mã đơn</th>
                                                <th>Khách hàng</th>
                                                <th className="invoice-date">Ngày lập</th>
                                                <th>Tổng tiền</th>
                                                <th className="invoice-payment">Thanh toán</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.slice((page - 1) * 20, page * 20).map((invoice) => (
                                                <tr
                                                    key={invoice._id}
                                                    className={invoiceId === invoice._id ? 'selected' : ''}
                                                    aria-selected={invoiceId === invoice._id}
                                                    aria-controls="invoice-detail"
                                                    tabIndex={0}
                                                    onClick={(event) => {
                                                        if (!event.target.closest('a, button'))
                                                            selectInvoice(invoice._id)
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.target === event.currentTarget &&
                                                            ['Enter', ' '].includes(event.key)
                                                        ) {
                                                            event.preventDefault()
                                                            selectInvoice(invoice._id)
                                                        }
                                                    }}
                                                >
                                                    <td>
                                                        <Link
                                                            className="invoice-code"
                                                            to={`/invoices/${invoice._id}${params.size ? `?${params}` : ''}`}
                                                        >
                                                            {invoice.invoiceCode}
                                                        </Link>
                                                        <small>{invoice.orderCode}</small>
                                                        <span className="invoice-row-status">
                                                            {paymentBadge(invoice)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {invoice.address?.name || 'Khách vãng lai'}
                                                        </strong>
                                                        <small>{invoice.address?.phone}</small>
                                                    </td>
                                                    <td className="invoice-date">
                                                        {dateText(invoice.createdAt)}
                                                    </td>
                                                    <td>
                                                        <strong>{formatMoney(invoice.amount)}</strong>
                                                    </td>
                                                    <td className="invoice-payment">
                                                        {paymentBadge(invoice)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div className="panel-heading invoice-pagination">
                                <span>
                                    {rows.length} hóa đơn · Trang {page}/{pages}
                                </span>
                                <div className="toolbar">
                                    <button
                                        className="button button-light"
                                        disabled={page <= 1}
                                        onClick={() => changeFilter('page', String(page - 1))}
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
                        <p className="muted invoice-note">
                            Tổng hóa đơn không phải doanh thu. Doanh thu chỉ ghi nhận khi đơn hoàn thành và
                            hóa đơn đã thanh toán.
                        </p>
                    </div>
                    {invoiceId && (
                        <section
                            className="invoice-sub"
                            id="invoice-detail"
                            aria-label="Chi tiết hóa đơn"
                            ref={detailRef}
                            tabIndex={-1}
                        >
                            <div className="invoice-sub-heading">
                                <h2>{selected?.invoiceCode || 'Chi tiết hóa đơn'}</h2>
                                <button
                                    className="button button-light"
                                    aria-label="Đóng chi tiết hóa đơn"
                                    onClick={() => navigate(listUrl)}
                                >
                                    Đóng ×
                                </button>
                            </div>
                            {selected ? (
                                <div className="invoice-detail-grid">
                                    <section className="panel">
                                        <div className="panel-heading">
                                            <h2>Chi tiết hóa đơn</h2>
                                            {paymentBadge(selected)}
                                        </div>
                                        <div className="panel-body invoice-meta">
                                            <dl>
                                                <div>
                                                    <dt>Mã đơn</dt>
                                                    <dd>
                                                        {can('order.view') || can('order.deliver') ? (
                                                            <Link to={`/orders/${selected.orderId}`}>
                                                                {selected.orderCode}
                                                            </Link>
                                                        ) : (
                                                            selected.orderCode
                                                        )}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Ngày lập</dt>
                                                    <dd>{dateText(selected.createdAt)}</dd>
                                                </div>
                                                <div>
                                                    <dt>Người lập</dt>
                                                    <dd>{selected.createdByName || 'Chưa ghi nhận'}</dd>
                                                </div>
                                            </dl>
                                            <dl>
                                                <div>
                                                    <dt>Khách hàng</dt>
                                                    <dd>{selected.address?.name}</dd>
                                                </div>
                                                <div>
                                                    <dt>Số điện thoại</dt>
                                                    <dd>{selected.address?.phone}</dd>
                                                </div>
                                                <div>
                                                    <dt>Địa chỉ</dt>
                                                    <dd>{selected.address?.address}</dd>
                                                </div>
                                                {selected.address?.email && (
                                                    <div>
                                                        <dt>Email</dt>
                                                        <dd>{selected.address.email}</dd>
                                                    </div>
                                                )}
                                            </dl>
                                        </div>
                                        <div className="table-scroll">
                                            <table className="data-table invoice-items">
                                                <thead>
                                                    <tr>
                                                        <th>Món ăn</th>
                                                        <th>Số lượng</th>
                                                        <th>Đơn giá</th>
                                                        <th>Thành tiền</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selected.items.map((item, index) => (
                                                        <tr key={item.productId || index}>
                                                            <td>{item.name}</td>
                                                            <td>{item.quantity}</td>
                                                            <td>{formatMoney(item.price)}</td>
                                                            <td>
                                                                {formatMoney(
                                                                    (toCents(item.price) * item.quantity) /
                                                                        100,
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <dl className="invoice-totals">
                                            <div>
                                                <dt>Tiền món</dt>
                                                <dd>{formatMoney(selected.subtotal)}</dd>
                                            </div>
                                            <div>
                                                <dt>Phí giao hàng</dt>
                                                <dd>{formatMoney(selected.deliveryFee)}</dd>
                                            </div>
                                            <div>
                                                <dt>Tổng trước giảm</dt>
                                                <dd>{formatMoney(selected.totalBeforeDiscount)}</dd>
                                            </div>
                                            <div>
                                                <dt>Giảm giá{selected.promotionCode ? ` (${selected.promotionCode})` : ''}</dt>
                                                <dd>−{formatMoney(selected.discountAmount)}</dd>
                                            </div>
                                            <div className="invoice-grand-total">
                                                <dt>Phải thanh toán</dt>
                                                <dd>{formatMoney(selected.amount)}</dd>
                                            </div>
                                        </dl>
                                    </section>
                                    <aside className="panel">
                                        <div className="panel-heading">
                                            <h2>Thanh toán</h2>
                                            {paymentBadge(selected)}
                                        </div>
                                        <div className="panel-body">
                                            <dl className="invoice-info">
                                                <div>
                                                    <dt>Phương thức</dt>
                                                    <dd>COD</dd>
                                                </div>
                                                <div>
                                                    <dt>Trạng thái đơn</dt>
                                                    <dd>
                                                        {orderNames[selected.order?.status] ||
                                                            'Không có dữ liệu đơn'}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Người giao</dt>
                                                    <dd>
                                                        {selected.order?.deliveryStaffName ||
                                                            'Chưa phân công'}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Số tiền phải thu</dt>
                                                    <dd>
                                                        <strong>{formatMoney(selected.amount)}</strong>
                                                    </dd>
                                                </div>
                                                {selected.paymentStatus === 'PAID' && (
                                                    <>
                                                        <div>
                                                            <dt>Đã thu</dt>
                                                            <dd>{formatMoney(selected.paidAmount)}</dd>
                                                        </div>
                                                        <div>
                                                            <dt>Người thu</dt>
                                                            <dd>{selected.paidByName || 'Chưa ghi nhận'}</dd>
                                                        </div>
                                                        <div>
                                                            <dt>Thời điểm thu</dt>
                                                            <dd>{dateText(selected.paidAt)}</dd>
                                                        </div>
                                                    </>
                                                )}
                                            </dl>
                                            {selected.paymentStatus === 'UNPAID' && (
                                                <>
                                                    <p className="muted invoice-note">
                                                        Hóa đơn chưa thanh toán chưa được tính vào doanh thu,
                                                        kể cả khi đơn đã hoàn thành.
                                                    </p>
                                                    {can('invoice.markPaid') &&
                                                    ['DELIVERING', 'COMPLETED'].includes(
                                                        selected.order?.status,
                                                    ) &&
                                                    selected.order?.deliveryStaffId ? (
                                                        <>
                                                            <p className="invoice-note">
                                                                Chỉ xác nhận khi đã nhận đủ{' '}
                                                                {formatMoney(selected.amount)} từ khách. Số
                                                                tiền cố định theo hóa đơn.
                                                            </p>
                                                            <button
                                                                className="button invoice-pay"
                                                                disabled={saving || Boolean(error)}
                                                                onClick={() => markPaid(selected)}
                                                            >
                                                                {saving
                                                                    ? 'Đang ghi nhận…'
                                                                    : 'Ghi nhận đã thanh toán COD'}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <p className="muted invoice-note">
                                                            {can('invoice.markPaid')
                                                                ? 'Có thể ghi nhận COD khi đơn đã được phân công và đang giao hoặc đã hoàn thành.'
                                                                : 'Bạn chưa được cấp quyền ghi nhận thanh toán COD.'}
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </aside>
                                </div>
                            ) : (
                                <section className="panel empty-state">
                                    {error
                                        ? 'Chưa tải được hóa đơn.'
                                        : 'Không tìm thấy hóa đơn hoặc bạn chưa được cấp quyền xem.'}
                                </section>
                            )}
                        </section>
                    )}
                </div>
            )}
        </div>
    )
}

export default Invoices
