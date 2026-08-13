const express = require('express');
const app = express();
app.use(express.json());

const TokenBucket = require('./algorithms/tokenBucket');
const limiter = new TokenBucket(10, 1); // capacity 10, refill 1 token/sec


app.post('/check', (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const chosen = algorithm === 'sliding_window' ? slidingLimiter : limiter;

  const result = chosen.allow(client_id);
  if (result.allowed) {
    return res.json({ allowed: true, remaining: result.remaining });
  }
  res.set('Retry-After', String(result.retryAfterSeconds));
  return res.status(429).json({ allowed: false, retry_after_seconds: result.retryAfterSeconds });
});


app.listen(3000, () => {
  console.log('Rate limiter server running on http://localhost:3000');
});