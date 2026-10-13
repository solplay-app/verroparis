const admin = require('firebase-admin');

if (!admin.apps.length) {
  // FIREBASE_SERVICE_ACCOUNT = JSON du compte de service, encodé en base64
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: 'https://verroparis-default-rtdb.firebaseio.com',
  });
}
module.exports = { admin, db: admin.database(), auth: admin.auth() };
