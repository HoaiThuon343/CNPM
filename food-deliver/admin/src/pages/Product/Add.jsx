import React, { useState } from 'react'
import './Product.css'
import { assets } from '../../assets/assets'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'

const Add = ({ url }) => {

    const [image, setImage] = useState(null)
    const [preview, setPreview] = useState('')
    const [data, setData] = useState({
        name: '',
        description: '',
        category: 'Fast food',
        price: ''
    })

    const navigate = useNavigate()
    const token = localStorage.getItem('token')

    const onChangeHandler = (e) => {
        setData({ ...data, [e.target.name]: e.target.value })
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()

        if (!image) {
            toast.error('Please upload a product image')
            return
        }

        const formData = new FormData()
        formData.append('image', image)
        Object.keys(data).forEach(key => formData.append(key, data[key]))

        try {
            const response = await axios.post(`${url}/api/food/add`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (response.data.success) {
                toast.success('Product added successfully')
                navigate('/products/list')
            } else {
                toast.error(response.data.message)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error adding product')
        }
    }

    return (
        <div className="product-page">
            <h2>Add Product</h2>

            <form className="product-form" onSubmit={onSubmitHandler}>
                <div className="product-image">
                    <p>Product Image</p>
                    <label htmlFor="image">
                        <img src={preview || assets.upload_area} alt="Product" />
                    </label>
                    <input
                        type="file"
                        id="image"
                        accept="image/*"
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

                <div className="product-field">
                    <label>Product Name</label>
                    <input
                        name="name"
                        value={data.name}
                        onChange={onChangeHandler}
                        placeholder="Enter product name"
                        required
                    />
                </div>

                <div className="product-field">
                    <label>Description</label>
                    <textarea
                        name="description"
                        value={data.description}
                        onChange={onChangeHandler}
                        placeholder="Enter product description"
                        rows="4"
                        required
                    />
                </div>

                <div className="product-fields">
                    <div className="product-field">
                        <label>Category</label>
                        <select
                            name="category"
                            value={data.category}
                            onChange={onChangeHandler}
                        >
                            <option value="Fast food">Fast Food</option>
                            <option value="Main course">Main Course</option>
                            <option value="Drinks">Drinks</option>
                            <option value="Dessert">Dessert</option>
                            <option value="Bakery">Bakery</option>
                        </select>
                    </div>

                    <div className="product-field">
                        <label>Price (VND)</label>
                        <input
                            type="number"
                            name="price"
                            value={data.price}
                            onChange={onChangeHandler}
                            placeholder="Enter price"
                            min="0"
                            required
                        />
                    </div>
                </div>

                <button type="submit" className="product-button">
                    ADD PRODUCT
                </button>
            </form>
        </div>
    )
}

export default Add