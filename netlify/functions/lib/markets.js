const C = require('./config');

const adjustPrice = (raw) => Math.max(1.01, Math.round(raw / C.MARGIN * 100) / 100);

// true si le pronostic est gagné, d'après le score du match (90 minutes)
function evaluatePick(odds, r) {
  const label = String(odds.outcomeLabel || '');
  const l = label.toLowerCase();
  const A = r.homeScore, V = r.awayScore;
  switch (odds.marketKey) {
    case 'h2h':
      return (label === r.homeTeam && A > V) || (label === r.awayTeam && V > A) ||
             ((label === 'Match Nul' || label === 'Nul' || label === 'Draw') && A === V);
    case 'totals': {
      const point = Number(odds.outcomePoint ?? 2.5), total = A + V;
      const over = l.includes('plus') || l.includes('over');
      return over ? total > point : total < point;
    }
    case 'btts': {
      const both = A > 0 && V > 0;
      return ((label === 'Oui' || l === 'yes') && both) || ((label === 'Non' || l === 'no') && !both);
    }
    default: return false;
  }
}

// results : { [matchId]: {homeTeam, awayTeam, homeScore, awayScore} | {void:true} }
// Renvoie null si le coupon n'est pas encore réglable.
function computeSettlement(coupon, results) {
  const stake = coupon.stake;
  let lost = false, activeOdds = 1, active = 0;
  for (const p of coupon.picks) {
    const r = results[p.match.id];
    if (!r) return null;
    if (r.void) continue;
    if (!evaluatePick(p.odds, r)) lost = true;
    activeOdds *= Number(p.odds.price); active++;
  }
  if (lost) {
    const cashback = Math.round(stake * C.CASHBACK);
    return { status: 'lost', credit: cashback, fields: { status: 'lost', cashback } };
  }
  if (active === 0) return { status: 'void', credit: stake, fields: { status: 'void', refund: stake } };
  const allActive = active === coupon.picks.length;
  const payout = allActive ? coupon.potentialPayout : Math.round(stake * activeOdds);
  const commission = Math.round(Math.max(0, payout - stake) * C.COMMISSION);
  const net = payout - commission;
  const fields = { status: 'won', houseCommission: commission, netPayout: net };
  if (!allActive) { fields.potentialPayout = payout; fields.totalOdds = Number(activeOdds.toFixed(2)); }
  return { status: 'won', credit: net, fields };
}

module.exports = { adjustPrice, evaluatePick, computeSettlement };
