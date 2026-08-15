const express = require('express');
const redis = require('./redis/client');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Distributed Rate Limiter API',
    usage: 'POST /check with body { "client_id": "your_id" }',
    docs: 'https://github.com/ashwini-coder11/distributed-rate-limiter'
  });
});

const limitsConfig = require('./config/limits.json');

function getClientLimits(clientId) {
  return limitsConfig[clientId] || limitsConfig.default;
}

const { checkTokenBucket } = require('./redis/tokenBucketRedis');

app.post('/check', async (req, res) => {
  const { client_id, algorithm } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const { capacity, refillRatePerSecond } = getClientLimits(client_id);
  const result = await checkTokenBucket(client_id, capacity, refillRatePerSecond);

  if (result.allowed) {
    await redis.incr(`ratelimit:stats:${client_id}:allowed`);
    return res.json({ allowed: true, remaining: result.remaining });
  }

  await redis.incr(`ratelimit:stats:${client_id}:rejected`);
  res.set('Retry-After', String(result.retryAfterSeconds));
  return res.status(429).json({
    allowed: false,
    retry_after_seconds: result.retryAfterSeconds
  });
});

app.get('/stats/:client_id', async (req, res) => {
  const { client_id } = req.params;
  const allowed = await redis.get(`ratelimit:stats:${client_id}:allowed`) || '0';
  const rejected = await redis.get(`ratelimit:stats:${client_id}:rejected`) || '0';
  res.json({
    client_id,
    allowed: parseInt(allowed, 10),
    rejected: parseInt(rejected, 10)
  });
});


if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => {
    console.log(`Rate limiter server running on port ${process.env.PORT || 3000}`);
  });
}

module.exports = app;