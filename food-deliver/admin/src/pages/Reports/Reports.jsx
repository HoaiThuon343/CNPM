import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { formatMoney } from '../../../../shared/money.js'
import { reportSections } from './reportSections'
import './Reports.css'

const cycles = { day: 'Ngày', month: 'Tháng', quarter: 'Quý', year: 'Năm' }
const paymentNames = { PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán' }
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })
const money = (value, currency) => currency === 'VND' ? `${number.format(value)} đ` : formatMoney(value / 100)
const dayLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
const optionName = item => `${item.code} · ${item.name}`

function formatCell(row, [key, , type]) {
    if (type === 'USD') return money(row[key], 'USD')
    if (type === 'currency') return money(row[key], row.currency)
    if (type === 'number') return number.format(row[key])
    if (key === 'date') return dayLabel(row[key])
    if (key === 'low') return row.low ? 'Cần nhập thêm' : 'Đủ mức tồn'
    return row[key]
}

function summaries(section, data, columns) {
    const { rows } = data
    if (section === 'stock') return [['Dưới mức tối thiểu', number.format(rows.filter(row => row.low).length)]]
    if (section === 'cash-flow') return []
    if (section === 'purchases') {
        const currencies = new Set(['USD', ...rows.map(row => row.currency)])
        return [['Số phiếu đã xác nhận', number.format(rows.length)], ...[...currencies].map(currency => [
            `Tổng chi (${currency})`, money(sum(rows.filter(row => row.currency === currency), 'amount'), currency),
        ])]
    }
    const cards = columns.flatMap(([key, label, type]) => {
        if (type === 'USD') return [[label, money(sum(rows, key), 'USD')]]
        if (type === 'number') return [[label, number.format(sum(rows, key))]]
        return []
    })
    if (section === 'revenue') cards.push(['Giá trị đơn đang xử lý trong kỳ', money(data.processing, 'USD')])
    return cards
}

function RevenueChart({ rows }) {
    const maximum = rows.reduce((max, row) => Math.max(max, row.amount), 1)
    return (
        <section className="panel">
            <div className="panel-heading"><h2>Biểu đồ doanh thu</h2></div>
            <div className="report-chart" role="img" aria-label="Doanh thu theo kỳ, chi tiết trong bảng phía dưới">
                {rows.map(row => (
                    <div className="report-chart-column" key={row.date} title={`${dayLabel(row.date)} · ${money(row.amount, 'USD')}`}>
                        <div className="report-chart-track">
                            <div className="report-chart-bar" style={{ height: `${row.amount / maximum * 100}%` }} />
                        </div>
                        <small>{dayLabel(row.date)}</small>
                    </div>
                ))}
            </div>
        </section>
    )
}

function ReportView({ section, url }) {
    const { title, columns, byYear, note } = reportSections[section]
    const stock = section === 'stock'
    const [filters, setFilters] = useState(() => ({
        from: today().slice(0, 7) + '-01', to: today(), year: today().slice(0, 4),
        quarter: '', cycle: 'day', status: '', supplier: '', ingredient: '',
    }))
    const [result, setResult] = useState(null)
    const [lookup, setLookup] = useState({ suppliers: [], ingredients: [] })
    const [refresh, setRefresh] = useState(0)
    const [exporting, setExporting] = useState(false)
    const change = (key, value) => setFilters(previous => ({ ...previous, [key]: value }))
    const yearValid = /^\d{4}$/.test(filters.year) && Number(filters.year) >= 1900
    let { from, to } = filters
    if (byYear) {
        const quarter = section === 'products' && Number(filters.quarter)
        const first = quarter ? (quarter - 1) * 3 + 1 : 1
        const last = quarter ? quarter * 3 : 12
        from = `${filters.year}-${String(first).padStart(2, '0')}-01`
        to = `${filters.year}-${String(last).padStart(2, '0')}-${last === 6 || last === 9 ? 30 : 31}`
    }
    const valid = stock || (byYear ? yearValid : from && to && from <= to)
    const params = new URLSearchParams(stock ? {} : { from, to })
    if (section === 'revenue') params.set('cycle', filters.cycle)
    if (section === 'invoices' && filters.status) params.set('status', filters.status)
    if (section === 'purchases') {
        if (filters.supplier) params.set('supplier', filters.supplier)
        if (filters.ingredient) params.set('ingredient', filters.ingredient)
    }
    const endpoint = `${url}/api/order/reports/${section}?${params}`
    const requestKey = `${endpoint}:${refresh}`
    const token = localStorage.getItem('token')

    useEffect(() => {
        if (!valid) return
        const controller = new AbortController()
        axios.get(endpoint, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 15000, signal: controller.signal,
        }).then(({ data }) => {
            if (controller.signal.aborted) return
            setResult({ key: requestKey, data: data.data })
            if (data.data.suppliers) {
                const { suppliers, ingredients } = data.data
                setLookup({ suppliers, ingredients })
            }
        }).catch(error => {
            if (!controller.signal.aborted)
                setResult({ key: requestKey, error: error.response?.data?.message || 'Không tải được báo cáo. Vui lòng thử lại.' })
        })
        return () => controller.abort()
    }, [endpoint, requestKey, token, valid])

    const current = valid && result?.key === requestKey ? result : null
    const data = current?.data
    const cards = data ? summaries(section, data, columns) : []
    const scope = stock ? 'Tồn kho hiện tại' : [
        `Từ ${dayLabel(from)} đến ${dayLabel(to)}`,
        section === 'revenue' && `Theo ${cycles[filters.cycle].toLowerCase()}`,
        section === 'invoices' && (paymentNames[filters.status] || 'Mọi trạng thái thanh toán'),
        filters.supplier && lookup.suppliers.find(item => item._id === filters.supplier)?.name,
        filters.ingredient && lookup.ingredients.find(item => item._id === filters.ingredient)?.name,
    ].filter(Boolean).join(' · ')

    const exportReport = async format => {
        if (exporting || !data) return
        if (!data.rows.length) toast.info('Báo cáo trống. File xuất vẫn có tiêu đề và cột dữ liệu.')
        setExporting(true)
        try {
            const { downloadReport } = await import('./reportExport')
            await downloadReport(format, {
                section, title, scope, cards, note, columns, rows: data.rows, formatCell,
            })
        } catch {
            toast.error('Không xuất được báo cáo. Vui lòng thử lại.')
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="reports-page">
            <div className="page-heading">
                <h1>{title}</h1>
                <div className="toolbar">
                    <button className="button button-light" disabled={!valid || !current} onClick={() => setRefresh(value => value + 1)}>Làm mới</button>
                    <button className="button button-light" disabled={!data || exporting} onClick={() => exportReport('xlsx')}>Xuất Excel</button>
                    <button className="button" disabled={!data || exporting} onClick={() => exportReport('pdf')}>Xuất PDF</button>
                </div>
            </div>
            {!stock && (
                <div className="panel toolbar report-filters">
                    {byYear ? (
                        <label className="field">Năm
                            <input type="number" min="1900" max="9999" value={filters.year} onChange={event => change('year', event.target.value)} />
                        </label>
                    ) : (
                        <>
                            <label className="field">Từ ngày<input type="date" value={from} onChange={event => change('from', event.target.value)} /></label>
                            <label className="field">Đến ngày<input type="date" value={to} onChange={event => change('to', event.target.value)} /></label>
                        </>
                    )}
                    {section === 'revenue' && (
                        <label className="field">Chu kỳ
                            <select value={filters.cycle} onChange={event => change('cycle', event.target.value)}>
                                {Object.entries(cycles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                    )}
                    {section === 'products' && (
                        <label className="field">Quý
                            <select value={filters.quarter} onChange={event => change('quarter', event.target.value)}>
                                <option value="">Cả năm</option>
                                {[1, 2, 3, 4].map(value => <option key={value} value={value}>Quý {value}</option>)}
                            </select>
                        </label>
                    )}
                    {section === 'invoices' && (
                        <label className="field">Trạng thái thanh toán
                            <select value={filters.status} onChange={event => change('status', event.target.value)}>
                                <option value="">Tất cả</option>
                                {Object.entries(paymentNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                    )}
                    {section === 'purchases' && (
                        <>
                            <label className="field">Nhà cung cấp
                                <select value={filters.supplier} onChange={event => change('supplier', event.target.value)}>
                                    <option value="">Tất cả</option>
                                    {lookup.suppliers.map(item => <option key={item._id} value={item._id}>{optionName(item)}</option>)}
                                </select>
                            </label>
                            <label className="field">Nguyên liệu
                                <select value={filters.ingredient} onChange={event => change('ingredient', event.target.value)}>
                                    <option value="">Tất cả</option>
                                    {lookup.ingredients.map(item => <option key={item._id} value={item._id}>{optionName(item)}</option>)}
                                </select>
                            </label>
                        </>
                    )}
                </div>
            )}
            {!valid && <p className="form-error" role="alert">Chọn kỳ báo cáo hợp lệ.</p>}
            {valid && !current && <p className="panel empty-state" role="status">Đang tải báo cáo…</p>}
            {current?.error && <p className="form-error" role="alert">{current.error}</p>}
            {data && (
                <>
                    {cards.length > 0 && (
                        <div className="stat-grid report-stats">
                            {cards.map(([label, value]) => (
                                <section className="stat-card" key={label}><p>{label}</p><strong>{value}</strong></section>
                            ))}
                        </div>
                    )}
                    {section === 'revenue' && data.rows.length > 0 && <RevenueChart rows={data.rows} />}
                    <section className="panel">
                        <div className="panel-heading"><h2>Số liệu chi tiết</h2></div>
                        <div className="table-scroll">
                            <table className="data-table">
                                <thead><tr>{columns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
                                <tbody>
                                    {data.rows.map((row, index) => (
                                        <tr key={index}>
                                            {columns.map(column => (
                                                <td key={column[0]}>
                                                    {column[0] === 'low' && row.low
                                                        ? <span className="badge badge-amber">{formatCell(row, column)}</span>
                                                        : formatCell(row, column)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {!data.rows.length && <p className="empty-state">Không có dữ liệu báo cáo.</p>}
                    </section>
                    {note && <p className="muted report-note">{note}</p>}
                </>
            )}
        </div>
    )
}

export default function Reports({ url }) {
    const { section = 'revenue' } = useParams()
    if (!Object.hasOwn(reportSections, section)) return <Navigate to="/reports" replace />
    return <ReportView key={section} section={section} url={url} />
}
