import React, { useState } from 'react'
import './Product.css'
import { assets } from '../../assets/assets'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useLocation, useNavigate } from 'react-router-dom'

const Update = ({ url }) => {

    const { state } = useLocation()
    const navigate = useNavigate()
    const food = state?.food

    const [image, setImage] = useState(null)
    const [preview, setPreview] = useState(
        food ? `${url}/images/${food.image}` : assets.upload_area
    )

    const [data, setData] = useState({
        name: food?.name || '',
        description: food?.description || '',
        category: food?.category || 'Fast food',
        price: food?.price ?? '',
        status: food?.status || 'active'
    })

    const token = localStorage.getItem('token')

    const onChangeHandler = (e) => {
        setData({ ...data, [e.target.name]: e.target.value })
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()

        if (!food) {
            toast.error('Product not found')
            navigate('/products/list')
            return
        }

        const formData = new FormData()
        formData.append('id', food._id)
        Object.keys(data).forEach(key => formData.append(key, data[key]))

        if (image) formData.append('image', image)

        try {
            const response = await axios.post(`${url}/api/food/update`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (response.data.success) {
                toast.success('Product updated successfully')
                navigate('/products/list')
            } else {
                toast.error(response.data.message)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error updating product')
        }
    }

    if (!food) return null

    return (
        <div className="product-page">
            <h2>Update Product</h2>

            <form className="product-form" onSubmit={onSubmitHandler}>
                <div className="product-image">
                    <p>Product Image</p>
                    <label htmlFor="image">
                        <img src={preview} alt="Product" />
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

                <div className="product-field">
                    <label>Status</label>
                    <select
                        name="status"
                        value={data.status}
                        onChange={onChangeHandler}
                    >
                        <option value="active">Active</option>
                        <option value="out_of_stock">Out of Stock</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>

                <button type="submit" className="product-button">
                    UPDATE PRODUCT
                </button>
            </form>
        </div>
    )
}

export default Update