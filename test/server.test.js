const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { makeDb } = require('./mockdb');

process.env.JEKO_WEBHOOK_SECRET = 'whsec';
const db = makeDb();
// token de test = "uid|email|verified|admin"
const auth = { verifyIdToken: async (t) => { const [uid, email, v] = t.split('|'); if (!uid) throw new Error('bad'); return { uid, email, email_verified: v === '1' }; } };
require.cache[require.resolve('../netlify/functions/lib/admin.js')] = { id: 'x', filename: 'x', loaded: true, exports: { db, auth, admin: {} } };

const F = (n) => require(`../netlify/functions/${n}`).handler;
const call = (h, token, body) => h({ httpMethod: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const bal = (u) => db._get(`users/${u}/balance`);
const FUT = new Date(Date.now() + 5 * 3600e3).toISOString();
const PAST = new Date(Date.now() - 5 * 3600e3).toISOString();

(async () => {
  db._set('users/u1', { id: 'u1', balance: 10000, isAdmin: false });
  db._set('users/adm', { id: 'adm', balance: 0, isAdmin: true });

  // ---------- WEBHOOK ----------
  db._set('deposits/d1', { id: 'd1', reference: 'dep_d1', userId: 'u1', amount: 5000, status: 'pending' });
  const wh = (payload, sig) => F('jeko-webhook')({ httpMethod: 'POST', headers: { 'jeko-signature': sig }, body: payload });
  const mk = (o = {}) => JSON.stringify({ event: 'payment_request.succeeded', data: { id: 'pr_1', reference: 'dep_d1', amountCents: 500000, currency: 'XOF', status: 'succeeded', ...o } });
  const sign = (b) => crypto.createHmac('sha256', 'whsec').update(b).digest('hex');
  let p = mk();
  assert.strictEqual((await wh(p, 'deadbeef')).statusCode, 401);
  assert.strictEqual(bal('u1'), 10000);
  assert.strictEqual((await wh(p, sign(p))).statusCode, 200);
  assert.strictEqual(bal('u1'), 15000);
  await wh(p, sign(p)); await wh(p, sign(p));                    // renvois Jèko
  assert.strictEqual(bal('u1'), 15000, 'idempotence');
  db._set('deposits/d2', { id: 'd2', reference: 'dep_d2', userId: 'u1', amount: 1000, status: 'pending' });
  p = mk({ reference: 'dep_d2', amountCents: 999999 });          // montant falsifié
  await wh(p, sign(p));
  assert.strictEqual(bal('u1'), 15000); assert.strictEqual(db._get('deposits/d2/status'), 'mismatch');

  // ---------- PARI ----------
  db._set('matchesCache', { cachedAt: new Date().toISOString(), matches: [
    { id: 'm1', sport: 'football', homeTeam: 'A', awayTeam: 'B', commenceTime: FUT, status: 'upcoming' },
    { id: 'm2', sport: 'football', homeTeam: 'C', awayTeam: 'D', commenceTime: PAST, status: 'live' },
    { id: 'm3', sport: 'basketball', homeTeam: 'E', awayTeam: 'F', commenceTime: FUT, status: 'upcoming' }] });
  db._set('oddsCache', {
    m1: [{ oddsId: 'm1_h2h_A', marketKey: 'h2h', outcomeLabel: 'A', price: 2.14 }, { oddsId: 'm1_btts_Oui', marketKey: 'btts', outcomeLabel: 'Oui', price: 1.9 }],
    m2: [{ oddsId: 'm2_h2h_C', marketKey: 'h2h', outcomeLabel: 'C', price: 2 }], m3: [{ oddsId: 'm3_h2h_E', marketKey: 'h2h', outcomeLabel: 'E', price: 2 }] });
  const bet = (picks, stake, tok = 'u1|u@x|1') => call(F('place-bet'), tok, { picks, stake });
  assert.strictEqual((await bet([{ matchId: 'm1', oddsId: 'm1_h2h_A' }], 1000, null)).statusCode, 401);
  assert.strictEqual((await bet([{ matchId: 'm1', oddsId: 'FAKE' }], 1000)).statusCode, 400);                 // cote inventée
  assert.strictEqual((await bet([{ matchId: 'm2', oddsId: 'm2_h2h_C' }], 1000)).statusCode, 400);             // match commencé
  assert.strictEqual((await bet([{ matchId: 'm3', oddsId: 'm3_h2h_E' }], 1000)).statusCode, 400);             // pas football
  assert.strictEqual((await bet([{ matchId: 'm1', oddsId: 'm1_h2h_A' }], 99)).statusCode, 400);               // mise trop basse
  assert.strictEqual((await bet([{ matchId: 'm1', oddsId: 'm1_h2h_A' }], 999999)).statusCode, 400);           // mise trop haute
  assert.strictEqual((await bet([{ matchId: 'm1', oddsId: 'm1_h2h_A' }], 1e9)).statusCode, 400);
  assert.strictEqual(bal('u1'), 15000, 'aucun débit sur les refus');
  const ok = await bet([{ matchId: 'm1', oddsId: 'm1_h2h_A' }], 1000);
  assert.strictEqual(ok.statusCode, 200);
  const coupon = JSON.parse(ok.body).coupon;
  assert.strictEqual(coupon.picks[0].odds.price, Math.max(1.01, Math.round(2.14 / 1.07 * 100) / 100)); // 2.00 : marge appliquée
  assert.strictEqual(coupon.potentialPayout, 2000); assert.strictEqual(bal('u1'), 14000);
  db._set('users/poor', { id: 'poor', balance: 50, isAdmin: false });
  assert.strictEqual((await bet([{ matchId: 'm1', oddsId: 'm1_h2h_A' }], 1000, 'poor|p@x|1')).statusCode, 400);
  assert.strictEqual(bal('poor'), 50);

  // ---------- RÈGLEMENT ----------
  const { settleCoupons } = require('../netlify/functions/lib/settle');
  assert.deepStrictEqual(await settleCoupons({}), { settled: 0, voided: 0 });    // pas de résultat
  db._set('results/m1', { homeTeam: 'A', awayTeam: 'B', homeScore: 2, awayScore: 0 });
  const r1 = await settleCoupons({});
  assert.strictEqual(r1.settled, 1);
  // gain 2000, stake 1000 → bénéfice 1000, commission 300 → net 1700
  assert.strictEqual(bal('u1'), 14000 + 1700);
  await settleCoupons({}); await settleCoupons({ userId: 'u1' });
  assert.strictEqual(bal('u1'), 15700, 'pas de double paiement');
  assert.strictEqual(db._get(`coupons/${coupon.id}/status`), 'won');
  // perdu → cashback 30 %
  const lost = JSON.parse((await bet([{ matchId: 'm1', oddsId: 'm1_btts_Oui' }], 1000)).body).coupon;
  assert.strictEqual(bal('u1'), 14700);
  await settleCoupons({});                                                       // 2-0 : les deux n'ont pas marqué
  assert.strictEqual(db._get(`coupons/${lost.id}/status`), 'lost'); assert.strictEqual(bal('u1'), 14700 + 300);
  // match annulé → remboursement
  db._set('matchesCache/matches/3', { id: 'm4', sport: 'football', homeTeam: 'G', awayTeam: 'H', commenceTime: FUT, status: 'upcoming' });
  db._set('oddsCache/m4', [{ oddsId: 'm4_h2h_G', marketKey: 'h2h', outcomeLabel: 'G', price: 3 }]);
  const v = JSON.parse((await bet([{ matchId: 'm4', oddsId: 'm4_h2h_G' }], 2000)).body).coupon;
  const before = bal('u1'); db._set('results/m4', { void: true });
  await settleCoupons({}); assert.strictEqual(bal('u1'), before + 2000); assert.strictEqual(db._get(`coupons/${v.id}/status`), 'void');
  // sans résultat depuis > 72 h → remboursement
  db._set('coupons/old', { id: 'old', userId: 'u1', stake: 500, status: 'pending', potentialPayout: 900, picks: [{ match: { id: 'mX', commenceTime: new Date(Date.now() - 80 * 3600e3).toISOString() }, odds: { marketKey: 'h2h', outcomeLabel: 'Z', price: 1.8 } }] });
  const b2 = bal('u1'); await settleCoupons({}); assert.strictEqual(bal('u1'), b2 + 500);

  // ---------- RETRAIT ----------
  const wd = (body, tok = 'u1|u@x|1') => call(F('request-withdraw'), tok, body);
  const B = bal('u1');
  assert.strictEqual((await wd({ amount: 5000, paymentMethod: 'wave', phone: '0701020304' }, 'u1|u@x|0')).statusCode, 400); // e-mail non vérifié
  assert.strictEqual((await wd({ amount: 5000, paymentMethod: 'wave', phone: 'abc' })).statusCode, 400);
  assert.strictEqual((await wd({ amount: 99999999, paymentMethod: 'wave', phone: '0701020304' })).statusCode, 400);
  assert.strictEqual((await wd({ amount: 500, paymentMethod: 'wave', phone: '0701020304' })).statusCode, 400);
  assert.strictEqual(bal('u1'), B);
  const w = await wd({ amount: 5000, paymentMethod: 'wave', phone: '07 01 02 03 04' });
  assert.strictEqual(w.statusCode, 200); assert.strictEqual(bal('u1'), B - 5000);
  const wid = JSON.parse(w.body).withdrawalId;
  assert.strictEqual((await wd({ amount: B * 2, paymentMethod: 'wave', phone: '0701020304' })).statusCode, 400);
  // admin
  const adm = (b, tok = 'adm|a@x|1') => call(F('admin-api'), tok, b);
  assert.strictEqual((await adm({ action: 'list' }, 'u1|u@x|1')).statusCode, 400);   // non-admin refusé
  assert.strictEqual(JSON.parse((await adm({ action: 'list' })).body).withdrawals.length, 1);
  assert.strictEqual((await adm({ action: 'withdrawal', id: wid, decision: 'reject' })).statusCode, 200);
  assert.strictEqual(bal('u1'), B);                                                    // remboursé
  assert.strictEqual((await adm({ action: 'withdrawal', id: wid, decision: 'reject' })).statusCode, 400);
  assert.strictEqual(bal('u1'), B, 'remboursement une seule fois');

  console.log('OK : tests serveur (webhook, paris, règlement, retraits, admin) tous passés');
})().catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
