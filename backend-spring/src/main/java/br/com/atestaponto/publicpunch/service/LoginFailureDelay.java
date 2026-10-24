package br.com.atestaponto.publicpunch.service;

import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.async.DeferredResult;

/** Atrasa a resposta de login invalido sem ocupar a thread do Tomcat, como o setTimeout do Express. */
@Component
public class LoginFailureDelay implements DisposableBean {
    private final long delay;
    // Limita respostas pendentes; acima disso volta ao sleep na thread do request.
    private final Semaphore pending;
    private final ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1, task -> {
        Thread thread = new Thread(task, "login-failure-delay");
        thread.setDaemon(true);
        return thread;
    });
    public LoginFailureDelay(Environment env) { this(env, 1000); }
    LoginFailureDelay(Environment env, int maxPending) {
        delay = env.getProperty("LOGIN_FAILURE_DELAY_MS", Long.class, 2000L);
        if (delay < 0 || delay > 10000) throw new IllegalArgumentException("LOGIN_FAILURE_DELAY_MS invalido");
        pending = new Semaphore(maxPending);
    }
    public void fail(DeferredResult<?> result, PublicPunchException error) {
        if (pending.tryAcquire()) {
            try {
                timer.schedule(() -> {
                    try { result.setErrorResult(error); } finally { pending.release(); }
                }, delay, TimeUnit.MILLISECONDS);
                return;
            } catch (RejectedExecutionException shutdown) { pending.release(); }
        }
        try { Thread.sleep(delay); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        throw error;
    }
    @Override
    public void destroy() {
        // Respostas ja agendadas ainda sao entregues apos o shutdown.
        timer.shutdown();
        try {
            if (!timer.awaitTermination(delay + 1000, TimeUnit.MILLISECONDS)) timer.shutdownNow();
        } catch (InterruptedException e) {
            timer.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
