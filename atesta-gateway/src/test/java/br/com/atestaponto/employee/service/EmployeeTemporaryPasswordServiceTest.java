package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization.Context;
import br.com.atestaponto.employee.repository.EmployeeEditRepository;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository.Credential;
import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import br.com.atestaponto.publicpunch.service.EmployeeJwt;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

class EmployeeTemporaryPasswordServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final EmployeeCredentialsRepository repository = mock(EmployeeCredentialsRepository.class);
    private final EmployeeEditRepository links = mock(EmployeeEditRepository.class);
    private final PublicAdminAuthorization admins = mock(PublicAdminAuthorization.class);
    private final PublicEmployeeAuthorization authorization = mock(PublicEmployeeAuthorization.class);
    private final EmployeeWelcomeEmail mail = mock(EmployeeWelcomeEmail.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private final EmployeeJwt jwt = new EmployeeJwt(json, new MockEnvironment().withProperty("JWT_SECRET", "test-only-jwt-key-at-least-32-characters"));
    private final EmployeeTemporaryPasswordService service = new EmployeeTemporaryPasswordService(
            repository, links, admins, authorization, jwt, mail, transactions, 4);
    private final Context context = new Context(7, "funcionario.editar", List.of(20L), null, null,
            new EmploymentLinkScopeResponse(50, 20, 10L));
    private final LocalDateTime expires = LocalDateTime.of(2026, 11, 10, 15, 0);
    private final String oldHash = new BCryptPasswordEncoder(4).encode("previous-test-password");

    private void authorized() {
        var admin = mock(AdminContextResponse.class);
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(admins.requireActiveForUpdate(7)).thenReturn(admin);
        when(authorization.authorizeInWriteTransaction(admin, "funcionario.editar", 5L, null)).thenReturn(context);
        when(links.lockActiveLink(5)).thenReturn(Optional.of(new EmployeeEditRepository.Link(50, 20, "PROFESSOR", "07:00", "11:00", "12:00", "16:00")));
        when(links.lockAuthorizedUnit(20, 10)).thenReturn(true);
        when(repository.lockCredential(5)).thenReturn(new Credential(true, true, oldHash, expires, true));
        when(repository.reissueTemporary(eq(5L), anyString())).thenReturn(1);
        when(links.lockEmployee(5)).thenReturn(Optional.of(new EmployeeEditRepository.Employee(5, "Pessoa", "00000000000", "person@example.test", null)));
        when(mail.send(anyString(), anyString(), anyString())).thenReturn(Map.of("enviado", false, "estado", "desativado", "motivo", "desativado"));
    }

    private JsonNode body(String version) {
        return json.valueToTree(Map.of("confirmacao", "REEMITIR", "versao_esperada", version));
    }

    @Test
    void commitsBeforeEmailAndReturnsSameGeneratedPasswordOnlyAsContingency() {
        authorized();
        var result = service.reissue(context, 5, body(jwt.version(5, oldHash)));
        var order = inOrder(transactions, repository, mail);
        order.verify(repository).reissueTemporary(eq(5L), anyString());
        order.verify(transactions).commit(any());
        order.verify(mail).send(eq("Pessoa"), eq("person@example.test"), anyString());
        var hash = ArgumentCaptor.forClass(String.class);
        verify(repository).reissueTemporary(eq(5L), hash.capture());
        var fallback = (Map<?, ?>) result.get("senha_temporaria");
        String password = (String) fallback.get("senha");
        assertTrue(new BCryptPasswordEncoder(4).matches(password, hash.getValue()));
        assertEquals("2026-11-10T15:00:00Z", fallback.get("expira_em"));
        verify(mail).send("Pessoa", "person@example.test", password);
        assertFalse(result.toString().contains(hash.getValue()));
    }

    @Test
    void smtpAcceptanceOmitsPassword() {
        authorized();
        when(mail.send(anyString(), anyString(), anyString())).thenReturn(Map.of("enviado", true, "estado", "aceito_smtp"));
        assertFalse(service.reissue(context, 5, body(jwt.version(5, oldHash))).containsKey("senha_temporaria"));
    }

    @Test
    void staleVersionCannotReissueOrSend() {
        authorized();
        var error = assertThrows(ResponseStatusException.class, () -> service.reissue(context, 5, body("0".repeat(64))));
        assertEquals(409, error.getStatusCode().value());
        verify(repository, never()).reissueTemporary(anyLong(), anyString());
        verify(transactions).rollback(any());
        verifyNoInteractions(mail);
    }

    @Test
    void repeatedOldRequestDoesNotRotateAgain() {
        authorized();
        var first = new Credential(true, true, oldHash, expires, true);
        var replaced = new Credential(true, true, new BCryptPasswordEncoder(4).encode("reissued-test-password"), expires, true);
        when(repository.lockCredential(5)).thenReturn(first, replaced, replaced);
        service.reissue(context, 5, body(jwt.version(5, oldHash)));
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> service.reissue(context, 5, body(jwt.version(5, oldHash)))).getStatusCode().value());
        verify(repository, times(1)).reissueTemporary(anyLong(), anyString());
        verify(mail, times(1)).send(anyString(), anyString(), anyString());
    }

    @Test
    void concurrentRequestsWithSameVersionOnlyUpdateOnceUnderSimulatedRowLock() throws Exception {
        authorized();
        var lock = new java.util.concurrent.locks.ReentrantLock();
        var currentHash = new java.util.concurrent.atomic.AtomicReference<>(oldHash);
        when(transactions.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        when(repository.lockCredential(5)).thenAnswer(call -> {
            if (!lock.isHeldByCurrentThread()) lock.lock();
            return new Credential(true, true, currentHash.get(), expires, true);
        });
        when(repository.reissueTemporary(eq(5L), anyString())).thenAnswer(call -> {
            currentHash.set(call.getArgument(1));
            return 1;
        });
        doAnswer(call -> { lock.unlock(); return null; }).when(transactions).commit(any());
        doAnswer(call -> { if (lock.isHeldByCurrentThread()) lock.unlock(); return null; }).when(transactions).rollback(any());
        var start = new java.util.concurrent.CountDownLatch(1);
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        java.util.concurrent.Callable<Integer> request = () -> {
            assertTrue(start.await(5, java.util.concurrent.TimeUnit.SECONDS));
            try { service.reissue(context, 5, body(jwt.version(5, oldHash))); return 200; }
            catch (ResponseStatusException conflict) { return conflict.getStatusCode().value(); }
        };
        try {
            var first = pool.submit(request);
            var second = pool.submit(request);
            start.countDown();
            var statuses = new java.util.ArrayList<>(List.of(first.get(5, java.util.concurrent.TimeUnit.SECONDS),
                    second.get(5, java.util.concurrent.TimeUnit.SECONDS)));
            statuses.sort(Integer::compareTo);
            assertEquals(List.of(200, 409), statuses);
            verify(repository, times(1)).reissueTemporary(anyLong(), anyString());
            verify(mail, times(1)).send(anyString(), anyString(), anyString());
        } finally { pool.shutdownNow(); }
    }

    @Test
    void inactiveOrCompletedFirstAccessCannotReissue() {
        authorized();
        for (var current : List.of(new Credential(false, true, oldHash, expires, true),
                new Credential(true, false, oldHash, null, false))) {
            when(repository.lockCredential(5)).thenReturn(current);
            assertEquals(409, assertThrows(ResponseStatusException.class,
                    () -> service.reissue(context, 5, body(jwt.version(5, oldHash)))).getStatusCode().value());
        }
        verify(repository, never()).reissueTemporary(anyLong(), anyString());
        verifyNoInteractions(mail);
    }

    @Test
    void revokedAuthorizationRollsBackBeforeCredentialChange() {
        authorized();
        when(admins.requireActiveForUpdate(7)).thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN));
        assertThrows(ResponseStatusException.class, () -> service.reissue(context, 5, body(jwt.version(5, oldHash))));
        verify(repository, never()).lockCredential(anyLong());
        verifyNoInteractions(mail);
    }

    @Test
    void changedTerritoryIsRecheckedUnderLock() {
        authorized();
        when(links.lockAuthorizedUnit(20, 10)).thenReturn(false);
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> service.reissue(context, 5, body(jwt.version(5, oldHash)))).getStatusCode().value());
        verify(repository, never()).reissueTemporary(anyLong(), anyString());
        verifyNoInteractions(mail);
    }

    @Test
    void explicitConfirmationIsRequiredBeforeOpeningTransaction() {
        assertThrows(ResponseStatusException.class, () -> service.reissue(context, 5,
                json.valueToTree(Map.of("versao_esperada", jwt.version(5, oldHash)))));
        verifyNoInteractions(transactions, repository, mail, admins);
    }

    @Test
    void smtpFailureAfterCommitDoesNotRollback() {
        authorized();
        when(mail.send(anyString(), anyString(), anyString())).thenReturn(Map.of("enviado", false, "estado", "desconhecido", "motivo", "falha_no_envio"));
        assertTrue(service.reissue(context, 5, body(jwt.version(5, oldHash))).containsKey("senha_temporaria"));
        verify(transactions).commit(any());
        verify(transactions, never()).rollback(any());
    }
}
