package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.context.request.async.DeferredResult;

/** Teste unitario: DeferredResult isolado, sem Tomcat, MySQL ou Redis. */
class LoginFailureDelayTest {
    private static final long DELAY = 300;
    private final PublicPunchException error = new PublicPunchService.InvalidLogin();
    private LoginFailureDelay delay;

    private static MockEnvironment env(String value) { return new MockEnvironment().withProperty("LOGIN_FAILURE_DELAY_MS", value); }

    private static CountDownLatch completion(DeferredResult<?> result) {
        var done = new CountDownLatch(1);
        result.setResultHandler(value -> done.countDown());
        return done;
    }

    @AfterEach
    void stop() { if (delay != null) delay.destroy(); }

    @Test
    void concurrentFailuresDoNotBlockCallerAndKeepDelay() throws Exception {
        delay = new LoginFailureDelay(env(String.valueOf(DELAY)), 100);
        var results = new ArrayList<DeferredResult<Object>>();
        var latches = new ArrayList<CountDownLatch>();
        long started = System.nanoTime();
        for (int i = 0; i < 50; i++) {
            var result = new DeferredResult<Object>();
            latches.add(completion(result));
            results.add(result);
            delay.fail(result, error);
        }
        assertTrue(elapsed(started) < DELAY, "fail() bloqueou a thread do request");
        for (var result : results) assertFalse(result.hasResult(), "resposta antes do atraso");
        for (var latch : latches) assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertTrue(elapsed(started) >= DELAY);
        for (var result : results) assertSame(error, result.getResult());
    }

    @Test
    void fullQueueFallsBackToBlockingDelayAndReleasesSlot() throws Exception {
        delay = new LoginFailureDelay(env(String.valueOf(DELAY)), 1);
        var first = new DeferredResult<Object>();
        var done = completion(first);
        delay.fail(first, error);
        long started = System.nanoTime();
        assertSame(error, assertThrows(PublicPunchException.class, () -> delay.fail(new DeferredResult<Object>(), error)));
        assertTrue(elapsed(started) >= DELAY, "fallback sem atraso");
        assertTrue(done.await(5, TimeUnit.SECONDS));
        // Vaga devolvida: a proxima falha volta a ser assincrona.
        started = System.nanoTime();
        delay.fail(new DeferredResult<Object>(), error);
        assertTrue(elapsed(started) < DELAY);
    }

    @Test
    void interruptedFallbackThrowsAndKeepsInterruptFlag() {
        delay = new LoginFailureDelay(env("10000"), 0);
        Thread.currentThread().interrupt();
        try {
            long started = System.nanoTime();
            assertSame(error, assertThrows(PublicPunchException.class, () -> delay.fail(new DeferredResult<Object>(), error)));
            assertTrue(elapsed(started) < 1000);
            assertTrue(Thread.currentThread().isInterrupted());
        } finally { Thread.interrupted(); }
    }

    @Test
    void shutdownDeliversPendingAndRejectsWithoutLeakingSlot() throws Exception {
        delay = new LoginFailureDelay(env(String.valueOf(DELAY)), 1);
        var pending = new DeferredResult<Object>();
        delay.fail(pending, error);
        delay.destroy();
        assertSame(error, pending.getResult());
        long started = System.nanoTime();
        assertThrows(PublicPunchException.class, () -> delay.fail(new DeferredResult<Object>(), error));
        assertTrue(elapsed(started) >= DELAY);
    }

    @Test
    void rejectsInvalidConfiguration() {
        for (String value : List.of("-1", "10001"))
            assertThrows(IllegalArgumentException.class, () -> new LoginFailureDelay(env(value)));
    }

    private static long elapsed(long started) { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started); }
}
