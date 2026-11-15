import React, { useCallback, useEffect, useState } from 'react'
import './Product.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'

const List = ({ url }) => {

    const [list, setList] = useState([])
    const navigate = useNavigate()
    const token = localStorage.getItem('token')

    const fetchList = useCallback(async () => {
        try {
            const response = await axios.get(`${url}/api/food/list`, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (response.data.success) {
                setList(response.data.data)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Cannot load products')
        }
    }, [url, token])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    const removeFood = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this product?')) return

        try {
            const response = await axios.post(
                `${url}/api/food/remove`,
                { id },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (response.data.success) {
                toast.success('Product deactivated successfully')
                fetchList()
            } else {
                toast.error(response.data.message)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error updating product')
        }
    }

    const getStatus = (status) => ({
        active: 'Active',
        out_of_stock: 'Out of stock',
        inactive: 'Inactive'
    }[status || 'active'])

    return (
        <div className="product-page">
            <div className="product-heading">
                <h2>Product List</h2>

                <button
                    className="product-button"
                    onClick={() => navigate('/products/add')}
                >
                    + Add Product
                </button>
            </div>

            <div className="product-table">
                <div className="product-row product-title">
                    <b>Image</b>
                    <b>Product Name</b>
                    <b>Category</b>
                    <b>Price</b>
                    <b>Status</b>
                    <b>Actions</b>
                </div>

                {list.map(item => (
                    <div className="product-row" key={item._id}>
                        <img
                            src={`${url}/images/${item.image}`}
                            alt={item.name}
                        />

                        <p>{item.name}</p>
                        <p>{item.category}</p>
                        <p>{Number(item.price).toLocaleString('en-US')} VND</p>
                        <p>{getStatus(item.status)}</p>

                        <div className="product-actions">
                            <button onClick={() => navigate('/products/update', {
                                state: { food: item }
                            })}>
                                Edit
                            </button>

                            {item.status !== 'inactive' && (
                                <button onClick={() => removeFood(item._id)}>
                                    Deactivate
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {list.length === 0 && (
                    <p className="product-empty">No products found.</p>
                )}
            </div>
        </div>
    )
}

export default List