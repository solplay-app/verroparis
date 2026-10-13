const { db } = require('./admin');
const C = require('./config');
const { computeSettlement } = require('./markets');

// Règle les coupons en attente. userId = seulement ceux d'un joueur ; sinon tous.
async function settleCoupons({ userId = null, now = Date.now() } = {}) {
  const q = userId
    ? db.ref('coupons').orderByChild('userId').equalTo(userId)
    : db.ref('coupons').orderByChild('status').equalTo('pending');
  const snap = await q.once('value');
  const coupons = Object.values(snap.val() || {}).filter((c) => c.status === 'pending');
  const results = (await db.ref('results').once('value')).val() || {};
  let settled = 0, voided = 0;

  for (const c of coupons) {
    let s = computeSettlement(c, results);
    if (!s) {
      // Pas de résultat : si trop ancien, on rembourse plutôt que de bloquer la mise
      const last = Math.max(...c.picks.map((p) => Date.parse(p.match.commenceTime)));
      if (now - last < C.VOID_AFTER_HOURS * 3600e3) continue;
      s = { status: 'void', credit: c.stake, fields: { status: 'void', refund: c.stake, voidReason: 'résultat indisponible' } };
    }
    const ref = db.ref(`coupons/${c.id}`);
    const claim = await ref.child('status').transaction((cur) => (cur === 'pending' ? 'settling' : undefined));
    if (!claim.committed) continue;                         // déjà pris par un autre appel
    try {
      if (s.credit > 0) await db.ref(`users/${c.userId}/balance`).transaction((b) => (b || 0) + s.credit);
    } catch (e) {
      console.error('règlement échoué', c.id, e.message);
      await ref.child('status').set('pending');
      continue;
    }
    await ref.update({ ...s.fields, settledAt: new Date(now).toISOString() });
    s.status === 'void' ? voided++ : settled++;
  }
  return { settled, voided };
}
module.exports = { settleCoupons };
