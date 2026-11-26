
import React, { useContext } from 'react'
import './ProductDisplay.css'
import ProductItem from '../ProductItem/ProductItem'
import { StoreContext } from '../../context/storeContext'

const ProductDisplay = ({
    category = 'All',
    keyword = '',
    sortBy = 'default',
    setShowLogin,
    setSelectedProduct
}) => {
    const { product_list, loadingProductList } = useContext(StoreContext)

    const filteredProducts = (product_list || [])
        .filter(item => {
            const matchCategory =
                category === 'All' || item.category?.toLocaleLowerCase('vi') === category.toLocaleLowerCase('vi')

            const searchText =
                `${item.name || ''} ${item.description || ''}`.toLowerCase()

            const matchKeyword =
                searchText.includes(keyword.trim().toLowerCase())

            return matchCategory && matchKeyword && item.status !== 'inactive'
        })
        .sort((a, b) => {
            if (sortBy === 'name') {
                return a.name.localeCompare(b.name, 'en')
            }

            if (sortBy === 'priceAsc') {
                return a.price - b.price
            }

            if (sortBy === 'priceDesc') {
                return b.price - a.price
            }

            return 0
        })

    if (loadingProductList) {
        return <p>Loading products...</p>
    }

    return (
        <div className="food-display">
            <h2>Our Menu</h2>

            <div className="food-display-list">
                {filteredProducts.length > 0 ? (
                    filteredProducts.map(item => (
                        <ProductItem
                            key={item._id}
                            id={item._id}
                            name={item.name}
                            price={item.price}
                            description={item.description}
                            image={item.image}
                            setShowLogin={setShowLogin}
                            setSelectedProduct={setSelectedProduct}
                            item={item}
                        />
                    ))
                ) : (
                    <p>No matching products found.</p>
                )}
            </div>
        </div>
    )
}

export default ProductDisplay
