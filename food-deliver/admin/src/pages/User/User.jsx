import { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'

const roleNames = { user: 'Khách hàng', staff: 'Nhân viên', admin: 'Quản trị viên' }
const dateText = value => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa ghi nhận'

export default function User({ url, all = false }) {
    const [users, setUsers] = useState([])
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [role, setRole] = useState('')
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [selectedId, setSelectedId] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [revision, setRevision] = useState(0)
    const selected = users.find(item => item._id === selectedId)
    const token = localStorage.getItem('token')
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(async () => {
            setLoading(true)
            try {
                const { data } = await axios.get(`${url}/api/user/list`, {
                    params: { search, status, role: all ? role : 'user', scope: all ? 'all' : '', page, limit: 20 },
                    headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
                })
                setUsers(data.data)
                setPages(data.pages)
                setTotal(data.total)
                if (page > data.pages) setPage(data.pages)
                setError('')
            } catch (error) {
                if (!axios.isCancel(error)) setError(error.response?.data?.message || 'Không tải được tài khoản.')
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }, 250)
        return () => { clearTimeout(timer); controller.abort() }
    }, [url, token, search, status, role, all, page, revision])
    const changeStatus = async user => {
        const next = user.status === 'active' ? 'deactive' : 'active'
        if (!window.confirm(next === 'deactive' ? 'Khóa tài khoản và kết thúc các phiên đang đăng nhập?' : 'Mở khóa tài khoản?')) return
        setSaving(true)
        try {
            await axios.post(`${url}/api/user/update-status`, { userId: user._id, status: next },
                { headers: { Authorization: `Bearer ${token}` } })
            toast.success('Đã cập nhật tài khoản.')
            setRevision(value => value + 1)
        } catch (error) { toast.error(error.response?.data?.message || 'Không cập nhật được tài khoản.') }
        finally { setSaving(false) }
    }
    const filter = (setter, value) => { setter(value); setPage(1) }
    return (
        <>
            <div className="page-heading"><h1>{all ? 'Tài khoản' : 'Khách hàng'}</h1>
                <button className="button button-light" onClick={() => setRevision(value => value + 1)}>Làm mới</button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <section className="panel">
                <div className="panel-heading toolbar">
                    <h2>{total} tài khoản</h2>
                    <input aria-label="Tìm tài khoản" placeholder="Mã tài khoản, tên, email, số điện thoại…"
                        value={search} onChange={event => filter(setSearch, event.target.value)} />
                    {all && <select aria-label="Vai trò tài khoản" value={role} onChange={event => filter(setRole, event.target.value)}>
                        <option value="">Tất cả vai trò</option>
                        {Object.entries(roleNames).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>}
                    <select aria-label="Trạng thái tài khoản" value={status} onChange={event => filter(setStatus, event.target.value)}>
                        <option value="">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="deactive">Đã khóa</option>
                    </select>
                </div>
                {loading ? <p className="empty-state">Đang tải…</p> : users.length === 0 ? <p className="empty-state">Không có tài khoản phù hợp.</p> :
                    <div className="table-scroll"><table className="data-table">
                        <thead><tr><th>Tài khoản</th><th>Định danh</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Cập nhật gần nhất</th><th>Xử lý</th></tr></thead>
                        <tbody>{users.map(item => <tr key={item._id} onClick={() => setSelectedId(item._id)}>
                            <td><button className="button-link" onClick={() => setSelectedId(item._id)}>{item.name}</button><br /><small>{item._id}</small></td>
                            <td>{item.email}<br />{item.phone}</td>
                            <td>{item.roleId?.name || roleNames[item.role]}</td>
                            <td>{item.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</td>
                            <td>{dateText(item.createdAt)}</td><td>{dateText(item.updatedAt)}</td>
                            <td><button className="button-link" disabled={saving} onClick={event => { event.stopPropagation(); changeStatus(item) }}>
                                {item.status === 'active' ? 'Khóa' : 'Mở khóa'}
                            </button></td>
                        </tr>)}</tbody>
                    </table></div>}
                <div className="panel-heading"><span>Trang {page}/{pages}</span><div className="toolbar">
                    <button className="button button-light" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Trước</button>
                    <button className="button button-light" disabled={page >= pages || loading} onClick={() => setPage(value => value + 1)}>Sau</button>
                </div></div>
            </section>
            {selected && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
                <div className="panel-heading"><h2 id="account-title">Chi tiết tài khoản</h2>
                    <button className="button button-light" onClick={() => setSelectedId('')}>Đóng</button>
                </div>
                <div className="panel-body">
                    <dl className="order-info">
                        {Object.entries({ 'Mã tài khoản': selected._id, 'Họ tên': selected.name, 'Email': selected.email,
                            'Số điện thoại': selected.phone || 'Chưa bổ sung', 'Vai trò': selected.roleId?.name || roleNames[selected.role],
                            'Trạng thái': selected.status === 'active' ? 'Hoạt động' : 'Đã khóa',
                            'Ngày tạo': dateText(selected.createdAt), 'Cập nhật gần nhất': dateText(selected.updatedAt) }).map(([label, value]) =>
                            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                    </dl>
                    <h3>Lịch sử khóa / mở khóa</h3>
                    {!selected.statusHistory?.length && <p>Chưa ghi nhận thay đổi.</p>}
                    {selected.statusHistory?.map((entry, index) => <p key={index}>
                        {dateText(entry.changedAt)} · {entry.status === 'active' ? 'Mở khóa' : 'Khóa'} · Người thực hiện {entry.changedBy}
                    </p>)}
                </div>
            </section></div>}
        </>
    )
}
