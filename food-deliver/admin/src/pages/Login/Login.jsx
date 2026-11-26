
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
                { ...data, portal: 'admin' },
                { timeout: 15000 }
            )

            if (!response.data.success) {
                throw new Error(
                    response.data.message || 'Đăng nhập không thành công.'
                )
            }

            const { token, role } = response.data

            if (!['admin', 'staff'].includes(role)) {
                throw new Error(
                    'Tài khoản không có quyền truy cập trang quản trị.'
                )
            }

            if (!token) {
                throw new Error('Chưa nhận được thông tin phiên đăng nhập.')
            }

            await onLogin(token, role)

            toast.success('Đăng nhập thành công!')

        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                (error.code === 'ERR_NETWORK'
                    ? 'Không kết nối được máy chủ đăng nhập. Vui lòng thử lại sau.'
                    : error.code === 'ECONNABORTED'
                        ? 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'
                        : error.message || 'Không đăng nhập được. Vui lòng thử lại.')
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
                <h2>Quản trị FB</h2>
                <p>Đăng nhập dành cho quản trị viên và nhân viên.</p>

                <div className="admin-login-field">
                    <label htmlFor="email">Email hoặc số điện thoại</label>
                    <input
                        id="email"
                        type="text"
                        name="email"
                        value={data.email}
                        onChange={onChangeHandler}
                        placeholder="Nhập email hoặc số điện thoại"
                        autoComplete="username"
                        required
                    />
                </div>

                <div className="admin-login-field">
                    <label htmlFor="password">Mật khẩu</label>
                    <input
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        onChange={onChangeHandler}
                        placeholder="Nhập mật khẩu"
                        autoComplete="current-password"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
                </button>
            </form>
        </div>
    )
}

export default Login
