import {
    formatMoney as formatPrice,
    toCents,
} from '../../../../shared/money.js';
import { useContext, useEffect, useRef, useState } from 'react';
import './PlaceOrder.css';
import { useNavigate } from 'react-router-dom';
import { StoreContext } from '../../context/storeContext.js';
import axios from 'axios';
import { toast } from 'react-toastify';
import { AddressFields } from '../Profile/Profile';

const PlaceOrder = () => {
    const {
        token,
        getTotalCartAmount,
        loadingCart,
        loadingProductList,
        deliveryCharge,
        url,
        loadCartData,
        cartItems,
        product_list,
        clearGuestCart,
        fetchProductList,
    } = useContext(StoreContext);

    const navigate = useNavigate();
    const completed = useRef(false);
    const deliveryEdited = useRef(false);

    const pending = useRef(null);
    if (!token && !pending.current) {
        try {
            const saved = JSON.parse(
                localStorage.getItem('guestCheckout') || 'null',
            );
            if (
                saved &&
                Array.isArray(saved.items) &&
                saved.address &&
                saved.requestId &&
                saved.trackingCode
            )
                pending.current = saved;
            else localStorage.removeItem('guestCheckout');
        } catch {
            localStorage.removeItem('guestCheckout');
        }
    }
    const [data, setData] = useState(
        pending.current?.address || {
            name: '',
            email: '',
            address: '',
            phone: '',
        },
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasPendingRequest, setRetryPending] = useState(Boolean(pending.current));
    const [codeInput, setCodeInput] = useState('');
    const [coupon, setCoupon] = useState(null);
    const [checkingCode, setCheckingCode] = useState(false);
    const [couponError, setCouponError] = useState('');
    const [note, setNote] = useState(pending.current?.note || '');
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState('');
    const [newAddress, setNewAddress] = useState(null);
    const [savingAddress, setSavingAddress] = useState(false);
    const [addressError, setAddressError] = useState('');
    const selectAddress = (address, email) => {
        deliveryEdited.current = true;
        setSelectedAddressId(address._id);
        setNote(previous => previous || address.note || '');
        setData(previous => ({
            ...previous, name: address.name, phone: address.phone,
            email: email ?? previous.email,
            address: [address.address, address.ward, address.city].filter(Boolean).join(', '),
        }));
    };
    useEffect(() => {
        if (!token) return;
        const controller = new AbortController();
        axios.get(`${url}/api/user/profile`, {
            headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        }).then(({ data: result }) => {
            setSavedAddresses(result.data.addresses);
            const defaultAddress = result.data.addresses.find(address => address.isDefault);
            if (defaultAddress && !deliveryEdited.current) selectAddress(defaultAddress, result.data.email);
        }).catch(error => {
            if (!axios.isCancel(error)) setAddressError('Could not load saved addresses. Reload the page or add a new delivery address.');
        });
        return () => controller.abort();
    }, [token, url]);

    const guestPending = token ? null : pending.current;
    const retryPending = !token && hasPendingRequest;
    const hasItems = guestPending
        ? guestPending.items.length > 0
        : product_list.some((product) => cartItems[product._id] > 0);
    const subtotal = guestPending
        ? guestPending.items.reduce(
              (sum, item) => sum + toCents(item.price) * item.quantity,
              0,
          ) / 100
        : getTotalCartAmount();
    const deliveryFee = hasItems ? deliveryCharge : 0;
    const applied = guestPending?.promotionCode
        ? { code: guestPending.promotionCode, discountAmount: guestPending.discountAmount }
        : token && coupon?.subtotal === subtotal ? coupon : null;
    const discount = applied?.discountAmount ?? 0;
    const total = guestPending?.expectedAmount ??
        (toCents(subtotal) + toCents(deliveryFee) - toCents(discount)) / 100;
    const cartLines = () => Object.entries(cartItems).map(([productId, quantity]) => ({ productId, quantity }));

    const applyCode = async () => {
        if (!token || checkingCode || isSubmitting) return;
        if (!codeInput.trim()) {
            setCouponError('Enter a promo code.');
            return;
        }
        setCheckingCode(true);
        setCouponError('');
        try {
            const { data } = await axios.post(`${url}/api/order/quote`, {
                items: cartLines(), promotionCode: codeInput.trim(),
            }, { timeout: 10000, headers: { Authorization: `Bearer ${token}` } });
            if (toCents(data.data.subtotal) !== toCents(subtotal)) {
                setCouponError('Cart prices have changed. Review the new total and apply the code again.');
                await fetchProductList();
                return;
            }
            setCoupon(data.data);
        } catch (error) {
            setCouponError(error.response?.data?.message || 'Could not check the promo code.');
        } finally {
            setCheckingCode(false);
        }
    };

    useEffect(() => {
        if (
            completed.current ||
            loadingCart ||
            loadingProductList ||
            isSubmitting
        )
            return;

        if (!hasItems) {
            navigate('/cart', { replace: true });
        }
    }, [
        token,
        hasItems,
        loadingCart,
        loadingProductList,
        isSubmitting,
        navigate,
    ]);

    const onChangeHandler = (event) => {
        const { name, value } = event.target;
        deliveryEdited.current = true;
        setSelectedAddressId('');
        setData((prev) => ({ ...prev, [name]: value }));
    };
    const saveNewAddress = async event => {
        event.preventDefault();
        if (savingAddress) return;
        setSavingAddress(true);
        setAddressError('');
        try {
            const { data: result } = await axios.post(`${url}/api/user/addresses`, newAddress, {
                headers: { Authorization: `Bearer ${token}` }, timeout: 10000,
            });
            setSavedAddresses(result.data);
            const added = result.data.find(address => address._id === result.addressId);
            if (!added) throw new Error('Saved address could not be selected. Please reload the address list.');
            selectAddress(added);
            setNewAddress(null);
        } catch (error) {
            setAddressError(error.response?.data?.message || error.message || 'Could not save address. Please try again.');
        } finally { setSavingAddress(false); }
    };

    const placeOrder = async (event) => {
        event.preventDefault();
        if (checkingCode || isSubmitting || savingAddress || newAddress) return;
        if (token && !selectedAddressId) {
            toast.error('Choose a saved delivery address or add a new address before placing the order.');
            return;
        }
        if (token && coupon && !applied) {
            setCoupon(null);
            setCouponError('Your cart changed. Apply the code again before placing the order.');
            return;
        }

        if (!hasItems) {
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
                    phone: data.phone.trim(),
                },
                expectedAmount: total,
                note: note.trim(),
                ...(token && selectedAddressId && { addressId: selectedAddressId }),
            };

            let response;
            if (token) {
                response = await axios.post(
                    `${url}/api/order/place`,
                    { ...orderData, ...(applied && { promotionCode: applied.code }) },
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    },
                );
                completed.current = true;
                navigate('/myorders', { replace: true, state: { memberOrderId: response.data.orderId } });
                await loadCartData(token);
            } else {
                if (!pending.current) {
                    const trackingCode = Array.from(
                        crypto.getRandomValues(new Uint8Array(32)),
                        (byte) => byte.toString(16).padStart(2, '0'),
                    ).join('');
                    pending.current = {
                        ...orderData,
                        requestId: crypto.randomUUID(),
                        trackingCode,
                        items: cartLines().map(
                            (line) => ({
                                ...line,
                                price:
                                    toCents(
                                        product_list.find(
                                            (product) =>
                                                product._id === line.productId,
                                        )?.price,
                                    ) / 100,
                            }),
                        ),
                    };
                }
                localStorage.setItem(
                    'guestCheckout',
                    JSON.stringify(pending.current),
                );
                setRetryPending(true);
                response = await axios.post(
                    `${url}/api/order/guest`,
                    pending.current,
                    { timeout: 20000 },
                );
                const receipt = {
                    order: response.data.order,
                    trackingCode: pending.current.trackingCode,
                };
                let saved = [];
                try {
                    saved = JSON.parse(
                        localStorage.getItem('guestOrders') || '[]',
                    );
                } catch {
                    /* Start a new local list. */
                }
                if (!Array.isArray(saved)) saved = [];
                const credentials = {
                    orderCode: receipt.order.orderCode,
                    trackingCode: receipt.trackingCode,
                };
                try {
                    localStorage.setItem(
                        'guestOrders',
                        JSON.stringify([
                            credentials,
                            ...saved.filter(
                                (item) =>
                                    item &&
                                    item.orderCode !== credentials.orderCode,
                            ),
                        ]),
                    );
                } catch {
                    toast.info(
                        'Order received. Please save the order and tracking codes shown on the next page.',
                    );
                }
                completed.current = true;
                clearGuestCart(pending.current.items);
                localStorage.removeItem('guestCheckout');
                pending.current = null;
                navigate('/myorders', { replace: true, state: receipt });
            }
            toast.success('Order placed successfully.');
        } catch (error) {
            if (
                error.response?.status >= 400 &&
                error.response?.status < 500 &&
                error.response.status !== 429
            ) {
                if (!token) {
                    localStorage.removeItem('guestCheckout');
                    pending.current = null;
                    setRetryPending(false);
                }
                if (error.response.status === 409) {
                    setCoupon(null);
                    if (applied) setCouponError(error.response.data?.message || 'Apply the promo code again.');
                    await fetchProductList();
                }
            }
            toast.error(
                error.response?.data?.message ||
                    error.message ||
                    'Error placing order. Please try again.',
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loadingCart || loadingProductList) {
        return (
            <p className="place-order-loading">Loading order information...</p>
        );
    }

    if (!hasItems) return null;

    return (
        <div>
            <form onSubmit={placeOrder} className="place-order">
                <div className="place-order-left">
                    <p className="title">Delivery Information</p>
                    {addressError && <p role="alert">{addressError}</p>}
                    {token && savedAddresses.length > 0 && <label>Saved address
                        <select aria-label="Saved address" value={selectedAddressId} onChange={event => {
                            const address = savedAddresses.find(item => item._id === event.target.value);
                            deliveryEdited.current = true;
                            if (address) selectAddress(address);
                            else setSelectedAddressId('');
                        }}>
                            <option value="">Choose an address</option>
                            {savedAddresses.map(address => <option key={address._id} value={address._id}>
                                {address.name} · {address.address}{address.isDefault ? ' (Default)' : ''}
                            </option>)}
                        </select>
                    </label>}
                    {token && <button type="button" className="button-light" onClick={() => {
                        deliveryEdited.current = true;
                        setAddressError('');
                        setNewAddress({ name: data.name, phone: data.phone, address: '', ward: '', city: '', note: '', isDefault: false });
                    }}>Add a saved address</button>}

                    <input
                        required
                        name="name"
                        type="text"
                        value={data.name}
                        onChange={onChangeHandler}
                        readOnly={retryPending || Boolean(token && selectedAddressId)}
                        placeholder="Full Name"
                        autoComplete="name"
                    />

                    <input
                        name="email"
                        type="email"
                        value={data.email}
                        onChange={onChangeHandler}
                        readOnly={retryPending || Boolean(token && selectedAddressId)}
                        placeholder="Email (optional)"
                        autoComplete="email"
                    />

                    <input
                        required
                        name="address"
                        type="text"
                        value={data.address}
                        onChange={onChangeHandler}
                        readOnly={retryPending || Boolean(token && selectedAddressId)}
                        placeholder="Delivery Address"
                        autoComplete="street-address"
                    />

                    <input
                        required
                        name="phone"
                        type="tel"
                        value={data.phone}
                        onChange={onChangeHandler}
                        readOnly={retryPending || Boolean(token && selectedAddressId)}
                        placeholder="Phone Number"
                        autoComplete="tel"
                    />
                    <label>Order note
                        <textarea name="note" value={note} maxLength={1000} rows={3} readOnly={retryPending}
                            onChange={event => setNote(event.target.value)} placeholder="Delivery instructions or requests for your order" />
                    </label>
                </div>

                <div className="place-order-right">
                    <div className="cart-total">
                        <h2>Order Summary</h2>

                        {token && (
                            <div className="checkout-promo">
                                <label htmlFor="checkout-promo-code">Promo code</label>
                                <div>
                                    <input id="checkout-promo-code" maxLength={24} value={applied?.code || codeInput}
                                        disabled={checkingCode || isSubmitting || Boolean(applied)} autoComplete="off"
                                        onChange={(event) => { setCodeInput(event.target.value); setCouponError(''); }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') { event.preventDefault(); applyCode(); }
                                        }} />
                                    {applied ? (
                                        <button type="button" disabled={isSubmitting}
                                            onClick={() => { setCoupon(null); setCodeInput(''); }}>Remove</button>
                                    ) : (
                                        <button type="button" disabled={checkingCode || isSubmitting} onClick={applyCode}>Apply</button>
                                    )}
                                </div>
                                {couponError && <p role="alert">{couponError}</p>}
                            </div>
                        )}
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

                            {applied && (
                                <div className="cart-total-details">
                                    <p>Discount ({applied.code})</p>
                                    <p>−{formatPrice(discount)}</p>
                                </div>
                            )}
                            <div className="cart-total-details">
                                <b>Total</b>
                                <b>{formatPrice(total)}</b>
                            </div>
                        </div>

                        <p className="payment-method">
                            Payment Method: Cash on Delivery (COD)
                        </p>

                        {retryPending && !isSubmitting && (
                            <p className="payment-method">
                                Your previous request is saved. Submit again to
                                retrieve its result.
                            </p>
                        )}
                        <button type="submit" disabled={isSubmitting || checkingCode}>
                            {isSubmitting ? 'PLACING ORDER...' : 'PLACE ORDER'}
                        </button>
                    </div>
                </div>
            </form>
            {newAddress && <div className="checkout-address-overlay">
                <section className="checkout-address-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-address-title">
                    <h2 id="checkout-address-title">New delivery address</h2>
                    <form className="profile-fields" onSubmit={saveNewAddress}>
                        <AddressFields value={newAddress} onChange={setNewAddress} />
                        {addressError && <p role="alert">{addressError}</p>}
                        <div className="profile-actions">
                            <button type="button" disabled={savingAddress} onClick={() => setNewAddress(null)}>Cancel</button>
                            <button disabled={savingAddress}>{savingAddress ? 'Saving…' : 'Save and use address'}</button>
                        </div>
                    </form>
                </section>
            </div>}
        </div>
    );
};

export default PlaceOrder;
