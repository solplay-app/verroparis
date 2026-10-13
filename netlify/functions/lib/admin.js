const admin = require('firebase-admin');

if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(json)),
    databaseURL: 'https://verroparis-default-rtdb.firebaseio.com',
  });
}
module.exports = { admin, db: admin.database(), auth: admin.auth() };
