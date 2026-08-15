# Distributed Rate Limiter

A backend rate-limiting service built with **Node.js, Express, and Redis**, supporting both **Token Bucket** and **Sliding Window** algorithms. Redis holds shared state across instances, and Lua scripts keep the check-and-increment logic atomic so concurrent requests can't slip past the limit.

The whole thing is Dockerized, has concurrency tests to prove correctness under load, and is benchmarked with k6.

## Live demo

**Base URL:** https://distributed-rate-limiter-e304.onrender.com

This runs on Render's free tier, so it spins down when idle — the first request can take 30–50 seconds to wake up, after that it's fast.

```bash
curl https://distributed-rate-limiter-e304.onrender.com/
```

### Try it

```bash
curl -X POST https://distributed-rate-limiter-e304.onrender.com/check \
  -H "Content-Type: application/json" \
  -d '{"client_id":"demo_client"}'
```
```json
{"allowed":true,"remaining":9}
```

Sequential curls won't reliably show a 429 — there's enough time between requests for the bucket to partially refill. To actually see the limit kick in, fire a burst in parallel:

```bash
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://distributed-rate-limiter-e304.onrender.com/check \
    -H "Content-Type: application/json" \
    -d '{"client_id":"burst_test_1"}' &
done
wait
```

With a bucket capacity of 10, 15 simultaneous requests produced exactly 10 `200`s and 5 `429`s — even though they all hit the server at essentially the same instant. Full output: [`loadtest/result.txt`](./loadtest/result.txt).

Rejected requests look like this:
```json
{"allowed":false,"retry_after_seconds":4}
```

## The problem

A single client without limits can overload a backend — driving up infra cost, degrading service for everyone else, and opening the door to brute-force or DoS-style abuse. An in-memory counter solves this for one server, but breaks the moment you run more than one instance, because each server only knows about its own traffic:

```
Client
  ├── Request 1 → Server A → count = 9
  └── Request 2 → Server B → count = 9
```

If the limit is 10, both servers independently think they have room to allow another request. The goal here was a limiter that stays correct and consistent no matter how many instances are running or how requests are interleaved.

## Architecture

```
                 ┌────────────────────┐
                 │       Client        │
                 └─────────┬──────────┘
                            │ HTTP
                            ▼
                 ┌────────────────────┐
                 │   Express API       │
                 │  POST /check        │
                 │  GET  /stats/:id    │
                 └─────────┬──────────┘
                            ▼
                 ┌────────────────────┐
                 │  Rate Limiter Core  │
                 │  - Token Bucket     │
                 │  - Sliding Window   │
                 └─────────┬──────────┘
                            │ atomic Lua script
                            ▼
                 ┌────────────────────┐
                 │        Redis        │
                 │  per-client state,   │
                 │  tokens / counts,     │
                 │  stats                │
                 └────────────────────┘

     Server A ──┐
     Server B ──┼──► same Redis instance ──► one shared, consistent state
     Server C ──┘
```

Redis is the single source of truth, so any number of API instances can share it and agree on the same answer.

## Algorithms

**Token Bucket** — each client gets a bucket (say, 10 tokens) that refills at a fixed rate (say, 1/sec). Every request costs a token; an empty bucket means a reject. It's cheap and naturally tolerates short bursts, at the cost of letting a client briefly exceed the "average" rate while tokens are banked up.

**Sliding Window** — instead of a fixed, clock-aligned window (which lets a client double up right at the boundary — max requests at 11:59:59, then max again at 12:00:01), this tracks a rolling window that moves with the current time. More accurate and fairer, but it costs more state and computation to track.

| | Token Bucket | Sliding Window |
|---|---|---|
| Bursts | Allowed, up to bucket size | Tightly controlled |
| Accuracy | Moderate | Higher |
| Overhead | Low | Higher |
| Best for | APIs that tolerate occasional bursts | APIs needing strict fairness |

Both are implemented here so the trade-offs are visible side by side rather than just described.

## The concurrency problem, and how Redis + Lua fix it

The dangerous case: two requests from the same client land within microseconds of each other.

```
Request A → reads count = 9 → allows
Request B → reads count = 9 → allows
```

Both get through even though the limit was 10 and this should have pushed it to 11 — because "read, check, increment" happened as three separate steps instead of one atomic one.

The fix is a Redis Lua script executed via `EVAL`. Redis guarantees the whole script runs as a single atomic unit, so the read-check-increment sequence can't be interleaved with another request's — no partial state is ever visible in between. This is what makes the limiter correct under concurrency, not just under sequential testing.

A Jest concurrency test fires 20 simultaneous requests against a limit of 10 and asserts that no more than 10 are ever allowed — the same property demonstrated live in the burst-test curl above.

## Tech stack

| | |
|---|---|
| Node.js + Express | API server |
| Redis | Shared, cross-instance state |
| Redis Lua (`EVAL`) | Atomic rate-limit operations |
| Docker + Docker Compose | Local, reproducible environment |
| Jest | Unit + concurrency tests |
| k6 | Load testing / benchmarking |

## Running it locally

```bash
git clone <your-repository-url>
cd distributed-rate-limiter
docker compose up --build
```

The API comes up at `http://localhost:3000`.

## API

**`POST /check`**
```json
{ "client_id": "api_key_123", "action": "search_api" }
```

Allowed → `200 OK`
```json
{ "allowed": true, "remaining": 7, "reset_in_seconds": 12 }
```

Rejected → `429 Too Many Requests` (with a `Retry-After` header)
```json
{ "allowed": false, "retry_after_seconds": 4 }
```

**`GET /stats/:client_id`** — allowed/rejected counts for that client, tracked via Redis atomic counters.

## Testing

```bash
npm test
```

Covers algorithm correctness plus the concurrency case above (20 parallel requests against a limit of 10, expecting the Redis-backed logic to cap it correctly).

## Load testing

Benchmarked with k6 against `POST /check`, ramping 10s up → 30s sustained → 10s down, at 50 / 100 / 200 / 400 virtual users, each with a unique `client_id` and a 100ms sleep between requests. Both `200` and `429` counted as valid (rejecting correctly is a pass, not a failure).

| VUs | Total Requests | Req/sec | Avg Latency | p95 | p99 | Checks Passed |
|---|---:|---:|---:|---:|---:|---:|
| 50 | 18,564 | 370.96 | 7.73ms | 16.97ms | 20.41ms | 100% |
| 100 | 37,505 | 749.07 | 6.54ms | 17.50ms | 23.08ms | 100% |
| 200 | 74,481 | 1,487.98 | 7.11ms | 26.62ms | 60.48ms | 100% |
| 400 | 134,424 | 2,685.95 | 19.03ms | 54.12ms | 89.89ms | 100% |

Every check passed at every level — throughput scaled roughly linearly with concurrency, topping out around **2,686 req/sec at 400 VUs**, while p99 latency grew from ~20ms to ~90ms as contention increased. The **100 VU** run was the sweet spot: strong throughput (749 req/sec) with tail latency still under 25ms.

## Why Redis instead of an in-memory counter?

Because "in-memory" only means something to one process. With three servers each holding their own count, you get exactly the divergence shown in the problem statement above — Server A thinks 8, Server B thinks 3, Server C thinks 6, and none of them are right. Pointing every instance at the same Redis store turns three separate opinions into one shared fact.

## What happens if Redis goes down?

This is the honest weak point of the design — Redis is a single point of failure here. Two options, both with trade-offs:

- **Fail open** (allow requests when Redis is unreachable) — keeps the API available, but the rate limit is effectively off until Redis comes back.
- **Fail closed** (reject requests) — protects against a traffic spike hitting an unprotected backend, but a Redis blip now takes down legitimate traffic too.

This project doesn't implement either as a hard default — it's flagged here as the natural next problem to solve, most likely with Redis Sentinel/Cluster for HA rather than picking one failure mode and living with it.

## Possible next steps

- Redis Sentinel or Cluster, to remove the single point of failure above
- Leaky Bucket as a third algorithm, for comparison
- Real auth, so clients can't impersonate each other's `client_id`
- Persistent, DB-backed per-client plan config instead of a static file
- Metrics/observability on allow vs. reject rates, latency, and Redis health
- A load balancer in front of multiple API instances, still backed by one Redis

## What this project touches on

Rate-limiting algorithm design and trade-offs, distributed shared state, race conditions and atomic operations, Redis Lua scripting, HTTP 429 / `Retry-After` semantics, Docker Compose, concurrency testing, and load-test benchmarking.