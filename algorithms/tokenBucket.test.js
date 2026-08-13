const TokenBucket = require('./tokenBucket');

test('allows requests up to capacity, then rejects', () => {
  const bucket = new TokenBucket(3, 1);
  expect(bucket.allow('client1').allowed).toBe(true);
  expect(bucket.allow('client1').allowed).toBe(true);
  expect(bucket.allow('client1').allowed).toBe(true);
  const fourth = bucket.allow('client1');
  expect(fourth.allowed).toBe(false);
  expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
});

test('different clients have inadependent buckets', () => {
  const bucket = new TokenBucket(1, 1);
  expect(bucket.allow('clientA').allowed).toBe(true);
  expect(bucket.allow('clientB').allowed).toBe(true); // separate bucket
});