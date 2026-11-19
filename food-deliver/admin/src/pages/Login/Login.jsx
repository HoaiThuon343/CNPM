
import { useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Login.css'

const Login = ({ url, onLogin }) => {
    const [data, setData] = useState({
        email: '',
        password: ''
    })

    const [isSubmitting, setIsSubmitting] = useState(false)

    const onChangeHandler = (event) => {
        const { name, value } = event.target

        setData(prev => ({
            ...prev,
            [name]: value
        }))
    }

    const onSubmitHandler = async (event) => {
        event.preventDefault()
        setIsSubmitting(true)

        try {
            const response = await axios.post(
                `${url}/api/user/login`,
                { ...data, role: 'admin' }
            )

            if (!response.data.success) {
                throw new Error(
                    response.data.message || 'Login failed.'
                )
            }

            const { token, role } = response.data

            if (role !== 'admin') {
                throw new Error(
                    'Access denied. This account is not an administrator.'
                )
            }

            if (!token) {
                throw new Error('Login token was not provided.')
            }

            onLogin(token, role)

            toast.success('Admin login successful!')

        } catch (error) {
            console.error('Admin login error:', error)

            toast.error(
                error.response?.data?.message ||
                error.message ||
                'Unable to log in. Please try again.'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="admin-login">
            <form
                className="admin-login-form"
                onSubmit={onSubmitHandler}
            >
                <h2>Admin Login</h2>
                <p>Sign in to access the administration panel.</p>

                <div className="admin-login-field">
                    <label htmlFor="email">Email Address</label>
                    <input
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        onChange={onChangeHandler}
                        placeholder="Enter your email"
                        autoComplete="username"
                        required
                    />
                </div>

                <div className="admin-login-field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        onChange={onChangeHandler}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'SIGNING IN...' : 'SIGN IN'}
                </button>
            </form>
        </div>
    )
}

export default Login
