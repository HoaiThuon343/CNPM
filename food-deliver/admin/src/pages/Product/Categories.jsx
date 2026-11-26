import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Product.css'

export default function Categories({ url }) {
    const [categories, setCategories] = useState([])
    const [form, setForm] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const token = localStorage.getItem('token')
    const config = { headers: { Authorization: `Bearer ${token}` } }
    const load = useCallback(async () => {
        try {
            const { data } = await axios.get(`${url}/api/product/categories/manage`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setCategories(data.data)
            setError('')
        } catch (error) { setError(error.response?.data?.message || 'Không tải được danh mục.') }
        finally { setLoading(false) }
    }, [url, token])
    useEffect(() => { load() }, [load])
    const open = item => {
        setError('')
        setForm(item ? { ...item } : { code: '', name: '', description: '', status: 'active' })
    }
    const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
    const save = async event => {
        event.preventDefault()
        if (saving) return
        setSaving(true)
        try {
            await axios({ method: form._id ? 'put' : 'post', url: `${url}/api/product/categories${form._id ? '/' + form._id : ''}`,
                data: form, ...config })
            setForm(null)
            toast.success('Đã lưu danh mục.')
            await load()
        } catch (error) { setError(error.response?.data?.message || 'Không lưu được danh mục.') }
        finally { setSaving(false) }
    }
    const remove = async item => {
        if (!window.confirm(`Xóa danh mục “${item.name}”?`)) return
        setSaving(true)
        try {
            await axios.delete(`${url}/api/product/categories/${item._id}`, config)
            toast.success('Đã xóa danh mục.')
            await load()
        } catch (error) { setError(error.response?.data?.message || 'Không xóa được danh mục.') }
        finally { setSaving(false) }
    }
    return (
        <div className="categories-page">
            <div className="page-heading"><div><h1>Danh mục món ăn</h1><p>Phân loại món ăn và quản lý hiển thị trên thực đơn.</p></div>
                <button className="button" disabled={saving} onClick={() => open()}>Thêm danh mục</button>
            </div>
            {error && !form && <p className="form-error" role="alert">{error}</p>}
            {loading ? <p className="empty-state">Đang tải…</p> : categories.length === 0 ?
                <p className="panel empty-state">Chưa có danh mục.</p> :
                <div className="category-grid">{categories.map(item => <article className="panel category-card" key={item._id}>
                    <div className="category-card-top">
                        <span className="category-icon">{{ 'main course': '🍲', drinks: '🥤', dessert: '🍰', 'fast food': '🍔', bakery: '🥐' }[item.key] || '🍽️'}</span>
                        <span className="badge">{item.status === 'inactive' ? 'Ngừng hiển thị' : 'Đang hiển thị'}</span>
                    </div>
                    <h2>{item.name}</h2><small>{item.code}</small>
                    <p>{item.description}</p><p>{item.productCount} món ăn</p>
                    <div className="toolbar">
                        <button className="button button-light" disabled={saving} onClick={() => open(item)}>Sửa</button>
                        <button className="button button-light button-danger" disabled={saving || item.productCount > 0}
                            title={item.productCount ? 'Danh mục có món chỉ được ngừng hiển thị' : 'Xóa danh mục'}
                            onClick={() => remove(item)}>Xóa</button>
                    </div>
                </article>)}</div>}
            {form && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="category-title">
                <div className="panel-heading"><h2 id="category-title">{form._id ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
                    <button className="button button-light" disabled={saving} onClick={() => setForm(null)}>Đóng</button></div>
                <form className="panel-body" onSubmit={save}>
                    <div className="form-grid">
                        <label className="field full">Mã danh mục<input name="code" value={form.code} onChange={change} required maxLength={120} readOnly={Boolean(form._id)} /></label>
                        <label className="field full">Tên danh mục<input name="name" value={form.name} onChange={change} required maxLength={80} /></label>
                        <label className="field full">Mô tả<textarea name="description" value={form.description || ''} onChange={change} maxLength={500} rows={3} /></label>
                        <label className="field full">Trạng thái<select name="status" value={form.status || 'active'} onChange={change}>
                            <option value="active">Đang hiển thị</option><option value="inactive">Ngừng hiển thị</option>
                        </select><small>Ngừng hiển thị sẽ ẩn danh mục và các món thuộc danh mục trên thực đơn khách.</small></label>
                    </div>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="form-actions"><button type="button" className="button button-light" disabled={saving} onClick={() => setForm(null)}>Hủy</button>
                        <button className="button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu danh mục'}</button></div>
                </form>
            </section></div>}
        </div>
    )
}
