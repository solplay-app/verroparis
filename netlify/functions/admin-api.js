const { db } = require('./lib/admin');
const { endpoint, isAdmin, UserError } = require('./lib/http');

exports.handler = endpoint(async (user, body) => {
  if (!(await isAdmin(user.uid))) throw new UserError('Accès réservé aux administrateurs');

  if (body.action === 'list') {
    const [w, d, t, r] = await Promise.all(['withdrawals', 'deposits', 'trackedMatches', 'results'].map((k) => db.ref(k).once('value')));
    const withdrawals = Object.values(w.val() || {}).filter((x) => x.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const deposits = Object.values(d.val() || {}).filter((x) => ['mismatch', 'processing'].includes(x.status));
    const results = r.val() || {};
    const unresolved = Object.entries(t.val() || {})
      .filter(([id, m]) => !results[id] && Date.now() > Date.parse(m.commenceTime) + 3 * 3600e3)
      .map(([id, m]) => ({ id, ...m }));
    return { withdrawals, deposits, unresolved };
  }

  if (body.action === 'withdrawal') {
    const ref = db.ref(`withdrawals/${String(body.id)}`);
    const snap = await ref.once('value');
    if (!snap.exists()) throw new UserError('Retrait introuvable');
    const w = snap.val();
    const next = body.decision === 'paid' ? 'paid' : body.decision === 'reject' ? 'rejected' : null;
    if (!next) throw new UserError('Décision invalide');
    const claim = await ref.child('status').transaction((cur) => (cur === 'pending' ? 'processing' : undefined));
    if (!claim.committed) throw new UserError('Ce retrait a déjà été traité');
    if (next === 'rejected') await db.ref(`users/${w.userId}/balance`).transaction((b) => (b || 0) + w.amount); // remboursement
    await ref.update({ status: next, processedBy: user.uid, processedAt: new Date().toISOString(), note: String(body.note || '').slice(0, 200) });
    return { ok: true };
  }

  if (body.action === 'setResult') {
    const id = String(body.matchId);
    const t = (await db.ref(`trackedMatches/${id}`).once('value')).val();
    if (!t) throw new UserError('Match inconnu');
    if (body.void) { await db.ref(`results/${id}`).set({ void: true, manual: true }); return { ok: true }; }
    const h = Number(body.homeScore), a = Number(body.awayScore);
    if (![h, a].every((x) => Number.isInteger(x) && x >= 0 && x < 100)) throw new UserError('Score invalide');
    await db.ref(`results/${id}`).set({ homeTeam: t.homeTeam, awayTeam: t.awayTeam, homeScore: h, awayScore: a, manual: true, finishedAt: new Date().toISOString() });
    return { ok: true };
  }
  throw new UserError('Action inconnue');
});
