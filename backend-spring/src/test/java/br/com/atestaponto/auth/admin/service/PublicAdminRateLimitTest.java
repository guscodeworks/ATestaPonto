package br.com.atestaponto.auth.admin.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit.Reservation;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import redis.clients.jedis.JedisPooled;
import redis.clients.jedis.exceptions.JedisConnectionException;

/** Teste unitario: armazenamento local real e Jedis mockado; nao conecta ao Redis. */
class PublicAdminRateLimitTest {

    @SuppressWarnings("unchecked")
    private static PublicAdminRateLimit limits(boolean redisEnabled, JedisPooled client) {
        ObjectProvider<JedisPooled> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(client);
        return new PublicAdminRateLimit(provider, new ObjectMapper(), "secret", null, "development", redisEnabled, 2000);
    }

    @Test
    void localCounterTracksCurrentAndRefundsOnlyMatchingGeneration() {
        var limits = limits(false, null);
        limits.increment("login", "a");
        Reservation second = limits.increment("login", "a");
        assertEquals(2, second.hits());
        assertEquals(2, limits.current("login", "a").hits());
        assertEquals(0, limits.current("login", "b").hits());
        limits.refund("login", "a", new Reservation(2, 1, "stale"));
        assertEquals(2, limits.current("login", "a").hits());
        limits.refund("login", "a", second);
        assertEquals(1, limits.current("login", "a").hits());
    }

    @Test
    void localCounterIsConsistentUnderConcurrentAccess() throws Exception {
        var limits = limits(false, null);
        var pool = Executors.newFixedThreadPool(8);
        try {
            for (int i = 0; i < 400; i++) {
                pool.submit(() -> limits.refund("login", "a", limits.increment("login", "a")));
                pool.submit(() -> limits.increment("login", "a"));
            }
        } finally {
            pool.shutdown();
        }
        assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        assertEquals(400, limits.current("login", "a").hits());
    }

    @Test
    void missingOrFailingRedisFailsClosed() {
        var absent = limits(true, null);
        assertThrows(IllegalStateException.class, () -> absent.increment("login", "a"));
        assertThrows(IllegalStateException.class, () -> absent.current("login", "a"));
        assertThrows(IllegalStateException.class, () -> absent.refund("login", "a", new Reservation(1, 1, "g")));

        JedisPooled broken = mock(JedisPooled.class);
        when(broken.eval(anyString(), anyList(), anyList())).thenThrow(new JedisConnectionException("down"));
        var failing = limits(true, broken);
        assertThrows(JedisConnectionException.class, () -> failing.increment("login", "a"));
        assertThrows(JedisConnectionException.class, () -> failing.current("login", "a"));

        JedisPooled invalid = mock(JedisPooled.class);
        when(invalid.eval(anyString(), anyList(), anyList())).thenReturn(List.of(1L));
        var corrupted = limits(true, invalid);
        assertThrows(IllegalStateException.class, () -> corrupted.increment("login", "a"));
        assertThrows(IllegalStateException.class, () -> corrupted.current("login", "a"));
    }

    @Test
    void slowRedisCallDoesNotBlockOtherCalls() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        JedisPooled client = mock(JedisPooled.class);
        when(client.eval(anyString(), anyList(), anyList())).thenAnswer(call -> {
            if (entered.getCount() == 1) {
                entered.countDown();
                release.await(10, TimeUnit.SECONDS);
            }
            return List.of(3L, 1000L);
        });
        var limits = limits(true, client);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var slow = pool.submit(() -> limits.current("login", "a"));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            var fast = pool.submit(() -> limits.current("login", "b"));
            assertEquals(3, fast.get(5, TimeUnit.SECONDS).hits());
            release.countDown();
            assertEquals(3, slow.get(5, TimeUnit.SECONDS).hits());
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }
}
