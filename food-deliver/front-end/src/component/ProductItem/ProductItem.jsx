
import { useContext, useState } from 'react'
import './ProductItem.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../context/storeContext'
import { toast } from 'react-toastify'

const ProductItem = ({
    id,
    name,
    price,
    description,
    image,
    setShowLogin,
    setSelectedProduct,
    item
}) => {
    const { addToCart, url, token } = useContext(StoreContext)
    const [localQuantity, setLocalQuantity] = useState(1)

    const isAvailable =
        item?.status !== 'out_of_stock' &&
        item?.status !== 'inactive'

    const handleSelectProduct = () => {
        if (setSelectedProduct) {
            setSelectedProduct(item)
        }
    }

    const handleUpdateCart = async () => {
        if (!token) {
            toast.info('Please log in to add items to your cart.')
            window.scrollTo({ top: 0, behavior: 'smooth' })
            setShowLogin(true)
            return
        }

        if (!isAvailable) {
            toast.info('This product is currently unavailable.')
            return
        }

        try {
            await addToCart(id, localQuantity)
            toast.success(`Added ${localQuantity} ${name} to cart!`)
            setLocalQuantity(1)
        } catch (error) {
            console.error('Failed to add item to cart:', error)
            toast.error('Failed to add item to cart.')
        }
    }

    return (
        <div className="food-item">
            <div className="food-item-img-container">
                <img
                    className="food-item-image"
                    src={`${url}/images/${image}`}
                    alt={name}
                    onClick={handleSelectProduct}
                />
            </div>

            <div className="food-item-info">
                <div className="food-item-name-rating">
                    <p>{name}</p>
                </div>

                <p className="food-item-desc">
                    {description}
                </p>

                <div className="food-item-price-counter">
                    <p className="food-item-price">
                        {Number(price).toLocaleString('en-US')} VND
                    </p>

                    <div className="food-item-counter-wrapper">
                        <div className="food-item-counter-container">
                            <div className="food-item-counter">
                                <img
                                    onClick={() =>
                                        setLocalQuantity(prev => Math.max(1, prev - 1))
                                    }
                                    src={assets.remove_icon_red}
                                    alt="Decrease quantity"
                                />

                                <p>{localQuantity}</p>

                                <img
                                    onClick={() =>
                                        setLocalQuantity(prev => prev + 1)
                                    }
                                    src={assets.add_icon_green}
                                    alt="Increase quantity"
                                />
                            </div>

                            <button
                                className="add-cart-btn"
                                onClick={handleUpdateCart}
                                disabled={!isAvailable}
                            >
                                {isAvailable ? 'Add to Cart' : 'Out of Stock'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProductItem
