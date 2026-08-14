-- KEYS[1] = the Redis key for this client's bucket (a HASH)
-- ARGV[1] = capacity
-- ARGV[2] = refill rate (tokens per second)
-- ARGV[3] = current timestamp in ms
 
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
 
local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])
 
if tokens == nil then
  tokens = capacity
  last_refill = now
end
 
local elapsed_seconds = (now - last_refill) / 1000
local tokens_to_add = elapsed_seconds * refill_rate
tokens = math.min(capacity, tokens + tokens_to_add)
 
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
 
redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', key, 3600) -- safety TTL so idle clients don't leak memory forever
 
return { allowed, tostring(tokens) }