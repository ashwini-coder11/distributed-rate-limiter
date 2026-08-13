const SlidingWindowLog = require('./slidingWindow');

test('rejects after limit reached within window', () => {
     const sw = new SlidingWindowLog(3, 1000); // 3 requests per 1000ms
     expect(sw.allow('c1').allowed).toBe(true);
     expect(sw.allow('c1').allowed).toBe(true);
     expect(sw.allow('c1').allowed).toBe(true);
     expect(sw.allow('c1').allowed).toBe(false);
});

test('allows again after window passes', (done) => {
     const sw = new SlidingWindowLog(1, 200); // 1 request per 200ms
     expect(sw.allow('c2').allowed).toBe(true);
     expect(sw.allow('c2').allowed).toBe(false);
     setTimeout(() => {
          expect(sw.allow('c2').allowed).toBe(true);
          done();
     }, 250);
});
