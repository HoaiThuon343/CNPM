import { useEffect, useState } from 'react'
import './Product.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'

const Add = ({ url }) => {

    const [image, setImage] = useState(null)
    const [categories, setCategories] = useState([])
    const [preview, setPreview] = useState('')
    const [data, setData] = useState({
        code: '',
        attributes: '',
        status: 'active',
        name: '',
        description: '',
        category: '',
        price: ''
    })

    const navigate = useNavigate()
    const token = localStorage.getItem('token')
    useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])
    useEffect(() => {
        axios.get(`${url}/api/product/categories`).then(({ data }) => {
            setCategories(data.data)
            setData(previous => ({ ...previous, category: previous.category || data.data[0]?.name || '' }))
        }).catch(() => toast.error('Không tải được danh mục.'))
    }, [url])

    const onChangeHandler = (e) => {
        setData({ ...data, [e.target.name]: e.target.value })
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()

        if (!image) {
            toast.error('Vui lòng chọn ảnh sản phẩm.')
            return
        }

        const formData = new FormData()
        formData.append('image', image)
        Object.keys(data).forEach(key => formData.append(key, data[key]))

        try {
            const response = await axios.post(`${url}/api/product/add`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (response.data.success) {
                toast.success('Đã thêm sản phẩm.')
                navigate('/products/list')
            } else {
                toast.error(response.data.message)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không thêm được sản phẩm.')
        }
    }

    return (
        <div className="product-page">
            <h1>Thêm món ăn</h1>

            <form className="product-form" onSubmit={onSubmitHandler}>
                <div className="product-image">
                    <p>Ảnh sản phẩm</p>
                    <label htmlFor="image">
                        {preview ? <img src={preview} alt="Ảnh sản phẩm" /> : <span className="product-upload-placeholder">＋<small>Chọn ảnh</small></span>}
                    </label>
                    <input
                        type="file"
                        id="image"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={e => {
                            const file = e.target.files[0]
                            if (file) {
                                setImage(file)
                                setPreview(URL.createObjectURL(file))
                            }
                        }}
                    />
                </div>
                <small>JPEG, PNG hoặc WebP, tối đa 2 MB.</small>
                <div className="product-field"><label htmlFor="product-code">Mã món</label>
                    <input id="product-code" name="code" required maxLength={120} value={data.code} onChange={onChangeHandler} /></div>

                <div className="product-field">
                    <label>Tên món</label>
                    <input
                        name="name"
                        value={data.name}
                        onChange={onChangeHandler}
                        placeholder="Nhập tên sản phẩm"
                        required
                    />
                </div>

                <div className="product-field">
                    <label>Mô tả</label>
                    <textarea
                        name="description"
                        value={data.description}
                        onChange={onChangeHandler}
                        placeholder="Nhập mô tả sản phẩm"
                        rows="4"
                        required
                    />
                </div>

                <div className="product-fields">
                    <div className="product-field">
                        <label>Danh mục</label>
                        <select
                            name="category"
                            value={data.category}
                            onChange={onChangeHandler}
                            required
                        >
                            <option value="">Chọn danh mục</option>
                            {categories.map(category => <option key={category._id} value={category.name}>{category.label}</option>)}
                        </select>
                    </div>

                    <div className="product-field">
                        <label>Giá bán (USD)</label>
                        <input
                            type="number"
                            name="price"
                            value={data.price}
                            onChange={onChangeHandler}
                            placeholder="Nhập giá bán"
                            min="0.01"
                            step="0.01"
                            required
                        />
                    </div>
                </div>
                <div className="product-field"><label htmlFor="product-attributes">Thuộc tính bổ sung</label>
                    <textarea id="product-attributes" name="attributes" value={data.attributes} onChange={onChangeHandler}
                        maxLength={2000} rows={3} placeholder="Kích thước, lựa chọn đi kèm và thông tin phục vụ" /></div>
                <div className="product-field"><label htmlFor="product-status">Trạng thái kinh doanh</label>
                    <select id="product-status" name="status" value={data.status} onChange={onChangeHandler}>
                        <option value="active">Đang kinh doanh</option><option value="out_of_stock">Tạm hết hàng</option><option value="inactive">Ngừng kinh doanh</option>
                    </select></div>

                {!categories.length && <p className="muted">Hãy tạo danh mục trong Quản lý thực đơn → Danh mục trước khi thêm món.</p>}
                <button type="submit" className="product-button" disabled={!categories.length}>
                    Thêm món
                </button>
            </form>
        </div>
    )
}

export default Add
