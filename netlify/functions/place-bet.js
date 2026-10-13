const { db } = require('./lib/admin');
const { endpoint, UserError } = require('./lib/http');
const { buildCoupon } = require('./lib/bet');

exports.handler = endpoint(async (user, body) => {
  const uid = user.uid;
  const stake = Number(body.stake);

  const [mSnap, oSnap] = await Promise.all([db.ref('matchesCache').once('value'), db.ref('oddsCache').once('value')]);
  const mc = mSnap.val() || {};
  const cache = { matches: mc.matches || [], cachedAt: mc.cachedAt, oddsByMatch: oSnap.val() || {} };

  const id = `coupon_${db.ref('coupons').push().key}`;
  const coupon = buildCoupon({ reqPicks: body.picks, stake, cache, uid, id });
  const couponRef = db.ref(`coupons/${id}`);

  // Débit atomique : s'annule si le solde est insuffisant
  const debit = await db.ref(`users/${uid}/balance`).transaction((b) => ((b || 0) >= stake ? (b || 0) - stake : undefined));
  if (!debit.committed) {
    const bal = (await db.ref(`users/${uid}/balance`).once('value')).val() || 0;
    throw new UserError(`Solde insuffisant ! Votre solde est de ${bal.toLocaleString('fr-FR')} FCFA, mais la mise est de ${stake.toLocaleString('fr-FR')} FCFA.`);
  }
  try {
    const tracked = {};
    for (const p of coupon.picks) tracked[`trackedMatches/${p.match.id}`] = { homeTeam: p.match.homeTeam, awayTeam: p.match.awayTeam, commenceTime: p.match.commenceTime };
    await couponRef.set(coupon);
    await db.ref().update(tracked);
  } catch (e) {
    await db.ref(`users/${uid}/balance`).transaction((b) => (b || 0) + stake); // remboursement
    throw e;
  }
  return { coupon, balance: debit.snapshot.val() };
});
