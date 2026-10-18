package br.com.atestaponto.auth.admin.service;

import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class PublicAdminAudit {
    private PublicAdminAudit() {}

    /** Somente IDs e estado do dominio; nunca recebe payload, CPF ou URL de QR. */
    public static void record(String event, long adminId, String ip, Map<String, Object> metadata) {
        Runnable log = () -> LoggerFactory.getLogger(PublicAdminAudit.class).info(
                "audit_evento evento={} adminId={} ipOrigem={} metadados={}", event, adminId, ip, metadata);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { log.run(); }
            });
        } else log.run();
    }
}
