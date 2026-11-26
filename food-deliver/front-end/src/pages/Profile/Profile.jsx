import { useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { StoreContext } from '../../context/storeContext'
import './Profile.css'

const emptyAddress = { name: '', phone: '', address: '', ward: '', city: '', note: '', isDefault: false }
const fields = { name: 'Recipient name', phone: 'Phone number', address: 'Street address', ward: 'Ward', city: 'City / province', note: 'Note' }

export function AddressFields({ value, onChange }) {
    return <>
        {Object.entries(fields).map(([key, name]) => <label key={key}>{name}
            <input name={key} type={key === 'phone' ? 'tel' : 'text'} value={value[key] || ''}
                onChange={event => onChange({ ...value, [key]: event.target.value })}
                required={key !== 'note'} maxLength={key === 'name' ? 120 : 250} />
        </label>)}
        <label className="profile-checkbox"><input type="checkbox" name="isDefault" checked={Boolean(value.isDefault)}
            onChange={event => onChange({ ...value, isDefault: event.target.checked })} /> Default address</label>
    </>
}

export default function Profile() {
    const { url, token } = useContext(StoreContext)
    const [profile, setProfile] = useState(null)
    const [address, setAddress] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    useEffect(() => {
        if (!token) return
        const controller = new AbortController()
        axios.get(`${url}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
            .then(({ data }) => setProfile(data.data))
            .catch(error => { if (!axios.isCancel(error)) setError(error.response?.data?.message || 'Could not load profile.') })
        return () => controller.abort()
    }, [url, token])
    const save = async (method, path, values, kind) => {
        if (busy) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const { data } = await axios({ method, url: `${url}/api/user/${path}`, data: values,
                headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
            setProfile(previous => kind === 'addresses' ? { ...previous, addresses: data.data } : { ...previous, ...data.data })
            setAddress(null)
            setMessage('Saved successfully.')
        } catch (error) {
            setError(error.response?.data?.message || 'Could not save. Please try again.')
        } finally { setBusy(false) }
    }
    if (!token) return <section className="profile-page"><h1>Profile & addresses</h1><p>Please sign in to manage your profile and addresses.</p></section>
    return (
        <section className="profile-page">
            <h1>Profile & addresses</h1>
            {error && <p role="alert" className="profile-error">{error}</p>}
            {message && <p role="status">{message}</p>}
            {!profile ? <p>Loading profile…</p> : <>
                <form className="profile-panel profile-fields" onSubmit={event => {
                    event.preventDefault()
                    save('put', 'profile', Object.fromEntries(new FormData(event.currentTarget)), 'profile')
                }}>
                    <h2>Personal information</h2>
                    {['name', 'phone', 'email'].map(key => <label key={key}>
                        {key === 'name' ? 'Full name' : key === 'phone' ? 'Phone number' : 'Email'}
                        <input name={key} type={key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'text'}
                            defaultValue={profile[key]} required maxLength={120} />
                    </label>)}
                    <button disabled={busy}>Save profile</button>
                </form>
                <div className="profile-panel">
                    <div className="profile-heading"><h2>Delivery addresses</h2>
                        <button disabled={busy} onClick={() => setAddress({ ...emptyAddress, name: profile.name, phone: profile.phone })}>Add address</button>
                    </div>
                    {profile.addresses.length === 0 && <p>No saved addresses.</p>}
                    {profile.addresses.map(item => <article className="profile-address" key={item._id}>
                        <strong>{item.name} · {item.phone}</strong>
                        {item.isDefault && <span className="profile-default">Default</span>}
                        <p>{[item.address, item.ward, item.city].filter(Boolean).join(', ')}</p>
                        {item.note && <p>{item.note}</p>}
                        <div className="profile-actions">
                            <button disabled={busy} onClick={() => setAddress(item)}>Edit</button>
                            {!item.isDefault && <button disabled={busy} onClick={() => save('put', 'addresses/' + item._id, { ...item, isDefault: true }, 'addresses')}>Set as default</button>}
                            <button disabled={busy} onClick={() => {
                                if (window.confirm(item.isDefault ? 'Delete this default address? You can choose another default afterwards.' : 'Delete this address?'))
                                    save('delete', 'addresses/' + item._id, {}, 'addresses')
                            }}>Delete</button>
                        </div>
                    </article>)}
                    {address && <form key={address._id || 'new'} className="profile-fields" onSubmit={event => {
                        event.preventDefault()
                        const form = new FormData(event.currentTarget)
                        save(address._id ? 'put' : 'post', 'addresses' + (address._id ? '/' + address._id : ''),
                            { ...Object.fromEntries(form), isDefault: form.has('isDefault') }, 'addresses')
                    }}>
                        <h3>{address._id ? 'Edit address' : 'New address'}</h3>
                        <AddressFields value={address} onChange={setAddress} />
                        <div className="profile-actions">
                            <button type="button" disabled={busy} onClick={() => setAddress(null)}>Cancel</button>
                            <button disabled={busy}>Save address</button>
                        </div>
                    </form>}
                </div>
            </>}
        </section>
    )
}
