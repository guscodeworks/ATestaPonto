package br.com.atestaponto.internal.auth;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

@Component
public final class InternalRequestReplayCache {

    private static final int MAX_ENTRIES = 10_000;
    private final Map<UUID, Long> requestIds = new HashMap<>();
    private final long retentionNanos;
    private final ScheduledExecutorService cleanup;

    public InternalRequestReplayCache(
            @Value("${internal.auth.max-clock-skew-seconds}") long maxClockSkewSeconds) {
        if (maxClockSkewSeconds < 1 || maxClockSkewSeconds > 120) {
            throw new IllegalArgumentException("Configuracao de autenticacao interna invalida");
        }
        // Um timestamp futuro pode continuar valido por duas janelas desde a primeira chamada.
        // O segundo extra cobre a comparacao inclusiva de timestamps em segundos.
        retentionNanos = TimeUnit.SECONDS.toNanos(2 * maxClockSkewSeconds + 1);
        cleanup = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("internal-replay-cleanup").factory());
        cleanup.scheduleWithFixedDelay(this::removeExpired, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized boolean accept(UUID requestId) {
        long now = System.nanoTime();
        removeExpired(now);
        if (requestIds.containsKey(requestId) || requestIds.size() >= MAX_ENTRIES) {
            return false;
        }
        requestIds.put(requestId, now + retentionNanos);
        return true;
    }

    private synchronized void removeExpired() {
        removeExpired(System.nanoTime());
    }

    private void removeExpired(long now) {
        requestIds.values().removeIf(expiresAt -> expiresAt - now <= 0);
    }

    @PreDestroy
    public void close() {
        cleanup.shutdownNow();
    }
}
