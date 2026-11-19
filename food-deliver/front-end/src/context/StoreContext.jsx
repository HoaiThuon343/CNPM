
import { useEffect, useState, useCallback } from "react";
import { menu_list } from "../assets/assets";
import axios from "axios";
import { StoreContext } from "./storeContext.js";
import { toast } from "react-toastify";

const StoreContextProvider = (props) => {
    const url = "http://localhost:4000";

    const [product_list, setProductList] = useState([]);
    const [loadingProductList, setLoadingProductList] = useState(true);
    const [cartItems, setCartItems] = useState({});
    const [loadingCart, setLoadingCart] = useState(
        () => Boolean(localStorage.getItem("token"))
    );

    const [token, setToken] = useState(
        () => localStorage.getItem("token") || ""
    );
    const [showLogin, setShowLogin] = useState(false);
    const [role, setRole] = useState(null);
    const [category, setCategory] = useState("All");

    const currency = "$";
    const deliveryCharge = 5;

    const logout = useCallback(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        setToken("");
        setRole(null);
        setCartItems({});
        setLoadingCart(false);
    }, []);

    useEffect(() => {
        const interceptor = axios.interceptors.response.use(response => response, error => {
            if (error.config?.url?.startsWith(`${url}/api/`) && [401, 403].includes(error.response?.status)) {
                logout();
            }
            return Promise.reject(error);
        });
        return () => axios.interceptors.response.eject(interceptor);
    }, [logout]);

    // Add product to cart
    const addToCart = async (itemId, quantity = 1) => {
        const itemInfo = product_list.find(
            product => product._id === itemId
        );

        const addQuantity = Number(quantity);

        if (!token) {
            throw new Error("Please log in to add products to your cart.");
        }

        if (!itemInfo) {
            throw new Error("Product not found.");
        }

        if (itemInfo.status !== "active") {
            throw new Error("Product is currently unavailable.");
        }

        if (!Number.isInteger(addQuantity) || addQuantity < 1) {
            throw new Error("Invalid product quantity.");
        }

        const response = await axios.post(
            `${url}/api/cart/add`,
            { itemId, quantity: addQuantity },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.data.success) {
            throw new Error(
                response.data.message || "Failed to add product."
            );
        }

        setCartItems(response.data.cartItems || {});
    };

    // Decrease product quantity by one
    const removeFromCart = async (itemId) => {
        if (!token) {
            throw new Error("Please log in to update your cart.");
        }

        const response = await axios.post(
            `${url}/api/cart/remove`,
            { itemId },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.data.success) {
            throw new Error(
                response.data.message || "Failed to update cart."
            );
        }

        setCartItems(response.data.cartItems || {});
    };

    // Remove product completely from cart
    const deleteItemFromCart = async (itemId) => {
        if (!token) {
            throw new Error("Please log in to update your cart.");
        }

        const response = await axios.post(
            `${url}/api/cart/delete`,
            { itemId },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.data.success) {
            throw new Error(
                response.data.message || "Failed to remove product."
            );
        }

        setCartItems(response.data.cartItems || {});
    };

    // Calculate total cart amount
    const getTotalCartAmount = () => {
        return Object.entries(cartItems).reduce(
            (total, [productId, quantity]) => {
                const itemInfo = product_list.find(
                    product => product._id === productId
                );

                if (itemInfo && Number(quantity) > 0) {
                    return total +
                        Number(itemInfo.price) * Number(quantity);
                }

                return total;
            },
            0
        );
    };

    // Fetch product list
    const fetchProductList = useCallback(async () => {
        try {
            const response = await axios.get(
                `${url}/api/product/all`
            );

            if (response.data.success) {
                setProductList(response.data.data || []);
            } else {
                throw new Error(
                    response.data.message || "Failed to load products."
                );
            }
        } catch (error) {
            console.error("Fetch product list error:", error);
            toast.error("Could not load products.");
        } finally {
            setLoadingProductList(false);
        }
    }, [url]);

    // Load cart data
    const loadCartData = useCallback(async (authToken, signal) => {
        if (!authToken) {
            setCartItems({});
            setLoadingCart(false);
            return;
        }

        setLoadingCart(true);

        try {
            const response = await axios.post(
                `${url}/api/cart/get`,
                {},
                {
                    signal,
                    headers: {
                        Authorization: `Bearer ${authToken}`
                    }
                }
            );

            if (!response.data.success) {
                throw new Error(
                    response.data.message || "Failed to load cart."
                );
            }

            setCartItems(response.data.cartItems || {});
        } catch (error) {
            if (axios.isCancel(error)) return;
            console.error("Load cart error:", error);
            toast.error("Could not load your cart.");
        } finally {
            if (!signal?.aborted) setLoadingCart(false);
        }
    }, [url]);

    // Fetch products when the application starts
    useEffect(() => {
        fetchProductList();
    }, [fetchProductList]);

    // Verify the account before restoring its cart
    useEffect(() => {
        if (!token) return;
        const controller = new AbortController();

        const restoreLogin = async () => {
            try {
                const { data } = await axios.get(`${url}/api/user/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal
                });
                if (!data.success || data.user.role !== 'user') {
                    logout();
                    return;
                }
                setRole(data.user.role);
                localStorage.setItem("role", data.user.role);
                await loadCartData(token, controller.signal);
            } catch (error) {
                if (!axios.isCancel(error)) logout();
            }
        };

        restoreLogin();
        return () => controller.abort();
    }, [token, loadCartData, logout]);

    const contextValue = {
        url,

        // Products
        product_list,
        loadingProductList,
        fetchProductList,

        // Temporary compatibility aliases
        food_list: product_list,
        loadingFoodList: loadingProductList,
        fetchFoodList: fetchProductList,

        // Menu
        menu_list,
        category,
        setCategory,

        // Cart
        cartItems,
        loadingCart,
        setCartItems,
        addToCart,
        removeFromCart,
        deleteItemFromCart,
        getTotalCartAmount,
        loadCartData,

        // Authentication
        token,
        setToken,
        role,
        setRole,
        logout,
        showLogin,
        setShowLogin,

        // Currency
        currency,
        deliveryCharge
    };

    return (
        <StoreContext.Provider value={contextValue}>
            {props.children}
        </StoreContext.Provider>
    );
};

export default StoreContextProvider;
