const fs = require('fs');
const path = require('path');
const redis = require('./client');

const script = fs.readFileSync(path.join(__dirname, 'tokenBucket.lua'), 'utf8');

async function checkTokenBucket(clientId, capacity, refillRate) {
     const key = `ratelimit:token_bucket:${clientId}`;
     const now = Date.now();
     const result = await redis.eval(script, 1, key, capacity, refillRate, now);
     const [allowed, remainingTokens] = result;
     return {
          allowed: allowed === 1,
          remaining: Math.floor(parseFloat(remainingTokens)),
     };
}

module.exports = { checkTokenBucket };
