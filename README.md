# Distributed Rate Limiter

A distributed backend rate-limiting service built with **Node.js, Express, and Redis**. The service controls how frequently individual clients can access an API using **Token Bucket** and **Sliding Window** algorithms. Redis acts as shared state, while Lua scripts ensure that critical rate-limiting operations execute atomically and remain correct under concurrent requests.

The project is containerized using Docker Compose, tested for correctness and concurrency, and benchmarked under increasing load using k6.

---

## Problem Statement

Without rate limiting, a single client can send an unlimited number of requests to a backend service. This can result in:

* Server overload
* Increased infrastructure costs
* Poor performance for other users
* API abuse
* Brute-force attempts
* Denial-of-service style traffic

A simple in-memory rate limiter works for a single server instance. However, when multiple API servers are running, each server may maintain its own rate-limit state.

For example:

```text
Client
   │
   ├── Request 1 ──► Server A → Request Count = 9
   │
   └── Request 2 ──► Server B → Request Count = 9
```

If the limit is `10`, both servers may independently allow another request.

The goal of this project is to build a rate limiter that maintains **consistent per-client limits even when requests are handled concurrently or across multiple server instances**.

---

## Architecture

```text
                         ┌───────────────────┐
                         │      Client       │
                         │ API Key / User ID │
                         └─────────┬─────────┘
                                   │
                                   │ HTTP Request
                                   ▼
                         ┌───────────────────┐
                         │   Express API     │
                         │                   │
                         │   POST /check     │
                         │   GET /stats/:id  │
                         └─────────┬─────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │    Rate Limiter Core      │
                    │                          │
                    │  ┌────────────────────┐  │
                    │  │   Token Bucket     │  │
                    │  └────────────────────┘  │
                    │                          │
                    │  ┌────────────────────┐  │
                    │  │  Sliding Window    │  │
                    │  └────────────────────┘  │
                    └────────────┬─────────────┘
                                 │
                                 │ Atomic Lua Script
                                 ▼
                    ┌──────────────────────────┐
                    │          Redis           │
                    │                          │
                    │ Shared per-client state  │
                    │ Tokens / request counts  │
                    │ Statistics               │
                    └──────────────────────────┘


        Multiple API server instances can share the same Redis state

             ┌─────────────┐
             │  Server A   │──────┐
             └─────────────┘      │
                                  ▼
                             ┌──────────┐
             ┌─────────────┐ │  Redis   │
             │  Server B   │──────┤          │
             └─────────────┘ └──────────┘
```

Redis acts as the shared source of truth, allowing multiple application instances to make consistent rate-limit decisions.

---

## Algorithms

### 1. Token Bucket

Each client has a bucket with a maximum number of tokens.

Each request consumes a token. Tokens are added back to the bucket at a configured refill rate.

```text
Capacity: 10 tokens
Refill:   1 token / second


     Request
        │
        ▼

   ┌──────────────┐
   │ TOKEN BUCKET │
   │              │
   │ ● ● ● ● ●    │
   └──────────────┘

        │
        ├── Token available → ALLOW
        │
        └── No token left   → REJECT
```

#### Advantages

* Allows short bursts of traffic
* Simple and efficient
* Useful when occasional bursts are acceptable

#### Trade-off

A client can temporarily send requests faster than the average configured rate while tokens are available.

---

### 2. Sliding Window

The Sliding Window algorithm tracks requests over a continuously moving time period.

For example:

```text
Limit: 10 requests per 60 seconds

<----------- Last 60 seconds ----------->

|  R1   R2   R3   R4   R5   R6   R7      |

------------------------------------------
                      ↑
                 Current time
```

Unlike a fixed window, the time window continuously moves with the current time.

This avoids the boundary problem where a client could send the maximum number of requests immediately before one fixed window ends and again immediately after the next window begins.

#### Advantages

* More accurate request limiting
* Fairer distribution of requests
* Avoids fixed-window boundary bursts

#### Trade-off

Sliding Window requires more state tracking and can have more overhead than Token Bucket.

---

## Token Bucket vs Sliding Window

| Feature        | Token Bucket              | Sliding Window                   |
| -------------- | ------------------------- | -------------------------------- |
| Allows bursts  | Yes                       | More controlled                  |
| Accuracy       | Moderate                  | Higher                           |
| Complexity     | Lower                     | Higher                           |
| State overhead | Lower                     | Higher                           |
| Best use case  | APIs that tolerate bursts | APIs requiring stricter fairness |

In this project, both algorithms are implemented to demonstrate different rate-limiting strategies and their trade-offs.

---

## Distributed Consistency and Race Conditions

A major challenge in a distributed rate limiter is handling concurrent requests correctly.

Suppose a client has a limit of `10` requests.

Two requests arrive almost simultaneously:

```text
Request A → Reads current count = 9
Request B → Reads current count = 9

Request A → Allows request
Request B → Allows request
```

Both requests could be allowed even though only one request should have been accepted.

This is a **race condition**.

### The Solution: Redis + Lua

The rate-limit logic requires multiple steps:

```text
1. Read the current state
2. Check whether the request can be allowed
3. Update the state
```

If these operations are performed separately, another request can modify the state between them.

This project uses **Redis Lua scripts** to execute the required logic atomically.

```text
              Concurrent Requests
                      │
              ┌───────┴───────┐
              ▼               ▼
         Request A         Request B
              │               │
              └───────┬───────┘
                      ▼
              ┌───────────────┐
              │     Redis     │
              │               │
              │ Lua Script    │
              │ Atomic Logic  │
              └───────┬───────┘
                      │
                      ▼
               Consistent Result
```

The Lua script performs the rate-limit calculation as one atomic operation, preventing concurrent requests from interfering with each other's updates.

This prevents the limiter from incorrectly allowing more requests than the configured capacity.

---

## Tech Stack

| Technology        | Purpose                                 |
| ----------------- | --------------------------------------- |
| Node.js           | Backend runtime                         |
| Express           | REST API                                |
| Redis             | Shared distributed state                |
| Redis Lua Scripts | Atomic rate-limit operations            |
| Docker            | Containerization                        |
| Docker Compose    | Runs the API service and Redis together |
| Jest              | Unit and concurrency testing            |
| k6                | Load testing and benchmarking           |

---

## Features

* Distributed rate limiting using Redis
* Token Bucket algorithm
* Sliding Window algorithm
* Atomic rate-limit operations using Lua
* Per-client rate-limit state
* HTTP `429 Too Many Requests` responses
* `Retry-After` header for rejected requests
* Per-client allowed and rejected request statistics
* Dockerized API and Redis setup
* Concurrency testing
* Load testing with k6

---

## Run Locally

### Prerequisites

Make sure the following are installed:

* Git
* Docker
* Docker Compose

### Clone the Repository

```bash
git clone <your-repository-url>
```

Move into the project directory:

```bash
cd distributed-rate-limiter
```

Start the application and Redis:

```bash
docker compose up --build
```

The API server will run at:

```text
http://localhost:3000
```

---

## API Documentation

### Check Rate Limit

#### Endpoint

```http
POST /check
```

#### Request

```json
{
  "client_id": "api_key_123",
  "action": "search_api"
}
```

Example:

```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "api_key_123",
    "action": "search_api"
  }'
```

### Allowed Response

When the client is within the configured rate limit:

```json
{
  "allowed": true,
  "remaining": 7,
  "reset_in_seconds": 12
}
```

HTTP status:

```text
200 OK
```

---

### Rejected Response

When the client exceeds the configured limit:

```json
{
  "allowed": false,
  "retry_after_seconds": 4
}
```

HTTP status:

```text
429 Too Many Requests
```

The response also includes a `Retry-After` header:

```http
Retry-After: 4
```

This tells the client how long it should wait before retrying the request.

---

## Client Statistics

The project also tracks allowed and rejected requests for each client using Redis atomic counters.

### Endpoint

```http
GET /stats/:client_id
```

Example:

```bash
curl http://localhost:3000/stats/api_key_123
```

The endpoint returns statistics for the specified client.

---

## Testing

The project includes tests for rate-limiter behavior and concurrent request handling.

Run the tests with:

```bash
npm test
```

A concurrency test verifies that simultaneous requests do not cause the rate limiter to exceed its configured capacity.

For example:

```text
Capacity = 10
Concurrent requests = 20
```

The expected result is that no more than the configured number of requests are allowed.

This validates the Redis-backed atomic implementation under concurrent access.

---

# Load Testing

The distributed rate limiter was benchmarked using **k6** under increasing concurrent load.

## Test Configuration

* **Endpoint:** `POST http://localhost:3000/check`
* **Load testing tool:** k6
* **Ramp-up:** 10 seconds
* **Target load duration:** 30 seconds
* **Ramp-down:** 10 seconds
* **Virtual users tested:** 50, 100, 200, and 400
* **Sleep between requests:** 100ms

Each virtual user used a unique client identifier:

```json
{
  "client_id": "load_test_client_<VU_ID>",
  "action": "search_api"
}
```

The following responses were considered valid:

* `200 OK` — Request allowed
* `429 Too Many Requests` — Rate limit exceeded

Each request was validated with:

```javascript
status is 200 or 429
```

---

## Benchmark Results

| Virtual Users | Total Requests | Requests/sec | Avg Latency | p95 Latency | p99 Latency | Checks Passed |
| ------------- | -------------: | -----------: | ----------: | ----------: | ----------: | ------------: |
| 50            |         18,564 |       370.96 |      7.73ms |     16.97ms | **20.41ms** |      **100%** |
| 100           |         37,505 |       749.07 |      6.54ms |     17.50ms | **23.08ms** |      **100%** |
| 200           |         74,481 |     1,487.98 |      7.11ms |     26.62ms | **60.48ms** |      **100%** |
| 400           |        134,424 |     2,685.95 |     19.03ms |     54.12ms | **89.89ms** |      **100%** |

---

## Performance Analysis

The rate limiter maintained **100% successful checks across all test levels**.

Every request received one of the expected responses:

* `200 OK`
* `429 Too Many Requests`

Throughput increased as the number of concurrent virtual users increased:

```text
50 VUs  →    371 requests/sec
100 VUs →    749 requests/sec
200 VUs →  1,488 requests/sec
400 VUs →  2,686 requests/sec
```

The highest throughput observed was:

> **2,685.95 requests per second at 400 concurrent virtual users.**

At lower concurrency levels, tail latency remained relatively low:

* **50 VUs:** p99 latency of **20.41ms**
* **100 VUs:** p99 latency of **23.08ms**

As concurrency increased, p99 latency also increased:

* **200 VUs:** p99 latency of **60.48ms**
* **400 VUs:** p99 latency of **89.89ms**

This demonstrates the expected trade-off under higher load: throughput increases while tail latency also grows as the system handles more concurrent requests.

### Best Throughput-Latency Balance

The **100 VU test** provided the strongest balance between throughput and tail latency:

* **749.07 requests/sec**
* **6.54ms average latency**
* **23.08ms p99 latency**
* **100% checks passed**

### Highest Tested Throughput

At the highest tested load of **400 virtual users**, the system achieved:

> **Approximately 2,686 requests per second with a p99 latency of 89.89ms and 100% successful checks.**

---

## Why Redis Instead of In-Memory State?

An in-memory rate limiter stores request counts inside a single application process.

This becomes a problem when multiple application instances are running.

```text
Server A → Client count = 8
Server B → Client count = 3
Server C → Client count = 6
```

Each server has different information.

Redis provides shared state:

```text
Server A ───┐
            │
Server B ───┼────► Redis ───► Shared client state
            │
Server C ───┘
```

All API server instances can read and update the same rate-limit state.

---

## Failure Considerations

Redis is a critical dependency in this architecture.

If Redis becomes unavailable, the rate limiter must decide how to behave.

### Fail Open

Allow requests when Redis cannot be reached.

**Advantage:** Higher application availability.

**Risk:** Rate limits may be bypassed.

### Fail Closed

Reject requests when Redis cannot verify the rate limit.

**Advantage:** Stronger protection against uncontrolled traffic.

**Risk:** Legitimate clients may be blocked when Redis is unavailable.

The current implementation focuses on distributed consistency and correctness. A production deployment would require additional high-availability mechanisms.

---

## Future Improvements

### Redis Sentinel or Redis Cluster

Add Redis Sentinel or Redis Cluster to improve availability and reduce the single point of failure created by a single Redis instance.

### Leaky Bucket Algorithm

Add a third rate-limiting algorithm that processes traffic at a more constant rate and smooths bursts.

### Authentication and API Keys

Add authentication so clients cannot arbitrarily use another client's identifier.

### Persistent Client Configuration

Store client plans and rate-limit configurations in a database or dedicated configuration service.

### Horizontal API Scaling

Run multiple API instances behind a load balancer while continuing to use Redis as the shared source of rate-limit state.

### Observability

Add monitoring and metrics for:

* Allowed requests
* Rejected requests
* API latency
* Redis latency
* Error rates
* Throughput

### Production Deployment

Deploy the service with:

* Health checks
* Secrets management
* Monitoring
* High-availability Redis
* Load balancing

---

## Key Learnings

This project explores several backend and distributed-systems concepts:

* Rate-limiting algorithms and trade-offs
* Distributed shared state
* Race conditions
* Atomic operations
* Redis Lua scripting
* HTTP `429 Too Many Requests`
* `Retry-After` headers
* Docker and Docker Compose
* Concurrent testing
* Load testing and performance benchmarking


---

##  Questions

### Why not store the rate limit in application memory?

Multiple application instances would maintain separate state. Redis provides shared state that all instances can access.

### Why use Lua scripts?

Rate-limit decisions often involve multiple steps that must execute atomically. Lua allows the complete operation to execute inside Redis without another request modifying the relevant state in the middle of the calculation.

### Token Bucket vs Sliding Window?

Token Bucket is simpler and allows controlled bursts. Sliding Window provides stricter and more accurate request limiting but requires additional state and processing.

### What happens if Redis goes down?

The system must choose between failing open or failing closed. A production system could use Redis Sentinel or Redis Cluster to improve availability.

### Why is this a distributed systems problem?

Multiple API server instances must make consistent rate-limit decisions while handling concurrent requests. Redis acts as the shared source of truth.

---


 