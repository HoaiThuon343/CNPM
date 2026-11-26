import { useEffect, useState } from 'react'
import './Product.css'
import { assets } from '../../assets/assets'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useLocation, useNavigate } from 'react-router-dom'

const Update = ({ url }) => {

    const { state } = useLocation()
    const navigate = useNavigate()
    const product = state?.product

    const [image, setImage] = useState(null)
    const [removeImage, setRemoveImage] = useState(false)
    const [categories, setCategories] = useState([])
    const [preview, setPreview] = useState(
        product?.image ? `${url}/images/${product.image}` : assets.upload_area
    )

    const [data, setData] = useState({
        code: product?.code || (product ? 'SP-' + product._id : ''),
        attributes: product?.attributes || '',
        name: product?.name || '',
        description: product?.description || '',
        category: product?.category || 'Fast food',
        price: product?.price ?? '',
        status: product?.status || 'active'
    })

    const token = localStorage.getItem('token')
    useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])
    useEffect(() => {
        axios.get(`${url}/api/product/categories/manage`, { headers: { Authorization: `Bearer ${token}` } }).then(({ data }) => {
            setCategories(data.data)
            const group = data.data.find(category => category.key === product?.category?.toLocaleLowerCase('vi'))
            if (group) setData(previous => ({ ...previous, category: group.name }))
        }).catch(() => toast.error('Không tải được danh mục.'))
    }, [url, product?.category, token])

    const onChangeHandler = (e) => {
        setData({ ...data, [e.target.name]: e.target.value })
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()

        if (!product) {
            toast.error('Không tìm thấy sản phẩm.')
            navigate('/products/list')
            return
        }

        const formData = new FormData()
        formData.append('id', product._id)
        Object.keys(data).forEach(key => formData.append(key, data[key]))

        if (image) formData.append('image', image)
        formData.append('removeImage', String(removeImage))

        try {
            const response = await axios.post(`${url}/api/product/update`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (response.data.success) {
                toast.success('Đã cập nhật sản phẩm.')
                navigate('/products/list')
            } else {
                toast.error(response.data.message)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không cập nhật được sản phẩm.')
        }
    }

    if (!product) return <section className="panel empty-state"><h1>Chọn món cần cập nhật</h1>
        <button className="button button-light" onClick={() => navigate('/products/list')}>Danh sách món ăn</button></section>

    return (
        <div className="product-page">
            <h1>Cập nhật món ăn</h1>

            <form className="product-form" onSubmit={onSubmitHandler}>
                <div className="product-image">
                    <p>Ảnh sản phẩm</p>
                    <label htmlFor="image">
                        <img src={preview} alt="Ảnh sản phẩm" />
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
                                setRemoveImage(false)
                                setPreview(URL.createObjectURL(file))
                            }
                        }}
                    />
                </div>
                <div className="toolbar">
                    <small>JPEG, PNG hoặc WebP, tối đa 2 MB.</small>
                    <button type="button" className="button button-light" onClick={() => {
                        setImage(null); setRemoveImage(true); setPreview(assets.upload_area)
                    }}>Xóa ảnh</button>
                </div>
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
                            {categories.map(category => <option key={category._id} value={category.name}
                                disabled={category.status === 'inactive' && category.name !== data.category}>
                                {category.label}{category.status === 'inactive' ? ' (ngừng hiển thị)' : ''}
                            </option>)}
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

                <div className="product-field">
                    <label>Trạng thái</label>
                    <select
                        name="status"
                        value={data.status}
                        onChange={onChangeHandler}
                    >
                        <option value="active">Đang kinh doanh</option>
                        <option value="out_of_stock">Tạm hết hàng</option>
                        <option value="inactive">Ngừng kinh doanh</option>
                    </select>
                </div>

                <button type="submit" className="product-button" disabled={!categories.length}>
                    Lưu thay đổi
                </button>
            </form>
        </div>
    )
}

export default Update
