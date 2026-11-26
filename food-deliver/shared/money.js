// Store prices in USD and perform arithmetic in integer cents.
export const toCents = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
        throw new RangeError('Price must be a valid USD amount.');
    }
    const amount = Number(value);
    const [coefficient, exponent = 0] = String(amount).split('e');
    const cents = Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents)) {
        throw new RangeError('Price must be a non-negative USD amount within the supported range.');
    }
    return cents;
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatMoney = value => usd.format(Number(value ?? 0));
