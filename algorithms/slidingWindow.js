class SlidingWindowLog {
     constructor(limit, windowSizeMs) {
          this.limit = limit;
          this.windowSizeMs = windowSizeMs;
          this.logs = new Map(); // client_id -> array of timestamps
     }

     allow(clientId) {
          const now = Date.now();
          const windowStart = now - this.windowSizeMs;

          if (!this.logs.has(clientId)) this.logs.set(clientId, []);
          let timestamps = this.logs.get(clientId);

          // drop timestamps outside the current window
          timestamps = timestamps.filter((t) => t > windowStart);

          if (timestamps.length < this.limit) {
               timestamps.push(now);
               this.logs.set(clientId, timestamps);
               return { allowed: true, remaining: this.limit - timestamps.length };
          }

          this.logs.set(clientId, timestamps);
          const oldestTimestamp = timestamps[0];
          const retryAfterMs = oldestTimestamp + this.windowSizeMs - now;
          return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
     }
}

module.exports = SlidingWindowLog;