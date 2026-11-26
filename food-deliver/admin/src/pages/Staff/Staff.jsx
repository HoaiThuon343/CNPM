import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { formatMoney } from '../../../../shared/money.js'

const workNames = { working: 'Đang làm việc', resigned: 'Đã nghỉ việc' }
const profileFields = [
    ['staffCode', 'Mã nhân viên', 'text'], ['name', 'Họ và tên', 'text'],
    ['phone', 'Số điện thoại', 'tel'], ['email', 'Email hồ sơ', 'email'],
    ['address', 'Địa chỉ', 'text'], ['position', 'Chức vụ', 'text'],
    ['startDate', 'Ngày bắt đầu làm việc', 'date'],
]
const dateInput = value => value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10) : ''
const dateText = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa bổ sung'
const errorText = error => error.response?.data?.message || 'Không kết nối được máy chủ. Vui lòng thử lại.'

export default function Staff({ url, user }) {
    const admin = user.role === 'admin'
    const [staff, setStaff] = useState([])
    const [roles, setRoles] = useState([])
    const [permissions, setPermissions] = useState([])
    const [tab, setTab] = useState('staff')
    const [search, setSearch] = useState('')
    const [position, setPosition] = useState('')
    const [workStatus, setWorkStatus] = useState('')
    const [selectedId, setSelectedId] = useState('')
    const [form, setForm] = useState(null)
    const [accounts, setAccounts] = useState([])
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [activity, setActivity] = useState([])
    const [activityFilter, setActivityFilter] = useState({ staffId: '', from: '', to: '' })
    const token = localStorage.getItem('token')
    const endpoint = `${url}/api/user`
    const request = useCallback(async (method, path, data, signal) => {
        const response = await axios({ method, url: endpoint + path, data, signal,
            headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
        return response.data
    }, [endpoint, token])
    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [people, groups] = await Promise.all([
                request('get', '/staff'),
                admin ? request('get', '/roles') : Promise.resolve({ data: [], permissions: [] }),
            ])
            setStaff(people.data)
            setRoles(groups.data)
            setPermissions(groups.permissions)
            setError('')
        } catch (error) { setError(errorText(error)) }
        finally { setLoading(false) }
    }, [request, admin])
    useEffect(() => { load() }, [load])
    useEffect(() => {
        if (!['orders', 'purchases'].includes(tab)) return
        const controller = new AbortController()
        setLoading(true)
        setError('')
        setActivity([])
        const query = new URLSearchParams({ type: tab, ...activityFilter })
        request('get', '/staff/activity?' + query, undefined, controller.signal)
            .then(data => setActivity(data.data))
            .catch(error => { if (!axios.isCancel(error)) setError(errorText(error)) })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [tab, activityFilter, request])
    const selected = staff.find(item => item._id === selectedId)
    const query = search.trim().toLocaleLowerCase('vi')
    const rows = (tab === 'roles' ? roles : staff).filter(item =>
        [item.name, item.email, item.staffCode, item.phone].some(value => value?.toLocaleLowerCase('vi').includes(query)) &&
        (tab === 'roles' || ((!position || item.position === position) && (!workStatus || item.workStatus === workStatus))))
    const openProfile = item => {
        setError('')
        setForm({ type: 'profile', id: item?._id,
            ...Object.fromEntries(profileFields.map(([key]) => [key, key === 'startDate' ? dateInput(item?.startDate) : item?.[key] || ''])),
            workStatus: item?.workStatus || 'working',
        })
    }
    const openRole = item => {
        setError('')
        setForm({ type: 'role', id: item?._id, name: item?.name || '', description: item?.description || '',
            permissions: item?.permissions || [], status: item?.status || 'active' })
    }
    const openLink = async item => {
        setSaving(true)
        setError('')
        try {
            const result = await request('get', '/staff/available-accounts')
            setAccounts(result.data)
            setForm({ type: 'link', id: item._id, mode: 'new', identifier: item.email, password: '', accountId: '' })
        } catch (error) { setError(errorText(error)) }
        finally { setSaving(false) }
    }
    const openDetail = async item => {
        try {
            const result = await request('get', '/staff/' + item._id)
            setStaff(previous => previous.map(row => row._id === item._id ? result.data : row))
            setSelectedId(item._id)
        } catch (error) { setSelectedId(''); await load(); setError(errorText(error)) }
    }
    const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
    const save = async event => {
        event.preventDefault()
        if (saving) return
        if (form.type === 'profile' && form.id &&
            staff.find(item => item._id === form.id)?.workStatus !== form.workStatus &&
            !window.confirm(`Chuyển nhân viên sang ${workNames[form.workStatus]}?${form.workStatus === 'resigned' ? ' Tài khoản liên kết sẽ bị khóa và các phiên đăng nhập sẽ kết thúc.' : ''}`)) return
        setSaving(true)
        setError('')
        try {
            let path = '/roles'
            let values = form
            if (form.type === 'profile') path = '/staff'
            if (form.type === 'link') {
                path = '/staff/' + form.id + '/account'
                values = form.mode === 'existing' ? { accountId: form.accountId } : { identifier: form.identifier, password: form.password }
            }
            if (form.type === 'assign') path = '/staff/' + form.id + '/role'
            const result = await request('post', path, values)
            setForm(null)
            if (form.type === 'link' || form.type === 'assign') setSelectedId(form.id)
            toast.success('Đã lưu thay đổi.')
            await load()
            if (form.type === 'profile' && !form.id && window.confirm('Đã lưu hồ sơ. Tạo hoặc liên kết tài khoản đăng nhập cho nhân viên này?')) {
                await openLink(result.data)
            }
        } catch (error) { setError(errorText(error)) }
        finally { setSaving(false) }
    }
    const removeRole = async item => {
        if (!window.confirm(`Xóa vai trò “${item.name}”?`)) return
        setSaving(true)
        try { await request('delete', '/roles/' + item._id); await load() }
        catch (error) { setError(errorText(error)) }
        finally { setSaving(false) }
    }
    const switchTab = next => { setTab(next); setError(''); setSelectedId(''); setSearch('') }
    const activityTab = ['orders', 'purchases'].includes(tab)
    const formTitle = { profile: form?.id ? 'Sửa hồ sơ nhân viên' : 'Thêm nhân viên',
        role: form?.id ? 'Sửa vai trò' : 'Thêm vai trò', link: 'Liên kết tài khoản', assign: 'Gán vai trò' }
    return (
        <>
            <div className="page-heading">
                <div><h1>Nhân viên</h1><p>Hồ sơ, tài khoản liên kết và hoạt động làm việc.</p></div>
                {admin && !activityTab && <button className="button" disabled={saving || loading}
                    onClick={() => tab === 'roles' ? openRole() : openProfile()}>
                    {tab === 'roles' ? 'Thêm vai trò' : 'Thêm nhân viên'}
                </button>}
            </div>
            <div className="tabs" style={{ flexWrap: 'wrap' }}>
                {[['staff', 'Nhân viên'], ...(admin ? [['roles', 'Vai trò & quyền'], ['orders', 'Theo dõi xác nhận đơn'], ['purchases', 'Theo dõi phiếu nhập']] : [])]
                    .map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => switchTab(key)}>{label}</button>)}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <section className="panel">
                <div className="panel-heading toolbar">
                    {activityTab ? <>
                        <label className="field">Nhân viên
                            <select value={activityFilter.staffId} onChange={event => setActivityFilter(previous => ({ ...previous, staffId: event.target.value }))}>
                                <option value="">Tất cả nhân viên / quản trị viên</option>
                                {staff.map(item => <option key={item._id} value={item._id}>{item.name} ({item.staffCode})</option>)}
                            </select>
                        </label>
                        <label className="field">Từ ngày<input type="date" value={activityFilter.from}
                            onChange={event => setActivityFilter(previous => ({ ...previous, from: event.target.value }))} /></label>
                        <label className="field">Đến ngày<input type="date" value={activityFilter.to}
                            onChange={event => setActivityFilter(previous => ({ ...previous, to: event.target.value }))} /></label>
                    </> : <>
                        <input aria-label="Tìm kiếm nhân viên hoặc vai trò" placeholder="Tìm mã, họ tên, số điện thoại, email…" value={search} onChange={event => setSearch(event.target.value)} />
                        {tab === 'staff' && <>
                            <select aria-label="Lọc chức vụ" value={position} onChange={event => setPosition(event.target.value)}>
                                <option value="">Tất cả chức vụ</option>
                                {[...new Set(staff.map(item => item.position).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}
                            </select>
                            <select aria-label="Lọc trạng thái làm việc" value={workStatus} onChange={event => setWorkStatus(event.target.value)}>
                                <option value="">Tất cả trạng thái làm việc</option>
                                {Object.entries(workNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                        </>}
                        <button className="button button-light" disabled={loading} onClick={load}>Làm mới</button>
                    </>}
                </div>
                {loading ? <p className="empty-state">Đang tải…</p> : activityTab ? (
                    activity.length === 0 ? <p className="empty-state">Không có hoạt động phù hợp.</p> :
                    <div className="table-scroll"><table className="data-table">
                        <thead><tr><th>{tab === 'orders' ? 'Mã đơn' : 'Mã phiếu'}</th>
                            {tab === 'purchases' && <><th>Người lập</th><th>Thời điểm lập</th></>}
                            <th>Người xác nhận</th><th>Thời điểm xác nhận</th>{tab === 'purchases' && <th>Tổng giá trị</th>}
                        </tr></thead>
                        <tbody>{activity.map(item => <tr key={item._id}>
                            <td>{tab === 'orders' ? <Link className="button-link" to={'/orders/' + item._id}>{item.orderCode}</Link> :
                                item.code}</td>
                            {tab === 'purchases' && <><td>{item.createdByName}</td><td>{dateText(item.createdAt)}</td></>}
                            <td>{item.confirmedByName || 'Chưa xác nhận'}</td><td>{dateText(item.confirmedAt)}</td>
                            {tab === 'purchases' && <td>{item.currency === 'VND' ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.total) : formatMoney(item.total)}</td>}
                        </tr>)}</tbody>
                    </table></div>
                ) : rows.length === 0 ? <p className="empty-state">Không có kết quả phù hợp.</p> : (
                    <div className="table-scroll"><table className="data-table">
                        <thead><tr>{(tab === 'roles' ? ['Vai trò', 'Mô tả', 'Quyền được cấp', 'Trạng thái', 'Xử lý'] :
                            ['Mã nhân viên', 'Họ tên', 'Số điện thoại', 'Chức vụ', 'Trạng thái làm việc', 'Xử lý'])
                            .map(label => <th key={label}>{label}</th>)}</tr></thead>
                        <tbody>{rows.map(item => <tr key={item._id} onClick={() => tab === 'staff' && openDetail(item)}>
                            {tab === 'roles' ? <>
                                <td>{item.name}</td><td>{item.description}</td><td>{item.permissions.length} quyền</td>
                                <td>{item.status === 'active' ? 'Đang sử dụng' : 'Ngừng sử dụng'}</td>
                                <td><button className="button-link" disabled={saving} onClick={() => openRole(item)}>Sửa</button>
                                    <button className="button-link button-danger" disabled={saving} onClick={() => removeRole(item)}>Xóa</button></td>
                            </> : <>
                                <td><button className="button-link" onClick={event => { event.stopPropagation(); openDetail(item) }}>{item.staffCode}</button></td>
                                <td>{item.name}</td><td>{item.phone || 'Chưa bổ sung'}</td><td>{item.position || 'Chưa bổ sung'}</td>
                                <td>{workNames[item.workStatus]}</td>
                                <td>{admin && <button className="button-link" disabled={saving} onClick={event => { event.stopPropagation(); openProfile(item) }}>Sửa hồ sơ</button>}</td>
                            </>}
                        </tr>)}</tbody>
                    </table></div>
                )}
            </section>
            {selected && !form && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="staff-detail-title">
                <div className="panel-heading"><h2 id="staff-detail-title">Chi tiết nhân viên</h2><button className="button button-light" onClick={() => setSelectedId('')}>Đóng</button></div>
                <div className="panel-body">
                    <dl className="order-info">
                        {profileFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === 'startDate' ? dateInput(selected[key]) || 'Chưa bổ sung' : selected[key] || 'Chưa bổ sung'}</dd></div>)}
                        <div><dt>Trạng thái làm việc</dt><dd>{workNames[selected.workStatus]}</dd></div>
                        <div><dt>Tài khoản liên kết</dt><dd>{selected.userId ? [selected.userId.email, selected.userId.phone].filter(Boolean).join(' / ') : 'Chưa liên kết'}</dd></div>
                        <div><dt>Trạng thái tài khoản</dt><dd>{selected.userId ? selected.userId.status === 'active' ? 'Hoạt động' : 'Đã khóa' : 'Chưa có tài khoản'}</dd></div>
                        <div><dt>Vai trò truy cập</dt><dd>{selected.userId?.roleId?.name || 'Chưa gán'}</dd></div>
                    </dl>
                    {admin && <div className="form-actions">
                        <button className="button button-light" onClick={() => openProfile(selected)}>Sửa hồ sơ</button>
                        {selected.userId ? <button className="button" onClick={() => setForm({ type: 'assign', id: selected._id, roleId: selected.userId.roleId?._id || '' })}>Gán vai trò</button> :
                            <button className="button" disabled={saving} onClick={() => openLink(selected)}>Liên kết tài khoản</button>}
                    </div>}
                </div>
            </section></div>}
            {form && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="staff-form-title">
                <div className="panel-heading"><h2 id="staff-form-title">{formTitle[form.type]}</h2>
                    <button className="button button-light" disabled={saving} onClick={() => setForm(null)}>Đóng</button></div>
                <form className="panel-body" onSubmit={save}>
                    <div className="form-grid">
                        {form.type === 'profile' && <>
                            {profileFields.map(([key, label, type]) => <label key={key} className="field">{label}
                                <input type={type} name={key} value={form[key]} onChange={change} required maxLength={250}
                                    readOnly={key === 'staffCode' && Boolean(form.id)} />
                            </label>)}
                            <label className="field">Trạng thái làm việc<select name="workStatus" value={form.workStatus} onChange={change}>
                                {Object.entries(workNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select></label>
                        </>}
                        {form.type === 'link' && <>
                            <label className="field full">Cách liên kết<select name="mode" value={form.mode} onChange={change}>
                                <option value="new">Tạo tài khoản mới</option><option value="existing">Chọn tài khoản nhân viên chưa liên kết</option>
                            </select></label>
                            {form.mode === 'new' ? <>
                                <label className="field full">Email hoặc số điện thoại đăng nhập<input name="identifier" value={form.identifier} onChange={change} autoComplete="off" required /></label>
                                <label className="field full">Mật khẩu khởi tạo<input type="password" name="password" minLength={8} value={form.password} onChange={change} autoComplete="new-password" required /></label>
                            </> : <label className="field full">Tài khoản chưa liên kết<select name="accountId" value={form.accountId} onChange={change} required>
                                <option value="">Chọn tài khoản</option>{accounts.map(item => <option key={item._id} value={item._id}>{item.name} · {item.email}</option>)}
                            </select>{accounts.length === 0 && <small>Chưa có tài khoản nhân viên chưa liên kết.</small>}</label>}
                        </>}
                        {form.type === 'assign' && <label className="field full">Vai trò truy cập<select name="roleId" value={form.roleId} onChange={change} required>
                            <option value="">Chọn vai trò đang sử dụng</option>
                            {roles.filter(item => item.status === 'active').map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
                        </select></label>}
                        {form.type === 'role' && <>
                            <label className="field full">Tên vai trò<input name="name" value={form.name} onChange={change} required /></label>
                            <label className="field full">Mô tả vai trò<textarea name="description" value={form.description} onChange={change} maxLength={500} /></label>
                            <div className="field full">Quyền truy cập<div className="checkbox-list">
                                {permissions.map(permission => <label key={permission.code}><input type="checkbox" checked={form.permissions.includes(permission.code)}
                                    onChange={event => setForm(previous => ({ ...previous, permissions: event.target.checked ?
                                        [...previous.permissions, permission.code] : previous.permissions.filter(code => code !== permission.code) }))} />{permission.name}</label>)}
                            </div></div>
                            <label className="field full">Trạng thái<select name="status" value={form.status} onChange={change}>
                                <option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option>
                            </select></label>
                        </>}
                    </div>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="form-actions"><button type="button" className="button button-light" disabled={saving} onClick={() => setForm(null)}>Hủy</button>
                        <button className="button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
                </form>
            </section></div>}
        </>
    )
}
