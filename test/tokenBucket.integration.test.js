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
});