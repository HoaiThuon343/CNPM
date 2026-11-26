import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { formatMoney } from '../../../../shared/money.js'

const dateDisplay = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
})
const toVietnamInput = (value) => value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16) : ''
const promotionValue = (item) => item.type === 'percent' ? `${item.value}%` : formatMoney(item.value)
const errorMessage = (error) => error.response?.data?.message || 'Không kết nối được máy chủ. Vui lòng thử lại.'

function PromotionForm({ item, busy, onClose, onSave }) {
    const [type, setType] = useState(item.type || 'percent')
    const locked = item.hasBeenUsed
    const submit = (event) => {
        event.preventDefault()
        const data = Object.fromEntries(new FormData(event.currentTarget))
        onSave({
            ...data, type, active: data.active === 'on',
            startsAt: `${data.startsAt}:00+07:00`,
            endsAt: `${data.endsAt}:00+07:00`,
        })
    }
    return (
        <section className="panel">
            <div className="panel-heading"><h2>{item._id ? 'Sửa chương trình' : 'Tạo chương trình'}</h2></div>
            <form className="panel-body" onSubmit={submit}>
                <div className="form-grid">
                    <label className="field">Mã ưu đãi
                        <input name="code" required maxLength={24} pattern={'[A-Za-z0-9_\\-]+'} defaultValue={item.code} />
                    </label>
                    <label className="field">Tên chương trình
                        <input name="name" required maxLength={120} defaultValue={item.name} />
                    </label>
                    <label className="field full">Mô tả
                        <textarea name="description" rows={2} maxLength={500} defaultValue={item.description} />
                    </label>
                    <label className="field">Loại giảm
                        <select value={type} disabled={locked} onChange={(event) => setType(event.target.value)}>
                            <option value="percent">Theo phần trăm</option><option value="fixed">Số tiền cố định</option>
                        </select>
                    </label>
                    <label className="field">Giá trị giảm ({type === 'percent' ? '%' : 'USD'})
                        <input name="value" type="number" min="0.01" max={type === 'percent' ? 100 : undefined}
                            step="0.01" required defaultValue={item.value} readOnly={locked} />
                    </label>
                    <label className="field">Tiền món tối thiểu (USD)
                        <input name="minimum" type="number" min="0" step="0.01" required defaultValue={item.minimum ?? 0} readOnly={locked} />
                    </label>
                    {type === 'percent' && (
                        <label className="field">Mức giảm tối đa (USD)
                            <input name="maximumDiscount" type="number" min="0.01" step="0.01"
                                defaultValue={item.maximumDiscount ?? ''} placeholder="Để trống nếu không giới hạn" readOnly={locked} />
                        </label>
                    )}
                    <label className="field">Bắt đầu (giờ Việt Nam)
                        <input name="startsAt" type="datetime-local" required defaultValue={toVietnamInput(item.startsAt)} />
                    </label>
                    <label className="field">Kết thúc (giờ Việt Nam)
                        <input name="endsAt" type="datetime-local" required defaultValue={toVietnamInput(item.endsAt)} />
                    </label>
                    <label className="field">Số lượt tối đa
                        <input name="usageLimit" type="number" required min={item.usedCount ?? 0} step="1" defaultValue={item.usageLimit} />
                    </label>
                    {!item._id && <label><input name="active" type="checkbox" /> Bật chương trình</label>}
                </div>
                {locked && <p className="muted">Điều kiện giảm giá đã khóa vì chương trình từng được áp dụng.</p>}
                <div className="form-actions">
                    <button type="button" className="button button-light" onClick={onClose} disabled={busy}>Đóng</button>
                    <button className="button" disabled={busy}>Lưu chương trình</button>
                </div>
            </form>
        </section>
    )
}

export default function Promotions({ url }) {
    const [promotions, setPromotions] = useState([])
    const [form, setForm] = useState(null)
    const [historyId, setHistoryId] = useState('')
    const [history, setHistory] = useState(null)
    const [search, setSearch] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const endpoint = `${url}/api/promotions`
    const token = localStorage.getItem('token')
    const list = useCallback(async (signal) => {
        setLoading(true)
        setError('')
        try {
            const { data } = await axios.get(endpoint, { signal, headers: { Authorization: `Bearer ${token}` } })
            setPromotions(data.data)
        } catch (error) {
            if (!axios.isCancel(error)) setError(errorMessage(error))
        } finally {
            if (!signal?.aborted) setLoading(false)
        }
    }, [endpoint, token])

    useEffect(() => {
        const controller = new AbortController()
        list(controller.signal)
        return () => controller.abort()
    }, [list])

    useEffect(() => {
        if (!historyId) return
        const controller = new AbortController()
        axios.get(`${endpoint}/${historyId}/history`, {
            signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
        })
            .then(({ data }) => setHistory({ orders: data.data.orders, usedCount: data.data.usedCount }))
            .catch((error) => { if (!axios.isCancel(error)) setHistory({ error: errorMessage(error) }) })
        return () => controller.abort()
    }, [endpoint, historyId, token])

    const save = async (method, suffix, values, closeForm = false) => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
            const { data } = await axios({ method, url: endpoint + suffix, data: values,
                headers: { Authorization: `Bearer ${token}` } })
            setPromotions((previous) => previous.some((item) => item._id === data.data._id)
                ? previous.map((item) => item._id === data.data._id ? data.data : item)
                : [data.data, ...previous])
            if (closeForm) setForm(null)
            toast.success('Đã lưu chương trình.')
        } catch (error) {
            setError(errorMessage(error))
        } finally {
            setBusy(false)
        }
    }
    const selected = promotions.find((item) => item._id === historyId)
    const keyword = search.trim().toLocaleLowerCase('vi')
    const visible = promotions.filter((item) => [item.code, item.name].some((value) => value.toLocaleLowerCase('vi').includes(keyword)))
    const changeHistory = (id) => {
        if (id === historyId) return
        setHistory(null)
        setHistoryId(id)
    }
    return (
        <div className="promotions-page">
            <div className="page-heading">
                <h1>Ưu đãi và mã giảm giá</h1>
                <div className="toolbar">
                    <button className="button button-light" disabled={loading || busy} onClick={() => { changeHistory(''); list() }}>Làm mới</button>
                    <button className="button" disabled={busy} onClick={() => { setError(''); setForm({}) }}>Tạo chương trình</button>
                </div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {form && <PromotionForm key={form._id || 'new'} item={form} busy={busy}
                onClose={() => setForm(null)}
                onSave={(values) => save(form._id ? 'put' : 'post', form._id ? `/${form._id}` : '', values, true)} />}
            <section className="panel">
                <div className="panel-heading toolbar">
                    <input type="search" aria-label="Tìm chương trình" placeholder="Tìm mã hoặc tên" value={search}
                        onChange={(event) => setSearch(event.target.value)} />
                </div>
                {loading ? <p className="empty-state">Đang tải…</p> : visible.length === 0 ?
                    <p className="empty-state">Chưa có chương trình phù hợp.</p> : (
                        <div className="table-scroll">
                            <table className="data-table">
                                <thead><tr><th>Chương trình</th><th>Giá trị giảm</th><th>Thời gian áp dụng</th><th>Lượt dùng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                                <tbody>{visible.map((item) => (
                                    <tr key={item._id}>
                                        <td><strong>{item.code}</strong><br />{item.name}</td>
                                        <td>{promotionValue(item)}</td>
                                        <td>{dateDisplay.format(new Date(item.startsAt))}<br />{dateDisplay.format(new Date(item.endsAt))}</td>
                                        <td>{item.usedCount}/{item.usageLimit}</td>
                                        <td>{Date.parse(item.endsAt) <= Date.now() ? 'Hết hạn' : item.active ? 'Đã bật' : 'Đã tắt'}</td>
                                        <td>
                                            <div className="toolbar">
                                                <button className="button button-light" disabled={busy} onClick={() => { setError(''); setForm(item) }}>Sửa</button>
                                                <button className="button button-light" disabled={busy}
                                                    onClick={() => save('patch', `/${item._id}/status`, { active: !item.active })}>{item.active ? 'Tắt' : 'Bật'}</button>
                                                <button className="button button-link" onClick={() => changeHistory(item._id)}>Lịch sử</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
            </section>
            {selected && (
                <section className="panel">
                    <div className="panel-heading">
                        <div><h2>Lịch sử {selected.code}</h2><p>{history?.usedCount ?? selected.usedCount}/{selected.usageLimit} lượt đã dùng</p></div>
                        <button className="button button-light" onClick={() => changeHistory('')}>Đóng</button>
                    </div>
                    {!history ? <p className="empty-state">Đang tải lịch sử…</p> : history.error ?
                        <p className="panel-body form-error" role="alert">{history.error}</p> : !history.orders.length ?
                            <p className="empty-state">Chưa có đơn áp dụng.</p> : (
                                <div className="table-scroll">
                                    <table className="data-table">
                                        <thead><tr><th>Mã đơn</th><th>Thời điểm áp dụng</th><th>Giảm giá</th><th>Phải thu</th><th>Lượt sử dụng</th></tr></thead>
                                        <tbody>{history.orders.map((order) => (
                                            <tr key={order._id}>
                                                <td>{order.orderCode || order._id}</td><td>{dateDisplay.format(new Date(order.date))}</td>
                                                <td>{formatMoney(order.discountAmount)}</td><td>{formatMoney(order.amount)}</td>
                                                <td>{order.status === 'CANCELLED' ? 'Đã hoàn lượt' : 'Đã sử dụng'}</td>
                                            </tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            )}
                </section>
            )}
        </div>
    )
}
