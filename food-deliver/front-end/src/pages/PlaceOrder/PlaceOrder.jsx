import { useContext, useEffect, useState } from 'react';
import './PlaceOrder.css';
import { useNavigate } from 'react-router-dom';
import { StoreContext } from '../../context/storeContext.js';
import axios from 'axios';
import { toast } from 'react-toastify';

const PlaceOrder = () => {
    const {
        token,
        getTotalCartAmount,
        loadingCart,
        loadingProductList,
        deliveryCharge,
        currency,
        url,
        loadCartData
    } = useContext(StoreContext);

    const navigate = useNavigate();

    const [data, setData] = useState({
        name: '',
        email: '',
        address: '',
        phone: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const subtotal = getTotalCartAmount();
    const deliveryFee = subtotal > 0 ? deliveryCharge : 0;
    const total = subtotal + deliveryFee;

    const formatPrice = price =>
        `${currency}${Number(price || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;

    useEffect(() => {
        if (loadingCart || loadingProductList || isSubmitting) return;

        if (!token || subtotal <= 0) {
            navigate('/cart', { replace: true });
        }
    }, [
        token,
        subtotal,
        loadingCart,
        loadingProductList,
        isSubmitting,
        navigate
    ]);

    const onChangeHandler = event => {
        const { name, value } = event.target;
        setData(prev => ({ ...prev, [name]: value }));
    };

    const placeOrder = async event => {
        event.preventDefault();

        if (!token) {
            toast.error('Please log in to place an order.');
            return;
        }

        if (subtotal <= 0) {
            toast.error('Your cart is empty.');
            navigate('/yourcart');
            return;
        }

        setIsSubmitting(true);

        try {
            const orderData = {
                address: {
                    name: data.name.trim(),
                    email: data.email.trim(),
                    address: data.address.trim(),
                    phone: data.phone.trim()
                }
            };

            const response = await axios.post(
                `${url}/api/order/place`,
                orderData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!response.data.success) {
                throw new Error(
                    response.data.message || 'Failed to place order.'
                );
            }

            toast.success('Your order has been placed successfully!');
            navigate('/myorders', { replace: true });
            await loadCartData(token);

        } catch (error) {
            console.error('Place order error:', error);
            toast.error(
                error.response?.data?.message ||
                error.message ||
                'Error placing order. Please try again.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loadingCart || loadingProductList) {
        return <p className="place-order-loading">Loading order information...</p>;
    }

    if (!token || subtotal <= 0) return null;

    return (
        <div>
            <form onSubmit={placeOrder} className="place-order">
                <div className="place-order-left">
                    <p className="title">Delivery Information</p>

                    <input
                        required
                        name="name"
                        type="text"
                        value={data.name}
                        onChange={onChangeHandler}
                        placeholder="Full Name"
                        autoComplete="name"
                    />

                    <input
                        required
                        name="email"
                        type="email"
                        value={data.email}
                        onChange={onChangeHandler}
                        placeholder="Email Address"
                        autoComplete="email"
                    />

                    <input
                        required
                        name="address"
                        type="text"
                        value={data.address}
                        onChange={onChangeHandler}
                        placeholder="Delivery Address"
                        autoComplete="street-address"
                    />

                    <input
                        required
                        name="phone"
                        type="tel"
                        value={data.phone}
                        onChange={onChangeHandler}
                        placeholder="Phone Number"
                        autoComplete="tel"
                    />
                </div>

                <div className="place-order-right">
                    <div className="cart-total">
                        <h2>Order Summary</h2>

                        <div>
                            <div className="cart-total-details">
                                <p>Subtotal</p>
                                <p>{formatPrice(subtotal)}</p>
                            </div>

                            <hr />

                            <div className="cart-total-details">
                                <p>Delivery Fee</p>
                                <p>{formatPrice(deliveryFee)}</p>
                            </div>

                            <hr />

                            <div className="cart-total-details">
                                <b>Total</b>
                                <b>{formatPrice(total)}</b>
                            </div>
                        </div>

                        <p className="payment-method">
                            Payment Method: Cash on Delivery (COD)
                        </p>

                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'PLACING ORDER...' : 'PLACE ORDER'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default PlaceOrder;
