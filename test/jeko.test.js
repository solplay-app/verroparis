const assert = require('assert');
const crypto = require('crypto');
const { toCents, validateAmount, verifySignature } = require('../netlify/functions/lib/jeko');

assert.strictEqual(toCents(500), 50000);
assert.strictEqual(toCents(5000), 500000);
assert.strictEqual(validateAmount('1000'), 1000);
assert.strictEqual(validateAmount(10.5), null);
assert.strictEqual(validateAmount(-5), null);
assert.strictEqual(validateAmount(2000001), null);
assert.strictEqual(validateAmount('abc'), null);

const secret = 's3cret', raw = '{"event":"payment_request.succeeded","data":{"reference":"dep_x"}}';
const good = crypto.createHmac('sha256', secret).update(raw).digest('hex');
assert.ok(verifySignature(raw, good, secret));
assert.ok(!verifySignature(raw + ' ', good, secret));      // corps modifié
assert.ok(!verifySignature(raw, good.replace(/.$/, '0'), secret));
assert.ok(!verifySignature(raw, '', secret));
assert.ok(!verifySignature(raw, good, ''));
console.log('OK : tous les tests passent');
