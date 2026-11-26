import { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { formatMoney } from '../../../../shared/money.js'
import { StoreContext } from '../../context/storeContext.js'
import './Offers.css'

const expiry = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
})

export default function Offers() {
    const { url, token } = useContext(StoreContext)
    const [result, setResult] = useState(null)

    useEffect(() => {
        const controller = new AbortController()
        axios.get(`${url}/api/promotions/available`, { signal: controller.signal, timeout: 10000 })
            .then(({ data }) => setResult({ offers: data.data }))
            .catch((error) => {
                if (!axios.isCancel(error)) setResult({ error: 'Could not load offers. Please try again.' })
            })
        return () => controller.abort()
    }, [url])

    return (
        <section className="offers-page">
            <header><h1>Offers &amp; Coupons</h1><Link to="/menu">View menu →</Link></header>
            {!token && result?.offers?.length > 0 && <p className="offers-sign-in">Sign in to use a promo code at checkout.</p>}
            {!result && <p>Loading offers…</p>}
            {result?.error && <p role="alert">{result.error}</p>}
            {result?.offers?.length === 0 && <p>No offers are available right now.</p>}
            <div className="offers-grid">
                {result?.offers?.map((offer) => (
                    <article key={offer.code}>
                        <h2>{offer.name}</h2>
                        <strong>{offer.type === 'percent' ? `${offer.value}%` : formatMoney(offer.value)} off</strong>
                        {offer.description && <p>{offer.description}</p>}
                        <p>Minimum food subtotal: {formatMoney(offer.minimum)}</p>
                        {offer.maximumDiscount != null && <p>Maximum discount: {formatMoney(offer.maximumDiscount)}</p>}
                        <p>Ends {expiry.format(new Date(offer.endsAt))} (Vietnam time)</p>
                        <p>Code: <code>{offer.code}</code></p>
                    </article>
                ))}
            </div>
        </section>
    )
}
