const { db, auth } = require('./admin');

const json = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

class UserError extends Error {}

async function requireUser(event) {
  const t = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  try { return await auth.verifyIdToken(t); } catch { return null; }
}
async function isAdmin(uid) {
  return (await db.ref(`users/${uid}/isAdmin`).once('value')).val() === true;
}
function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return null; }
}
// enveloppe commune : méthode, auth, JSON, erreurs
const endpoint = (fn) => async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Méthode non autorisée' });
  const user = await requireUser(event);
  if (!user) return json(401, { error: 'Non connecté' });
  const body = parseBody(event);
  if (!body) return json(400, { error: 'JSON invalide' });
  try { return json(200, await fn(user, body)); }
  catch (e) {
    if (e instanceof UserError) return json(400, { error: e.message });
    console.error(e);
    return json(500, { error: 'Erreur serveur, réessayez' });
  }
};
module.exports = { json, UserError, requireUser, isAdmin, parseBody, endpoint };
