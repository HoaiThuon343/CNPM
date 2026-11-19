
import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import Navbar from './components/Navbar/Navbar'
import Sidebar from './components/Sidebar/Sidebar'

import Login from './pages/Login/Login'
import User from './pages/User/User'
import Add from './pages/Product/Add'
import List from './pages/Product/List'
import Update from './pages/Product/Update'

const App = () => {
    const url = 'http://localhost:4000'

    const [auth, setAuth] = useState({ token: '', role: null })
    const [checkingAuth, setCheckingAuth] = useState(true)

    const isAdmin = auth.token && auth.role === 'admin'

    const handleLogin = (token, role) => {
        localStorage.setItem('token', token)
        localStorage.setItem('role', role)

        setAuth({ token, role })
    }

    const handleLogout = useCallback(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('role')

        setAuth({ token: '', role: null })
    }, [])

    useEffect(() => {
        let active = true
        const token = localStorage.getItem('token')
        const interceptor = axios.interceptors.response.use(response => response, error => {
            if (error.config?.url?.startsWith(`${url}/api/`) && [401, 403].includes(error.response?.status)) {
                handleLogout()
            }
            return Promise.reject(error)
        })

        const restoreLogin = async () => {
            try {
                if (!token) return
                const { data } = await axios.get(`${url}/api/user/me`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (!active) return
                if (!data.success || data.user.role !== 'admin') {
                    handleLogout()
                    return
                }
                handleLogin(token, data.user.role)
            } catch {
                if (active) handleLogout()
            } finally {
                if (active) setCheckingAuth(false)
            }
        }

        restoreLogin()
        return () => {
            active = false
            axios.interceptors.response.eject(interceptor)
        }
    }, [handleLogout])

    if (checkingAuth) return <p>Loading...</p>

    return (
        <>
            <ToastContainer />

            {!isAdmin ? (
                <Routes>
                    <Route path="/login" element={<Login url={url} onLogin={handleLogin} />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            ) : (
                <>
                    <Navbar onLogout={handleLogout} />

                    <div className="app-container">
                        <div className="main-layout">
                            <div className="left-column">
                                <Sidebar />
                            </div>

                            <div className="right-content">
                                <Routes>
                                    <Route path="/user" element={<User url={url} />} />
                                    <Route path="/products" element={<List url={url} />} />
                                    <Route path="/products/list" element={<List url={url} />} />
                                    <Route path="/products/add" element={<Add url={url} />} />
                                    <Route path="/products/update" element={<Update url={url} />} />
                                    <Route path="*" element={<Navigate to="/products/list" replace />} />
                                </Routes>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    )
}

export default App
