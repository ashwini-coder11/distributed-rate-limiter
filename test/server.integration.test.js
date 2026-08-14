const request = require('supertest');
const app = require('../server');
const redis = require('../redis/client');

describe('Server API Integration Tests', () => {
  const testClientId = 'http_test_client';

  beforeAll(async () => {
    // Clean up Redis before tests
    await redis.del(`ratelimit:token_bucket:${testClientId}`);
    await redis.del(`ratelimit:stats:${testClientId}:allowed`);
    await redis.del(`ratelimit:stats:${testClientId}:rejected`);
  });

  afterAll(async () => {
    // Clean up Redis after tests and close connection
    await redis.del(`ratelimit:token_bucket:${testClientId}`);
    await redis.del(`ratelimit:stats:${testClientId}:allowed`);
    await redis.del(`ratelimit:stats:${testClientId}:rejected`);
    await redis.quit();
  });

  test('should track allowed vs rejected and return accurate retry_after', async () => {
    // Capacity for default is 10, refill rate is 1.
    // 1. Send 10 requests that should all be allowed.
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/check')
        .send({ client_id: testClientId })
        .expect(200);

      expect(res.body.allowed).toBe(true);
      expect(res.body.remaining).toBe(9 - i);
    }

    // 2. Verify stats show 10 allowed and 0 rejected
    let statsRes = await request(app)
      .get(`/stats/${testClientId}`)
      .expect(200);
    
    expect(statsRes.body.client_id).toBe(testClientId);
    expect(statsRes.body.allowed).toBe(10);
    expect(statsRes.body.rejected).toBe(0);

    // 3. Send 11th request, which should be rejected with 429
    const rejectedRes = await request(app)
      .post('/check')
      .send({ client_id: testClientId })
      .expect(429);

    expect(rejectedRes.body.allowed).toBe(false);
    // Since capacity is 10 and we used them all instantly, remaining is 0. 
    // retry_after_seconds = ceil((1 - 0) / 1) = 1
    expect(rejectedRes.body.retry_after_seconds).toBe(1);
    expect(rejectedRes.headers['retry-after']).toBe('1');

    // 4. Verify stats now show 10 allowed and 1 rejected
    statsRes = await request(app)
      .get(`/stats/${testClientId}`)
      .expect(200);

    expect(statsRes.body.allowed).toBe(10);
    expect(statsRes.body.rejected).toBe(1);
  });
});
