const C = require('./config');
const { UserError } = require('./http');
const { adjustPrice } = require('./markets');

// Construit un coupon UNIQUEMENT à partir des données serveur (cotes et matchs du cache écrit par le serveur).
function buildCoupon({ reqPicks, stake, cache, now = Date.now(), uid, id }) {
  if (!Number.isInteger(stake) || stake < C.MIN_STAKE || stake > C.MAX_STAKE)
    throw new UserError(`Mise invalide (${C.MIN_STAKE} à ${C.MAX_STAKE} FCFA, montant entier)`);
  if (!Array.isArray(reqPicks) || reqPicks.length < 1 || reqPicks.length > C.MAX_PICKS)
    throw new UserError('Sélection invalide');
  if (!cache.matches.length || now - Date.parse(cache.cachedAt || 0) > 3 * 3600e3)
    throw new UserError('Les cotes sont temporairement indisponibles, réessayez dans quelques minutes.');

  const seen = new Set(), picks = [];
  for (const r of reqPicks) {
    const matchId = String(r?.matchId), oddsId = String(r?.oddsId);
    if (seen.has(matchId)) throw new UserError('Un seul pari par match dans un coupon');
    seen.add(matchId);
    const match = cache.matches.find((m) => m.id === matchId);
    if (!match) throw new UserError('Un match de votre coupon n\'est plus disponible. Retirez-le et réessayez.');
    if (match.sport !== 'football') throw new UserError('Pour le moment, seuls les paris football sont disponibles.');
    if (!(Date.parse(match.commenceTime) > now + 60e3)) throw new UserError(`${match.homeTeam} – ${match.awayTeam} a déjà commencé.`);
    const odds = (cache.oddsByMatch[matchId] || []).find((o) => o.oddsId === oddsId);
    if (!odds) throw new UserError('Une cote de votre coupon n\'est plus disponible. Retirez-la et réessayez.');
    picks.push({ match, odds: { ...odds, price: adjustPrice(Number(odds.price)) } });
  }
  const total = picks.reduce((a, p) => a * p.odds.price, 1);
  const potentialPayout = Number((stake * total).toFixed(0));
  if (potentialPayout > C.MAX_PAYOUT) throw new UserError(`Gain maximum par coupon : ${C.MAX_PAYOUT.toLocaleString('fr-FR')} FCFA`);
  return {
    id, couponNumber: 1e7 + Math.floor(Math.random() * 89999999 + 1), userId: uid,
    type: picks.length > 1 ? 'combine' : 'simple', picks,
    totalOdds: Number(total.toFixed(2)), stake, potentialPayout,
    status: 'pending', createdAt: new Date(now).toISOString(),
  };
}
module.exports = { buildCoupon };
