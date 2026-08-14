const { checkTokenBucket } = require('../redis/tokenBucketRedis');
const redis = require('../redis/client');

describe('Token Bucket Redis Integration Test', () => {
     const clientId = 'concurrent_test_client';
     const capacity = 10;
     const refillRate = 1;

     beforeEach(async () => {
          await redis.del(`ratelimit:token_bucket:${clientId}`);
     });

     afterAll(async () => {
          await redis.del(`ratelimit:token_bucket:${clientId}`);
          await redis.quit();
     });

     test('should allow exactly capacity requests under concurrency', async () => {
          const requests = Array.from(
               { length: 20 },
               () => checkTokenBucket(clientId, capacity, refillRate)
          );

          const results = await Promise.all(requests);

          const allowedRequests = results.filter(
               (result) => result.allowed
          );

          expect(allowedRequests).toHaveLength(capacity);
     });

     test('should return accurate retryAfterSeconds when rate limit is exceeded', async () => {
          const testClientId = 'retry_after_test_client';
          await redis.del(`ratelimit:token_bucket:${testClientId}`);

          const cap = 1;
          const rate = 0.5;

          // First request: should be allowed
          const res1 = await checkTokenBucket(testClientId, cap, rate);
          expect(res1.allowed).toBe(true);
          expect(res1.remaining).toBe(0);
          expect(res1.retryAfterSeconds).toBe(0);

          // Second request: should be blocked, retry after = ceil((1 - 0) / 0.5) = 2s
          const res2 = await checkTokenBucket(testClientId, cap, rate);
          expect(res2.allowed).toBe(false);
          expect(res2.retryAfterSeconds).toBe(2);

          await redis.del(`ratelimit:token_bucket:${testClientId}`);
     });
});