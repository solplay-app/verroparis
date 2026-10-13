const crypto = require('crypto');

const API = 'https://api.jeko.africa';
const METHODS = ['orange', 'wave', 'mtn', 'moov', 'djamo'];
const MAX_FCFA = 2000000; // limite Jèko
// Jèko attend des "centimes" : 500 FCFA = 50000 (voir doc). Réglable si le test à 5 F montre autre chose.
const CENTS_FACTOR = Number(process.env.JEKO_CENTS_FACTOR || 100);
const MIN_FCFA = Number(process.env.MIN_DEPOSIT_FCFA || 500);

const toCents = (fcfa) => Math.round(fcfa * CENTS_FACTOR);

function validateAmount(v) {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  if (n < MIN_FCFA || n > MAX_FCFA) return null;
  return n;
}

// Signature HMAC-SHA256 (hex) calculée sur le corps BRUT.
function verifySignature(rawBody, received, secret) {
  if (!received || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const got = String(received).trim().replace(/^sha256=/i, '').toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createPaymentRequest({ amountFcfa, reference, method, successUrl, errorUrl }) {
  const r = await fetch(`${API}/partner_api/payment_requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.JEKO_API_KEY,
      'X-API-KEY-ID': process.env.JEKO_API_KEY_ID,
    },
    body: JSON.stringify({
      storeId: process.env.JEKO_STORE_ID,
      amountCents: toCents(amountFcfa),
      currency: 'XOF',
      reference,
      paymentDetails: { type: 'redirect', data: { paymentMethod: method, successUrl, errorUrl } },
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Jeko ${r.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (!json.redirectUrl) throw new Error('Jeko: redirectUrl manquant');
  return json;
}

module.exports = { METHODS, MAX_FCFA, MIN_FCFA, toCents, validateAmount, verifySignature, createPaymentRequest };
