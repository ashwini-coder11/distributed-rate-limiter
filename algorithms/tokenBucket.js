class TokenBucket {
     constructor(capacity, refillRatePerSecond) {
          this.capacity = capacity;
          this.refillRatePerSecond = refillRatePerSecond;
          this.buckets = new Map(); // client_id -> { tokens, lastRefill }
     }

     _refill(bucket) {
          const now = Date.now();
          const elapsedSeconds = (now - bucket.lastRefill) / 1000;
          const tokensToAdd = elapsedSeconds * this.refillRatePerSecond;
          bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
          bucket.lastRefill = now;
     }

     allow(clientId) {
          if (!this.buckets.has(clientId)) {
               this.buckets.set(clientId, { tokens: this.capacity, lastRefill: Date.now() });
          }

          const bucket = this.buckets.get(clientId);
          this._refill(bucket);

          if (bucket.tokens >= 1) {
               bucket.tokens -= 1;
               return { allowed: true, remaining: Math.floor(bucket.tokens) };
          }

          const secondsToNextToken = (1 - bucket.tokens) / this.refillRatePerSecond;
          return { allowed: false, retryAfterSeconds: Math.ceil(secondsToNextToken) };
     }
}

module.exports = TokenBucket;