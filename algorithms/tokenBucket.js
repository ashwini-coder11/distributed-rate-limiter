class TokenBucket {
     constructor() {
          this.buckets = new Map(); // client_id -> { tokens, lastRefill }
     }

     _refill(bucket, config) {
          const now = Date.now();
          const elapsedSeconds = (now - bucket.lastRefill) / 1000;
          const tokensToAdd = elapsedSeconds * config.refillRatePerSecond;
          bucket.tokens = Math.min(config.capacity, bucket.tokens + tokensToAdd);
          bucket.lastRefill = now;
     }

     allow(clientId, config) {
          if (!this.buckets.has(clientId)) {
               this.buckets.set(clientId, { tokens: config.capacity, lastRefill: Date.now() });
          }

          const bucket = this.buckets.get(clientId);
          this._refill(bucket, config);

          if (bucket.tokens >= 1) {
               bucket.tokens -= 1;
               return { allowed: true, remaining: Math.floor(bucket.tokens) };
          }

          const secondsToNextToken = (1 - bucket.tokens) / config.refillRatePerSecond;
          return { allowed: false, retryAfterSeconds: Math.ceil(secondsToNextToken) };
     }
}

module.exports = TokenBucket;