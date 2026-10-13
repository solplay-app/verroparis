const { endpoint } = require('./lib/http');
const { settleCoupons } = require('./lib/settle');
exports.handler = endpoint(async (user) => settleCoupons({ userId: user.uid }));
