
import { useState, useContext } from 'react';
import './LoginPopup.css';
import { assets } from '../../assets/assets';
import { StoreContext } from '../../context/storeContext.js'
import axios from 'axios';
import { toast } from 'react-toastify';

const LoginPopup = ({ setShowLogin }) => {
    const { url, setToken, setRole } = useContext(StoreContext);
    const [currState, setCurrState] = useState('Login');
    const [data, setData] = useState({ name: '', email: '', password: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onChangHandler = (event) => {
        const name = event.target.name;
        const value = event.target.value;
        setData((d) => ({ ...d, [name]: value }));
    };

    const onLogin = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        let newUrl = url;
        if (currState === 'Login') {
            newUrl += '/api/user/login';
        } else {
            newUrl += '/api/user/register';
        }

        try {
            const response = await axios.post(newUrl, { ...data, role: 'user' });

            if (response.data.success) {
                const { token, role } = response.data;
                if (role !== 'user' || !token) {
                    toast.error('Please sign in with a customer account.');
                    return;
                }
                setToken(token);
                setRole(role);
                localStorage.setItem('token', token);
                localStorage.setItem('role', role);
                setShowLogin(false);
                toast.success(currState === 'Login' ? 'Login Successful!' : 'Registration Successful!');

            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            if (error.response && error.response.data && error.response.data.message) {
                toast.error(error.response.data.message);
            } else {
                toast.error('An error occurred. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-popup">
            <form onSubmit={onLogin} className="login-popup-container">
                <div className="login-popup-title">
                    <h2>{currState}</h2>
                    <img onClick={() => setShowLogin(false)} src={assets.cross_icon} alt="" />
                </div>
                <div className="login-popup-inputs">
                    {currState === 'Login' ? null : (
                        <input
                            type="text"
                            name="name"
                            onChange={onChangHandler}
                            value={data.name}
                            placeholder="Your Name"
                            required
                        />
                    )}

                    <input
                        type="email"
                        name="email"
                        onChange={onChangHandler}
                        value={data.email}
                        placeholder="Your Email"
                        required
                    />

                    <input
                        type="password"
                        name="password"
                        onChange={onChangHandler}
                        value={data.password}
                        placeholder="Your Password"
                        autoComplete={currState === 'Login' ? 'current-password' : 'new-password'}
                        minLength={currState === 'Sign Up' ? 8 : undefined}
                        required
                    />
                </div>

                <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait...' : currState === 'Sign Up' ? 'Create Account' : 'Login'}</button>

                {currState === 'Sign Up' && (
                    <div className="login-popup-condition">
                        <input type="checkbox" required />
                        <p>By continuing, I agree to the terms of use and privacy policy.</p>
                    </div>
                )}

                {currState === 'Login' ? (
                    <p>
                        Create a new account? <span onClick={() => setCurrState('Sign Up')}>Click here</span>
                    </p>
                ) : (
                    <p>
                        Already have an account? <span onClick={() => setCurrState('Login')}>Login here</span>
                    </p>
                )}
            </form>
        </div>
    );
};

export default LoginPopup;
