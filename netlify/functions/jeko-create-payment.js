const { db } = require('./lib/admin');
const { endpoint, UserError } = require('./lib/http');
const { METHODS, MIN_FCFA, MAX_FCFA, validateAmount, createPaymentRequest } = require('./lib/jeko');

exports.handler = endpoint(async (user, body) => {
  const amount = validateAmount(body.amount);
  if (!amount) throw new UserError(`Montant invalide (${MIN_FCFA} à ${MAX_FCFA} FCFA, entier)`);
  if (!METHODS.includes(body.paymentMethod)) throw new UserError('Moyen de paiement invalide');

  const ref = db.ref('deposits').push();
  const reference = `dep_${ref.key}`;
  await ref.set({ id: ref.key, reference, userId: user.uid, amount, paymentMethod: body.paymentMethod, status: 'pending', createdAt: new Date().toISOString() });
  const site = process.env.SITE_URL;
  try {
    const pr = await createPaymentRequest({ amountFcfa: amount, reference, method: body.paymentMethod,
      successUrl: `${site}/?deposit=success`, errorUrl: `${site}/?deposit=cancel` });
    await ref.update({ jekoId: pr.id });
    return { redirectUrl: pr.redirectUrl };
  } catch (e) {
    console.error('create-payment', e.message);
    await ref.update({ status: 'failed' });
    throw new UserError('Paiement indisponible, réessayez dans un instant');
  }
});
