import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { formatMoney, toCents } from '../../../../shared/money.js'
import './Inventory.css'

const titles = {
    stock: 'Tồn kho', ingredients: 'Nguyên liệu', suppliers: 'Nhà cung cấp', purchases: 'Phiếu nhập',
}
const purchaseStatuses = { DRAFT: 'Chưa xác nhận', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy' }
const supplierStatuses = { active: 'Đang hoạt động', inactive: 'Ngừng hợp tác' }
const ingredientStatuses = { active: 'Đang sử dụng', inactive: 'Ngừng sử dụng' }
const dateText = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
const dayKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
const quantityText = (value) => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 3 })
const message = (error) => error.response?.data?.message || 'Không kết nối được máy chủ. Vui lòng thử lại.'
const matches = (keyword, ...values) => values.some((value) => value?.toLocaleLowerCase('vi').includes(keyword))
const emptyLine = () => ({ ingredientId: '', quantity: '1', unitPrice: '0' })
const vndNumber = new Intl.NumberFormat('vi-VN', { useGrouping: 'always', maximumFractionDigits: 0 })
const purchaseMoney = (value, currency) => currency === 'VND' ? `${vndNumber.format(value)} đ` : formatMoney(value)
const parseVnd = (value) => {
    const text = String(value).trim()
    if (!/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(text)) return null
    const amount = Number(text.replaceAll('.', ''))
    return amount <= 10_000_000 ? amount : null
}
const lineMinor = ({ quantity, unitPrice }, isVnd) => {
    try {
        const price = isVnd ? parseVnd(unitPrice) : toCents(unitPrice)
        const units = Number(quantity)
        if (price === null || !Number.isFinite(units) || units <= 0 || units > 100_000) return null
        return Math.round(Math.round(units * 1000) * price / 1000)
    } catch {
        return null
    }
}

const Table = ({ columns, children }) => (
    <div className="table-scroll">
        <table className="data-table">
            <thead><tr>{columns.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{children}</tbody>
        </table>
    </div>
)

const Badge = ({ status, labels }) => (
    <span className={`badge ${['active', 'CONFIRMED'].includes(status) ? 'badge-green' : status === 'DRAFT' ? 'badge-amber' : 'badge-gray'}`}>
        {labels[status]}
    </span>
)

const CatalogForm = ({ item, supplier, onSubmit }) => (
    <form className="form-grid" id="inventory-form" onSubmit={(event) => {
        event.preventDefault()
        onSubmit(Object.fromEntries(new FormData(event.currentTarget)))
    }}>
        <label className="field">Mã<input name="code" required maxLength={25} defaultValue={item.code} readOnly={Boolean(item._id)} /></label>
        <label className="field">Tên<input name="name" required maxLength={150} defaultValue={item.name} /></label>
        {supplier ? (
            <>
                <label className="field">Người liên hệ<input name="contact" maxLength={100} defaultValue={item.contact} /></label>
                <label className="field">Số điện thoại<input name="phone" type="tel" required maxLength={30} defaultValue={item.phone} /></label>
                <label className="field">Email<input name="email" type="email" maxLength={150} defaultValue={item.email} /></label>
                <label className="field">Địa chỉ<input name="address" required maxLength={250} defaultValue={item.address} /></label>
            </>
        ) : (
            <>
                <label className="field">Đơn vị tính<input name="unit" required maxLength={25} defaultValue={item.unit} readOnly={item.stock > 0} placeholder="Ví dụ kg, lít" /></label>
                <label className="field">Mức tồn tối thiểu<input type="number" name="minimum" min="0" max="100000" step="0.001" required defaultValue={(item.minimum || 0) / 1000} /></label>
            </>
        )}
        <label className="field">Trạng thái
            <select name="status" defaultValue={item.status || 'active'}>
                {Object.entries(supplier ? supplierStatuses : ingredientStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
        </label>
        <label className="field full">{supplier ? 'Ghi chú' : 'Mô tả'}
            <textarea name={supplier ? 'note' : 'description'} maxLength={500} rows={3} defaultValue={supplier ? item.note : item.description} />
        </label>
    </form>
)

const PurchaseForm = ({ item, ingredients, suppliers, onSubmit }) => {
    const currency = item.currency || 'USD'
    const isVnd = currency === 'VND'
    const [items, setItems] = useState(() => (item.items || [emptyLine()]).map((line) => (
        isVnd ? { ...line, unitPrice: vndNumber.format(line.unitPrice) } : line
    )))
    const scale = isVnd ? 1 : 100
    const amounts = items.map((line) => lineMinor(line, isVnd))
    const total = amounts.includes(null) ? null : amounts.reduce((sum, amount) => sum + amount, 0)
    const displayAmount = (minor) => minor === null ? '—' : purchaseMoney(minor / scale, currency)
    const changeLine = (index, key, value) => {
        setItems((previous) => previous.map((line, i) => i === index ? { ...line, [key]: value } : line))
    }
    return (
        <form id="inventory-form" onSubmit={(event) => {
            event.preventDefault()
            if (total === null) return
            const lines = isVnd ? items.map((line) => ({ ...line, unitPrice: parseVnd(line.unitPrice) })) : items
            onSubmit({ ...Object.fromEntries(new FormData(event.currentTarget)), items: lines, revision: item.revision })
        }}>
            <label className="field">Nhà cung cấp
                <select name="supplierId" required defaultValue={suppliers.some((supplier) => supplier._id === item.supplierId) ? item.supplierId : ''}>
                    <option value="">Chọn nhà cung cấp</option>
                    {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
                </select>
            </label>
            {items.map((line, index) => {
                const unit = ingredients.find((ingredient) => ingredient._id === line.ingredientId)?.unit
                const vndPrice = isVnd ? parseVnd(line.unitPrice) : null
                const invalidPrice = isVnd && vndPrice === null && line.unitPrice !== ''
                return (
                    <div className="purchase-form-line" key={index}>
                        <label className="field">Nguyên liệu
                            <select required value={line.ingredientId} onChange={(event) => changeLine(index, 'ingredientId', event.target.value)}>
                                <option value="">Chọn nguyên liệu</option>
                                {ingredients.map((ingredient) => <option key={ingredient._id} value={ingredient._id}>{ingredient.name} ({ingredient.unit})</option>)}
                            </select>
                        </label>
                        <label className="field">Số lượng
                            <input type="number" min="0.001" max="100000" step="0.001" required value={line.quantity}
                                onChange={(event) => changeLine(index, 'quantity', event.target.value)} />
                        </label>
                        <label className="field">Đơn giá ({isVnd ? 'đ' : 'USD'}{unit ? `/${unit}` : ''})
                            {isVnd ? (
                                <input type="text" inputMode="numeric" required value={line.unitPrice} placeholder="Ví dụ 51.000"
                                    aria-invalid={invalidPrice} aria-describedby={invalidPrice ? `purchase-price-error-${index}` : undefined}
                                    onChange={(event) => changeLine(index, 'unitPrice', event.target.value)}
                                    onBlur={() => {
                                        if (vndPrice !== null) changeLine(index, 'unitPrice', vndNumber.format(vndPrice))
                                    }} />
                            ) : (
                                <input type="number" min="0" max="100000" step="0.01" required value={line.unitPrice}
                                    onChange={(event) => changeLine(index, 'unitPrice', event.target.value)} />
                            )}
                        </label>
                        <span>Thành tiền<br /><strong>{displayAmount(amounts[index])}</strong></span>
                        <button type="button" className="button button-light" aria-label={`Bỏ dòng ${index + 1}`} disabled={items.length === 1}
                            onClick={() => setItems((previous) => previous.filter((_, i) => i !== index))}>Bỏ</button>
                        {invalidPrice && <small id={`purchase-price-error-${index}`} className="purchase-price-error">
                            Nhập đơn giá từ 0 đến 10.000.000 đ, ví dụ 850 hoặc 51.000.
                        </small>}
                    </div>
                )
            })}
            <div className="toolbar purchase-form-total">
                <button type="button" className="button button-light" disabled={items.length >= 100}
                    onClick={() => setItems((previous) => [...previous, emptyLine()])}>Thêm dòng</button>
                <strong>Tổng tiền {displayAmount(total)}</strong>
            </div>
            <label className="field">Ghi chú<textarea name="note" maxLength={500} rows={3} defaultValue={item.note} /></label>
        </form>
    )
}

const Inventory = ({ url, user }) => {
    const { section = 'stock' } = useParams()
    const [params, setParams] = useSearchParams()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [form, setForm] = useState(null)
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)
    const detailRef = useRef(null)
    const formRef = useRef(null)
    const endpoint = `${url}/api/inventory`
    const token = localStorage.getItem('token')
    const can = (permission) => user.role === 'admin' || user.permissions?.includes(permission)
    const canEdit = can(section === 'purchases' ? 'purchase.edit' : 'inventory.manage')
    const isStock = section === 'stock'
    const isSupplier = section === 'suppliers'
    const isPurchase = section === 'purchases'
    const keyword = (params.get('q') || '').trim().toLocaleLowerCase('vi')
    const status = params.get('status') || ''
    const isHistory = isPurchase && status === 'CONFIRMED'
    const from = params.get('from') || ''
    const to = params.get('to') || ''
    const badRange = from && to && from > to
    const catalogStatuses = isSupplier ? supplierStatuses : ingredientStatuses
    const selected = Object.hasOwn(titles, section)
        ? data?.[section]?.find((item) => item._id === params.get('id'))
        : undefined
    const selectedId = selected?._id
    const formItem = form?.section === section ? form.item : null
    const config = { headers: { Authorization: `Bearer ${token}` } }

    useEffect(() => {
        const controller = new AbortController()
        axios.get(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
            .then(({ data }) => setData(data.data))
            .catch((error) => { if (!axios.isCancel(error)) setError(message(error)) })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [endpoint, token])

    useEffect(() => {
        if (selectedId && window.matchMedia('(max-width: 1000px)').matches) {
            detailRef.current?.scrollIntoView({ block: 'start' })
        }
    }, [selectedId, section])

    useEffect(() => {
        if (formItem) formRef.current?.scrollIntoView({ block: 'start' })
    }, [formItem])

    if (!Object.hasOwn(titles, section)) return <Navigate to="/inventory" replace />
    const { ingredients = [], suppliers = [], purchases = [] } = data || {}
    const activeIngredients = ingredients.filter((ingredient) => ingredient.status === 'active')
    const activeSuppliers = suppliers.filter((supplier) => supplier.status === 'active')
    const belowMinimum = (ingredient) => ingredient.stock < ingredient.minimum
    const lowCount = activeIngredients.filter(belowMinimum).length
    const query = (key, value) => {
        if (key === 'id' && (params.get('id') || '') === value) return
        const next = new URLSearchParams(params)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key !== 'page' && key !== 'id') next.delete('page')
        setParams(next, { replace: key !== 'id' })
    }
    const openForm = (item = {}) => {
        setFormError('')
        setForm({ section, item })
    }
    const reload = async () => {
        const response = await axios.get(endpoint, config)
        setData(response.data.data)
    }
    const refresh = async () => {
        setLoading(true)
        setError('')
        try { await reload() }
        catch (error) { setError(message(error)) }
        finally { setLoading(false) }
    }
    const updateRow = (item) => setData((previous) => {
        const list = previous[section]
        return { ...previous, [section]: list.some((row) => row._id === item._id) ?
            list.map((row) => row._id === item._id ? item : row) : [item, ...list] }
    })
    const save = async (values) => {
        if (saving) return
        setSaving(true)
        setFormError('')
        try {
            const path = `${endpoint}/${section}${formItem._id ? `/${formItem._id}` : ''}`
            const response = await axios[formItem._id ? 'put' : 'post'](path, values, config)
            updateRow(response.data.data)
            setForm(null)
            query('id', response.data.data._id)
            toast.success('Đã lưu dữ liệu.')
        } catch (error) { setFormError(message(error)) }
        finally { setSaving(false) }
    }
    const changePurchase = async (action) => {
        const confirm = action === 'confirm'
        if (saving || !window.confirm(confirm ? 'Xác nhận đã nhận đủ hàng theo phiếu và cộng tồn kho?' : 'Hủy phiếu nhập này?')) return
        setSaving(true)
        setError('')
        try {
            const response = await axios.post(`${endpoint}/purchases/${selected._id}/${action}`,
                { revision: selected.revision }, config)
            updateRow(response.data.data)
            toast.success(confirm ? 'Đã xác nhận phiếu và cộng tồn kho.' : 'Đã hủy phiếu nhập.')
            if (confirm) await reload()
        } catch (error) {
            setError(message(error))
        } finally {
            setSaving(false)
        }
    }
    const purchaseDate = (item) => isHistory ? item.confirmedAt : item.createdAt
    const rows = isPurchase ? purchases.filter((item) => !badRange &&
        (!status || item.status === status) &&
        (!params.get('supplier') || item.supplierId === params.get('supplier')) &&
        (!params.get('ingredient') || item.items.some((line) => line.ingredientId === params.get('ingredient'))) &&
        (!from || dayKey(purchaseDate(item)) >= from) && (!to || dayKey(purchaseDate(item)) <= to) &&
        matches(keyword, item.code, item.supplierName, item.createdByName, item.confirmedByName)
    ).sort((a, b) => purchaseDate(b).localeCompare(purchaseDate(a))) : (isSupplier ? suppliers : ingredients).filter((item) =>
        (!status || (status === 'low' ? item.status === 'active' && belowMinimum(item) : item.status === status)) &&
        matches(keyword, item.code, item.name, item.contact, item.email, item.phone, item.address)
    )
    const pages = Math.max(1, Math.ceil(rows.length / 20))
    const page = Math.min(pages, Math.max(1, Math.trunc(Number(params.get('page'))) || 1))
    const columns = isPurchase ?
        ['Mã phiếu', 'Nhà cung cấp', ...(!selected ? [isHistory ? 'Ngày xác nhận' : 'Ngày lập', 'Người lập'] : []), 'Tổng tiền', 'Trạng thái'] :
        isSupplier ? ['Mã', 'Nhà cung cấp', ...(!selected ? ['Điện thoại', 'Địa chỉ'] : []), 'Trạng thái'] :
            ['Mã', 'Nguyên liệu', ...(!selected ? ['Đơn vị', ...(isStock ? ['Tồn kho'] : []), 'Tối thiểu'] : []), 'Trạng thái']
    const detailFields = selected && (isPurchase ? {
        'Nhà cung cấp': selected.supplierName,
        'Ngày lập': dateText(selected.createdAt),
        'Người lập': selected.createdByName,
        'Người xác nhận': selected.confirmedByName,
        'Thời điểm xác nhận': selected.confirmedAt && dateText(selected.confirmedAt),
        'Ghi chú': selected.note,
    } : isSupplier ? {
        'Tên': selected.name, 'Người liên hệ': selected.contact, 'Điện thoại': selected.phone,
        'Email': selected.email, 'Địa chỉ': selected.address, 'Ghi chú': selected.note,
    } : {
        'Tên': selected.name, 'Đơn vị tính': selected.unit,
        'Tồn kho': quantityText(selected.stock / 1000),
        'Mức tồn tối thiểu': quantityText(selected.minimum / 1000),
        'Mô tả': selected.description,
    })

    return (
        <div className="inventory-page">
            <div className="page-heading">
                <h1>{titles[section]}</h1>
                <div className="toolbar">
                    <button className="button button-light" disabled={loading || saving} onClick={refresh}>Làm mới</button>
                    {!isStock && canEdit && (
                        <button className="button" disabled={loading || !data || saving || (isPurchase && (!activeSuppliers.length || !activeIngredients.length))}
                            onClick={() => openForm()}>{isPurchase ? 'Lập phiếu nhập' : `Thêm ${titles[section].toLocaleLowerCase('vi')}`}</button>
                    )}
                </div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {isPurchase && canEdit && data && (!activeSuppliers.length || !activeIngredients.length) && (
                <p>Cần có <Link to="/inventory/suppliers">nhà cung cấp đang hoạt động</Link> và <Link to="/inventory/ingredients">nguyên liệu đang sử dụng</Link> để lập phiếu nhập.</p>
            )}
            {isStock && data && (
                <p><span className={`badge ${lowCount ? 'badge-amber' : 'badge-green'}`}>
                    {lowCount ? `${lowCount} nguyên liệu dưới mức tồn tối thiểu` : 'Không có nguyên liệu dưới mức tồn tối thiểu'}
                </span></p>
            )}
            {formItem && (
                <section className="panel inventory-form" aria-label="Biểu mẫu kho hàng" ref={formRef}>
                    <div className="panel-heading"><h2>{formItem._id ? 'Chỉnh sửa' : 'Tạo mới'} {titles[section].toLocaleLowerCase('vi')}</h2></div>
                    <div className="panel-body">
                        <fieldset disabled={saving}>
                            {isPurchase ? <PurchaseForm key={formItem._id || 'new'} item={formItem} suppliers={activeSuppliers} ingredients={activeIngredients} onSubmit={save} /> :
                                <CatalogForm key={formItem._id || section} item={formItem} supplier={isSupplier} onSubmit={save} />}
                        </fieldset>
                        {formError && <p className="form-error" role="alert">{formError}</p>}
                        <div className="form-actions">
                            <button className="button button-light" disabled={saving} onClick={() => setForm(null)}>Đóng</button>
                            <button className="button" type="submit" form="inventory-form" disabled={saving}>Lưu{isPurchase ? ' phiếu nháp' : ''}</button>
                        </div>
                    </div>
                </section>
            )}
            <div className={`inventory-layout ${selected ? 'with-detail' : ''}`}>
                <section className="panel inventory-main">
                    {isPurchase && (
                        <div className="tabs inventory-tabs">
                            {[['', 'Tất cả'], ['CONFIRMED', 'Lịch sử nhập hàng']].map(([value, label]) => (
                                <button key={label} className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => query('status', value)}>{label}</button>
                            ))}
                        </div>
                    )}
                    <div className="inventory-filters">
                        <label className="field">Tìm kiếm
                            <input type="search" value={params.get('q') || ''} onChange={(event) => query('q', event.target.value)}
                                placeholder={isPurchase ? 'Mã phiếu, nhà cung cấp, nhân viên' : isSupplier ? 'Mã, tên, thông tin liên hệ' : 'Mã hoặc tên nguyên liệu'} />
                        </label>
                        <label className="field">Trạng thái
                            <select value={status} onChange={(event) => query('status', event.target.value)}>
                                <option value="">Tất cả</option>
                                {isStock && <option value="low">Dưới mức tối thiểu</option>}
                                {Object.entries(isPurchase ? purchaseStatuses : catalogStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                        {isPurchase && <>
                            <label className="field">Từ ngày<input type="date" value={from} onChange={(event) => query('from', event.target.value)} /></label>
                            <label className="field">Đến ngày<input type="date" value={to} onChange={(event) => query('to', event.target.value)} /></label>
                            <label className="field">Nhà cung cấp
                                <select value={params.get('supplier') || ''} onChange={(event) => query('supplier', event.target.value)}>
                                    <option value="">Tất cả</option>
                                    {suppliers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                                </select>
                            </label>
                            <label className="field">Nguyên liệu
                                <select value={params.get('ingredient') || ''} onChange={(event) => query('ingredient', event.target.value)}>
                                    <option value="">Tất cả</option>
                                    {ingredients.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                                </select>
                            </label>
                        </>}
                    </div>
                    {badRange && <p className="form-error panel-body" role="alert">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
                    {loading ? <div className="empty-state">Đang tải…</div> : !rows.length ?
                        <div className="empty-state">{data ? 'Không có kết quả phù hợp.' : 'Chưa tải được dữ liệu kho.'}</div> : (
                            <Table columns={columns}>
                                {rows.slice((page - 1) * 20, page * 20).map((item) => (
                                    <tr key={item._id} className={item._id === selectedId ? 'inventory-selected' : undefined}
                                        onClick={!isStock ? () => query('id', item._id) : undefined}>
                                        <td>{!isStock ?
                                            <button className="button-link" aria-expanded={item._id === selectedId}
                                                aria-controls={selected ? 'inventory-detail' : undefined}
                                                onClick={(event) => { event.stopPropagation(); query('id', item._id) }}>{item.code}</button> :
                                            <strong>{item.code}</strong>}</td>
                                        {isPurchase ? <>
                                            <td>{item.supplierName}</td>
                                            {!selected && <><td>{dateText(purchaseDate(item))}</td><td>{item.createdByName}</td></>}
                                            <td>{purchaseMoney(item.total, item.currency)}</td>
                                        </> : <>
                                            <td><strong>{item.name}</strong>{!selected && !isSupplier && item.description && <small>{item.description}</small>}</td>
                                            {!selected && (isSupplier ? <><td>{item.phone}</td><td>{item.address}</td></> : <>
                                                <td>{item.unit}</td>{isStock && <td><strong>{quantityText(item.stock / 1000)}</strong></td>}
                                                <td>{quantityText(item.minimum / 1000)}</td>
                                            </>)}
                                        </>}
                                        <td><Badge status={item.status} labels={isPurchase ? purchaseStatuses : catalogStatuses} />
                                            {isStock && item.status === 'active' && belowMinimum(item) && <span className="badge badge-amber">Cần nhập thêm</span>}</td>
                                    </tr>
                                ))}
                            </Table>
                        )}
                    {pages > 1 && <div className="panel-heading inventory-pagination">
                        <span>{rows.length} kết quả · Trang {page}/{pages}</span>
                        <div className="toolbar">
                            <button className="button button-light" disabled={page <= 1} onClick={() => query('page', page - 1)}>Trước</button>
                            <button className="button button-light" disabled={page >= pages} onClick={() => query('page', page + 1)}>Sau</button>
                        </div>
                    </div>}
                </section>
                {selected && (
                    <aside className="inventory-detail" id="inventory-detail" aria-label={`Chi tiết ${titles[section].toLocaleLowerCase('vi')}`} ref={detailRef}>
                        <div className="inventory-detail-heading">
                            <h2>{selected.code}</h2>
                            <button className="button button-light" onClick={() => query('id', '')}>Đóng ×</button>
                        </div>
                        <section className="panel">
                            <div className="panel-heading">
                                <h2>Chi tiết {titles[section].toLocaleLowerCase('vi')}</h2>
                                <Badge status={selected.status} labels={isPurchase ? purchaseStatuses : catalogStatuses} />
                            </div>
                            <div className="panel-body">
                                <dl className="inventory-info">
                                    {Object.entries(detailFields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
                                </dl>
                                {!isPurchase && <div className="toolbar">
                                    {isSupplier && <Link className="button button-light" to={`/inventory/purchases?supplier=${selected._id}&status=CONFIRMED`}>Lịch sử nhập hàng</Link>}
                                    {canEdit && <button className="button" disabled={saving} onClick={() => openForm(selected)}>Sửa {titles[section].toLocaleLowerCase('vi')}</button>}
                                </div>}
                            </div>
                            {isPurchase && <>
                                <Table columns={['Nguyên liệu', 'Số lượng', 'Đơn giá', 'Thành tiền']}>
                                    {selected.items.map((item) => <tr key={item.ingredientId}>
                                        <td>{item.name}</td><td>{quantityText(item.quantity)} {item.unit}</td>
                                        <td>{purchaseMoney(item.unitPrice, selected.currency)}</td><td>{purchaseMoney(item.amount, selected.currency)}</td>
                                    </tr>)}
                                </Table>
                                <div className="panel-body">
                                    <strong>Tổng tiền {purchaseMoney(selected.total, selected.currency)}</strong>
                                    {selected.status === 'DRAFT' && (canEdit || can('purchase.confirm')) && <div className="form-actions">
                                        {canEdit && <>
                                            <button className="button button-light" disabled={saving} onClick={() => openForm(selected)}>Sửa</button>
                                            <button className="button button-light button-danger" disabled={saving} onClick={() => changePurchase('cancel')}>Hủy phiếu</button>
                                        </>}
                                        {can('purchase.confirm') && <button className="button" disabled={saving} onClick={() => changePurchase('confirm')}>Xác nhận nhập</button>}
                                    </div>}
                                </div>
                            </>}
                        </section>
                    </aside>
                )}
            </div>
        </div>
    )
}

export default Inventory
