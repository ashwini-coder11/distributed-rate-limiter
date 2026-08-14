// const redis = require('./redis/client');
// redis.set('test_key', 'hello')
//   .then(() => redis.get('test_key'))
//   .then((val) => console.log('Redis round-trip:', val));

const express = require('express');
const app = express();
app.use(express.json());

const TokenBucket = require('./algorithms/tokenBucket');
const limiter = new TokenBucket();

const limitsConfig = require('./config/limits.json');

function getClientLimits(clientId) {
  return limitsConfig[clientId] || limitsConfig.default;
}


app.post('/check', (req, res) => {
  const { client_id } = req.body;

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
  }

  const config = getClientLimits(client_id);

  const result = limiter.allow(client_id, config);

  if (result.allowed) {
    return res.json({
      allowed: true,
      remaining: result.remaining
    });
  }

  res.set('Retry-After', String(result.retryAfterSeconds));

  return res.status(429).json({
    allowed: false,
    retry_after_seconds: result.retryAfterSeconds
  });
});


app.listen(3000, () => {
  console.log('Rate limiter server running on http://localhost:3000');
});