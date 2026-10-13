const { db } = require('./lib/admin');
const C = require('./lib/config');
const { METHODS } = require('./lib/jeko');
const { endpoint, UserError } = require('./lib/http');

exports.handler = endpoint(async (user, body) => {
  if (!user.email_verified) throw new UserError('Veuillez vérifier votre adresse e-mail avant de faire une demande de retrait.');
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < C.MIN_WITHDRAW || amount > C.MAX_WITHDRAW)
    throw new UserError(`Montant de retrait invalide (${C.MIN_WITHDRAW} à ${C.MAX_WITHDRAW} FCFA)`);
  if (!METHODS.includes(body.paymentMethod)) throw new UserError('Moyen de paiement invalide');
  const phone = String(body.phone || '').replace(/[\s.-]/g, '');
  if (!/^\+?\d{8,15}$/.test(phone)) throw new UserError('Numéro de téléphone invalide');

  const debit = await db.ref(`users/${user.uid}/balance`).transaction((b) => ((b || 0) >= amount ? (b || 0) - amount : undefined));
  if (!debit.committed) throw new UserError('Montant de retrait supérieur à votre solde disponible !');

  const ref = db.ref('withdrawals').push();
  try {
    await ref.set({
      id: ref.key, userId: user.uid, userEmail: user.email || null, amount, phone,
      paymentMethod: body.paymentMethod, status: 'pending', createdAt: new Date().toISOString(),
    });
  } catch (e) {
    await db.ref(`users/${user.uid}/balance`).transaction((b) => (b || 0) + amount);
    throw e;
  }
  return { balance: debit.snapshot.val(), withdrawalId: ref.key };
});
