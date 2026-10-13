const { db } = require('./lib/admin');
const { toCents, verifySignature } = require('./lib/jeko');

const ok = (msg) => ({ statusCode: 200, body: msg });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };

  // Corps BRUT, indispensable pour la signature
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const sig = event.headers['jeko-signature'];
  if (!verifySignature(raw, sig, process.env.JEKO_WEBHOOK_SECRET)) {
    return { statusCode: 401, body: 'Signature invalide' };
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return { statusCode: 400, body: 'JSON invalide' }; }
  if (payload.event !== 'payment_request.succeeded') return ok('ignoré');

  const d = payload.data || {};
  if (!String(d.reference || '').startsWith('dep_')) return ok('référence inconnue');
  const depRef = db.ref(`deposits/${d.reference.slice(4)}`);
  const snap = await depRef.once('value');
  if (!snap.exists()) { console.error('dépôt introuvable', d.reference); return ok('introuvable'); }
  const dep = snap.val();

  // On ne fait confiance qu'au montant enregistré par NOTRE serveur, et on vérifie qu'il correspond
  const paid = ['succeeded', 'success'].includes(d.status);
  if (!paid || d.currency !== 'XOF' || d.amountCents !== toCents(dep.amount)) {
    console.error('incohérence', d.reference, d.status, d.amountCents, dep.amount);
    await depRef.update({ status: 'mismatch', webhookAmountCents: d.amountCents ?? null });
    return ok('incohérence, revue manuelle');
  }

  // Idempotence : un seul appel peut faire passer pending → processing
  const claim = await depRef.child('status').transaction((cur) => (cur === 'pending' ? 'processing' : undefined));
  if (!claim.committed) return ok('déjà traité');

  try {
    await db.ref(`users/${dep.userId}/balance`).transaction((b) => (b || 0) + dep.amount);
  } catch (e) {
    console.error('crédit échoué', d.reference, e.message);
    await depRef.child('status').set('pending'); // Jèko réessaiera
    return { statusCode: 500, body: 'erreur, réessayez' };
  }
  await depRef.update({ status: 'credited', creditedAt: new Date().toISOString(), jekoId: d.id || null });
  return ok('crédité');
};
