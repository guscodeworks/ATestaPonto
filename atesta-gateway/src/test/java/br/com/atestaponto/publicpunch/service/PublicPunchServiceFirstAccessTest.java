package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository.Credential;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsException;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import br.com.atestaponto.publicpunch.controller.PublicPunchErrors;
import br.com.atestaponto.punch.service.PunchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;

/** Teste unitario: repositorio mockado; regra de estado real do EmployeeCredentialsService, sem MySQL ou Redis. */
class PublicPunchServiceFirstAccessTest {
    private final ObjectMapper json = new ObjectMapper();
    private final EmployeeJwt jwt = new EmployeeJwt(json, new MockEnvironment().withProperty("JWT_SECRET", "test-secret-with-at-least-32-characters"));
    private final EmployeeCredentialsRepository repository = mock(EmployeeCredentialsRepository.class);
    private static final String HASH = "$2b$10$" + "a".repeat(53);
    private final PublicPunchService service = new PublicPunchService(new EmployeeCredentialsService(repository, jwt), mock(PunchService.class),
            jwt, json, new MockEnvironment().withProperty("BCRYPT_SALT_ROUNDS", "10"));
    private final PublicPunchErrors errors = new PublicPunchErrors(new MockEnvironment());

    private Object change() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + jwt.issue(42, HASH, true));
        return service.firstAccess(json.readTree("{\"novaSenha\":\"nova-senha-segura\"}"), request);
    }

    @Test
    void firstUseUpdatesPassword() throws Exception {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, true, HASH, LocalDateTime.now().plusDays(7), true));
        when(repository.updatePassword(eq(42L), anyString(), eq(true))).thenReturn(1);
        assertEquals(false, ((java.util.Map<?, ?>) change()).get("primeiro_acesso"));
        verify(repository).updatePassword(eq(42L), anyString(), eq(true));
    }

    @Test
    void reuseAfterCompletionIsConflictAndDoesNotWrite() throws Exception {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, false, HASH, null, false));
        var error = assertThrows(EmployeeCredentialsException.class, this::change);
        assertEquals(409, error.status());
        assertEquals("CONFLICT", error.code());
        var response = errors.credentials(error);
        assertEquals(409, response.getStatusCode().value());
        assertEquals(json.readTree("{\"success\":false,\"error\":{\"code\":\"CONFLICT\",\"message\":\"O primeiro acesso ja foi concluido\",\"details\":{}}}"),
                json.valueToTree(response.getBody()));
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }

    @Test
    void serviceFailureIsBadGateway() {
        when(repository.lockCredential(42)).thenThrow(new DataAccessResourceFailureException("down"));
        var error = assertThrows(PublicPunchException.class, this::change);
        assertEquals(502, error.status());
        assertEquals("EMPLOYEE_CREDENTIALS_SERVICE_UNAVAILABLE", error.code());
        assertEquals(502, errors.business(error).getStatusCode().value());
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }

    @Test
    void reissuedCredentialRejectsPreviousProofWithoutWriting() {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, true, HASH + "new", LocalDateTime.now().plusDays(7), true));
        assertEquals(401, assertThrows(EmployeeCredentialsException.class, this::change).status());
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }

    @Test
    void expiredOrMissingExpiryAndInactiveCredentialsRejectProofWithoutWriting() {
        for (var credential : java.util.List.of(
                new Credential(true, true, HASH, LocalDateTime.now().minusSeconds(1), false),
                new Credential(true, true, HASH, null, false),
                new Credential(true, true, HASH, null, true),
                new Credential(false, true, HASH, LocalDateTime.now().plusDays(7), true))) {
            when(repository.lockCredential(42)).thenReturn(credential);
            assertEquals(401, assertThrows(EmployeeCredentialsException.class, this::change).status());
        }
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }

    @Test
    void internalFirstAccessWithoutVersionIsRejected() {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, true, HASH, LocalDateTime.now().plusDays(7), true));
        var credentials = new EmployeeCredentialsService(repository, jwt);
        var change = new br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest.Change(
                com.fasterxml.jackson.databind.node.LongNode.valueOf(42), com.fasterxml.jackson.databind.node.TextNode.valueOf(HASH));
        assertEquals(401, assertThrows(EmployeeCredentialsException.class, () -> credentials.firstAccess(change)).status());
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }

    @Test
    void expiryBetweenLockAndWriteCannotReportSuccessfulPasswordChange() {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, true, HASH, LocalDateTime.now().plusSeconds(1), true));
        when(repository.updatePassword(eq(42L), anyString(), eq(true))).thenReturn(0);

        assertEquals(409, assertThrows(EmployeeCredentialsException.class, this::change).status());
        verify(repository).updatePassword(eq(42L), anyString(), eq(true));
    }

    @Test
    void resetPasswordStillUsesCompletedFirstAccessWithoutTemporaryExpiry() {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, false, HASH, null, false));
        when(repository.updatePassword(42, HASH, false)).thenReturn(1);
        var credentials = new EmployeeCredentialsService(repository, jwt);
        var request = new br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest.Change(
                com.fasterxml.jackson.databind.node.LongNode.valueOf(42), com.fasterxml.jackson.databind.node.TextNode.valueOf(HASH));

        assertEquals(true, credentials.resetPassword(request).updated());
        verify(repository).updatePassword(42, HASH, false);
    }

    @Test
    void changeWaitingForLockUsesReissuedCredentialInsteadOfPreviousProof() throws Exception {
        var entered = new java.util.concurrent.CountDownLatch(1);
        var released = new java.util.concurrent.CountDownLatch(1);
        var current = new java.util.concurrent.atomic.AtomicReference<>(
                new Credential(true, true, HASH, LocalDateTime.now().plusDays(7), true));
        when(repository.lockCredential(42)).thenAnswer(call -> {
            entered.countDown();
            if (!released.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Lock simulation timed out");
            return current.get();
        });

        try (var executor = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(this::change);
            try {
                org.junit.jupiter.api.Assertions.assertTrue(entered.await(5, java.util.concurrent.TimeUnit.SECONDS));
                current.set(new Credential(true, true, HASH + "reissued", LocalDateTime.now().plusDays(7), true));
            } finally {
                released.countDown();
            }
            var failure = assertThrows(java.util.concurrent.ExecutionException.class,
                    () -> pending.get(5, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(401, ((EmployeeCredentialsException) failure.getCause()).status());
        }
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }
}
