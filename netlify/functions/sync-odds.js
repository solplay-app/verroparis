// Tâche planifiée (netlify.toml) : cotes + résultats + règlement. Les clés API restent côté serveur.
const { db } = require('./lib/admin');
const { settleCoupons } = require('./lib/settle');

const ODDS_API = 'https://api.the-odds-api.com/v4';
const FOOT_API = 'https://v3.football.api-sports.io';
const SPORTS = (process.env.ODDS_SPORTS || 'soccer_epl,soccer_italy_serie_a').split(',').map((s) => s.trim()).filter(Boolean);
const LABELS = { h2h: 'Résultat du Match', totals: 'Total de buts/points', btts: 'Les deux équipes marquent' };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|cf|afc|sc|ac)\b/g, '').replace(/[^a-z0-9]/g, '');

const mapMatch = (ev) => ({ id: ev.id, sport: 'football', league: ev.sport_title, homeTeam: ev.home_team, awayTeam: ev.away_team,
  status: new Date(ev.commence_time) <= new Date() ? 'live' : 'upcoming', commenceTime: ev.commence_time });

function mapOdds(ev) {
  const bk = ev.bookmakers?.[0]; if (!bk) return [];
  const out = [];
  for (const mk of bk.markets) {
    if (!LABELS[mk.key]) continue;
    for (const o of mk.outcomes) {
      const x = { oddsId: `${ev.id}_${mk.key}_${o.name}`.replace(/\s+/g, '-'), marketKey: mk.key, marketLabel: LABELS[mk.key],
        outcomeLabel: o.name === 'Draw' ? 'Match Nul' : o.name, price: o.price };
      if (o.point !== undefined) x.outcomePoint = String(o.point);
      out.push(x);
    }
  }
  return out;
}

async function syncOdds() {
  const matches = [], oddsByMatch = {}; let ok = 0;
  for (const sport of SPORTS) {
    try {
      const r = await fetch(`${ODDS_API}/sports/${sport}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal`);
      if (!r.ok) throw new Error(`${r.status}`);
      const evs = await r.json();
      for (const ev of evs) { matches.push(mapMatch(ev)); oddsByMatch[ev.id] = mapOdds(ev); }
      ok++;
    } catch (e) { console.error('odds', sport, e.message); }
  }
  if (!ok) return 0; // ne jamais écraser le cache avec du vide
  await db.ref('matchesCache').set({ matches, cachedAt: new Date().toISOString() });
  await db.ref('oddsCache').set(oddsByMatch);
  return matches.length;
}

async function syncResults() {
  const tracked = (await db.ref('trackedMatches').once('value')).val() || {};
  const results = (await db.ref('results').once('value')).val() || {};
  const byDate = new Map(); let written = 0;
  for (const [id, m] of Object.entries(tracked)) {
    if (results[id] || Date.now() < Date.parse(m.commenceTime) + 2.5 * 3600e3) continue;
    const date = m.commenceTime.slice(0, 10);
    if (!byDate.has(date)) {
      try {
        const r = await fetch(`${FOOT_API}/fixtures?date=${date}`, { headers: { 'x-apisports-key': process.env.FOOTBALL_API_KEY } });
        byDate.set(date, r.ok ? (await r.json()).response || [] : []);
      } catch { byDate.set(date, []); }
    }
    const f = byDate.get(date).find((x) => norm(x.teams.home.name) === norm(m.homeTeam) && norm(x.teams.away.name) === norm(m.awayTeam));
    if (!f) continue;
    const st = f.fixture.status.short, ft = f.score?.fulltime;
    if (['FT', 'AET', 'PEN'].includes(st) && ft && ft.home !== null && ft.away !== null) {
      await db.ref(`results/${id}`).set({ homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: ft.home, awayScore: ft.away, finishedAt: new Date().toISOString() });
      written++;
    } else if (['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(st)) {
      await db.ref(`results/${id}`).set({ void: true }); written++;
    }
  }
  return written;
}

exports.handler = async () => {
  const out = {};
  try { out.matches = await syncOdds(); } catch (e) { console.error(e); }
  try { out.results = await syncResults(); } catch (e) { console.error(e); }
  try { out.settle = await settleCoupons(); } catch (e) { console.error(e); }
  console.log('sync', JSON.stringify(out));
  return { statusCode: 200, body: JSON.stringify(out) };
};
