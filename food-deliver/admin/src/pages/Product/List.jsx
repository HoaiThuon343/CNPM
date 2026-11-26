import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { formatMoney } from '../../../../shared/money.js'
import './Product.css'

const List = ({ url, user }) => {
    const can = permission => user?.role === 'admin' || user?.permissions?.includes(permission)
    const [list, setList] = useState([])
    const [categories, setCategories] = useState([])
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [filter, setFilter] = useState('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState('')
    const token = localStorage.getItem('token')
    const load = useCallback(async () => {
        try {
            const [foods, groups] = await Promise.all([
                axios.get(`${url}/api/product/list`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${url}/api/product/categories/manage`, { headers: { Authorization: `Bearer ${token}` } }),
            ])
            setList(foods.data.data)
            setCategories(groups.data.data)
            setError('')
        } catch (error) {
            setError(error.response?.data?.message || 'Không tải được thực đơn.')
        } finally {
            setLoading(false)
        }
    }, [url, token])
    useEffect(() => {
        load()
    }, [load])
    const changeStatus = async (item, status) => {
        setSaving(item._id)
        try {
            await axios.post(
                `${url}/api/product/update`,
                { id: item._id, status },
                { headers: { Authorization: `Bearer ${token}` } },
            )
            toast.success('Đã cập nhật tình trạng món.')
            await load()
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không cập nhật được món.')
        } finally {
            setSaving('')
        }
    }
    const remove = async item => {
        if (!window.confirm('Xóa món này? Món đã có đơn hoặc hóa đơn sẽ chuyển sang ngừng kinh doanh.')) return
        setSaving(item._id)
        try {
            const { data } = await axios.post(`${url}/api/product/remove`, { id: item._id },
                { headers: { Authorization: `Bearer ${token}` } })
            toast.success(data.data.message)
            await load()
        } catch (error) { toast.error(error.response?.data?.message || 'Không xóa được món.') }
        finally { setSaving('') }
    }
    const available = list.filter((item) => item.status === 'active').length
    const rows = list.filter(
        (item) =>
            (filter === 'all' ||
                (filter === 'available' ? item.status === 'active' : item.status !== 'active')) &&
            (!category || item.category?.toLocaleLowerCase('vi') === category) &&
            `${item.name} ${item.description}`
                .toLocaleLowerCase('vi')
                .includes(search.trim().toLocaleLowerCase('vi')),
    )
    return (
        <div className="menu-admin-page">
            <div className="page-heading">
                <div>
                    <h1>Món ăn</h1>
                    <p>Quản lý món, giá bán và tình trạng phục vụ.</p>
                </div>
                {can('product.create') && <Link className="button" to="/products/add">
                    ＋ Thêm món
                </Link>}
            </div>
            {error && (
                <p className="form-error" role="alert">
                    {error}
                </p>
            )}
            <section className="panel">
                <div className="menu-admin-filters">
                    <div className="menu-status-tabs">
                        {[
                            ['all', 'Tất cả', list.length],
                            ['available', 'Đang bán', available],
                            ['unavailable', 'Không sẵn có', list.length - available],
                        ].map(([value, label, count]) => (
                            <button
                                key={value}
                                className={filter === value ? 'active' : ''}
                                aria-pressed={filter === value}
                                onClick={() => setFilter(value)}
                            >
                                {label}
                                <span>{count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="toolbar">
                        <input
                            aria-label="Tìm món ăn"
                            placeholder="Tìm món ăn…"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <select
                            aria-label="Lọc danh mục"
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                        >
                            <option value="">Tất cả danh mục</option>
                            {categories.map((item) => (
                                <option key={item._id} value={item.key}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                {loading ? (
                    <div className="empty-state">Đang tải thực đơn…</div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">Không có món ăn phù hợp.</div>
                ) : (
                    <div className="table-scroll">
                        <table className="data-table menu-admin-table">
                            <thead>
                                <tr>
                                    <th>Món ăn</th>
                                    <th>Danh mục</th>
                                    <th>Giá bán</th>
                                    <th>Đơn đặt (30 ngày)</th>
                                    <th>Đang bán</th>
                                    <th>Xử lý</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item) => (
                                    <tr key={item._id}>
                                        <td>
                                            <div className="menu-food-name">
                                                {item.image && <img src={`${url}/images/${item.image}`} alt="" />}
                                                <div>
                                                    <strong>{item.name}</strong>
                                                    <small>{item.code || 'SP-' + item._id}</small>
                                                    {item.status === 'inactive' && <small>Ngừng bán</small>}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {categories.find(
                                                (group) =>
                                                    group.key === item.category?.toLocaleLowerCase('vi'),
                                            )?.label || item.category}
                                        </td>
                                        <td>
                                            <strong>{formatMoney(item.price)}</strong>
                                        </td>
                                        <td>{item.orderCount30 || 0}</td>
                                        <td>
                                            <select
                                                aria-label={`Trạng thái: ${item.name}`}
                                                value={item.status}
                                                disabled={Boolean(saving) || !can('product.update')}
                                                onChange={event => changeStatus(item, event.target.value)}
                                            >
                                                <option value="active">Đang kinh doanh</option>
                                                <option value="out_of_stock">Tạm hết hàng</option>
                                                <option value="inactive">Ngừng kinh doanh</option>
                                            </select>
                                        </td>
                                        <td>
                                            {can('product.update') && <Link
                                                className="button button-light"
                                                to="/products/update"
                                                state={{ product: item }}
                                            >
                                                Sửa món
                                            </Link>}
                                            {can('product.delete') && <button className="button-link button-danger"
                                                disabled={Boolean(saving)} onClick={() => remove(item)}>Xóa</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    )
}

export default List
