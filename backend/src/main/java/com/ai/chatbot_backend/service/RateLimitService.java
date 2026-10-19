package com.ai.chatbot_backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;


@Service
@Slf4j
public class RateLimitService {

    private static final String PREFIX = "Twinkle:rl:";

    private final StringRedisTemplate redis;

    private static final class Entry {
        final long expiresAt;
        long count;

        Entry(long expiresAt) {
            this.expiresAt = expiresAt;
        }
    }

    private final Map<String, Entry> local = new ConcurrentHashMap<>();
    private volatile long lastCleanup = System.currentTimeMillis();

    public RateLimitService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * Fixed-window counter. Returns true while the caller is still within
     * {@code max} calls per {@code window}.
     */
    public boolean allow(String key, int max, Duration window) {
        return increment(key, window) <= max;
    }

    /** True when the key has already reached {@code max} within its window. */
    public boolean isBlocked(String key, int max) {
        return current(key) >= max;
    }

    /** Records one failure. The counter (and therefore the lockout) lasts for {@code lockout}. */
    public long recordFailure(String key, Duration lockout) {
        return increment(key, lockout);
    }

    /** Clears a counter, for example after a successful login. */
    public void reset(String key) {
        try {
            redis.delete(PREFIX + key);
        } catch (Exception e) {
            log.debug("Redis rate limit reset failed: {}", e.getMessage());
        }
        local.remove(key);
    }

    /** Seconds until the counter expires (at least 1). */
    public long retryAfterSeconds(String key) {
        try {
            Long ttl = redis.getExpire(PREFIX + key);
            if (ttl != null && ttl > 0) {
                return ttl;
            }
        } catch (Exception ignored) {
            // fall through to local
        }
        Entry entry = local.get(key);
        if (entry == null) {
            return 1;
        }
        return Math.max(1, (entry.expiresAt - System.currentTimeMillis()) / 1000);
    }

    private long increment(String key, Duration window) {
        try {
            String redisKey = PREFIX + key;
            Long value = redis.opsForValue().increment(redisKey);
            if (value != null) {
                if (value == 1L) {
                    redis.expire(redisKey, window);
                } else {
                    Long ttl = redis.getExpire(redisKey);
                    if (ttl != null && ttl == -1L) {
                        // Safety net: never leave a counter without an expiry.
                        redis.expire(redisKey, window);
                    }
                }
                return value;
            }
        } catch (Exception e) {
            log.debug("Redis rate limit unavailable, using memory: {}", e.getMessage());
        }
        return incrementLocal(key, window);
    }

    private long current(String key) {
        try {
            String value = redis.opsForValue().get(PREFIX + key);
            if (value != null) {
                return Long.parseLong(value);
            }
            return currentLocal(key);
        } catch (Exception e) {
            return currentLocal(key);
        }
    }

    private synchronized long incrementLocal(String key, Duration window) {
        long now = System.currentTimeMillis();
        cleanup(now);
        Entry entry = local.get(key);
        if (entry == null || entry.expiresAt <= now) {
            entry = new Entry(now + window.toMillis());
            local.put(key, entry);
        }
        entry.count++;
        return entry.count;
    }

    private long currentLocal(String key) {
        Entry entry = local.get(key);
        if (entry == null || entry.expiresAt <= System.currentTimeMillis()) {
            return 0;
        }
        return entry.count;
    }

    private void cleanup(long now) {
        if (now - lastCleanup < 60_000 && local.size() < 10_000) {
            return;
        }
        lastCleanup = now;
        local.entrySet().removeIf(e -> e.getValue().expiresAt <= now);
    }
}
