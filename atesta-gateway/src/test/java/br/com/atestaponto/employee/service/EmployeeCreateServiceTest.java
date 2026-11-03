package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.employee.dto.EmployeeCreateRequest;
import br.com.atestaponto.employee.repository.EmployeeCreateRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

class EmployeeCreateServiceTest {
    private final EmployeeCreateRepository repository = mock(EmployeeCreateRepository.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);

    private EmployeeCreateService service(Clock clock) {
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(repository.lockExistingSchoolUnit(20)).thenReturn(true);
        when(repository.findOrCreateCargo("PROFESSOR")).thenReturn(3L);
        when(repository.insertEmployee(anyString(), anyString(), anyString(), isNull(), anyBoolean())).thenReturn(5L);
        when(repository.insertEmploymentLink(anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), any())).thenReturn(7L);
        return new EmployeeCreateService(repository, transactions, clock);
    }

    private EmployeeCreateRequest request(boolean active) {
        return new EmployeeCreateRequest("Pessoa Teste", "52998224725", "pessoa@example.test", null,
                active, 20L, "PROFESSOR", "07:00", "11:00", "12:00", "16:00", "test-hash");
    }

    @ParameterizedTest
    @CsvSource({
        "2026-11-03T00:30:00Z, 2026-11-02",
        "2026-11-03T02:59:59Z, 2026-11-02",
        "2026-11-03T03:00:00Z, 2026-11-03"
    })
    void creationUsesBrasiliaDateEvenWithUtcClock(String instant, LocalDate expected) {
        service(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)).create(request(true));
        verify(repository).insertEmploymentLink(5, 20, 3, "07:00:00", "11:00:00", "12:00:00", "16:00:00", expected);
        verify(repository, never()).closeEmploymentLink(anyLong(), any());
        verify(transactions).commit(any());
    }

    @Test
    void inactiveCreationCapturesAfterLocksAndReusesDateAcrossMidnight() {
        Clock clock = mock(Clock.class);
        when(clock.withZone(ZoneId.of("America/Sao_Paulo"))).thenReturn(clock);
        when(clock.getZone()).thenReturn(ZoneId.of("America/Sao_Paulo"));
        when(clock.instant()).thenReturn(Instant.parse("2026-11-03T02:59:59Z"));
        var service = service(clock);
        when(repository.findOrCreateCargo("PROFESSOR")).thenAnswer(call -> {
            when(clock.instant()).thenReturn(Instant.parse("2026-11-03T03:00:00Z"));
            return 3L;
        });
        when(repository.insertEmploymentLink(anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), any())).thenAnswer(call -> {
                    when(clock.instant()).thenReturn(Instant.parse("2026-11-04T03:00:00Z"));
                    return 7L;
                });
        service.create(request(false));
        LocalDate date = LocalDate.of(2026, 11, 3);
        var order = inOrder(repository, clock);
        order.verify(repository).lockExistingSchoolUnit(20);
        order.verify(repository).findOrCreateCargo("PROFESSOR");
        order.verify(clock).instant();
        order.verify(repository).insertEmploymentLink(5, 20, 3, "07:00:00", "11:00:00", "12:00:00", "16:00:00", date);
        order.verify(repository).closeEmploymentLink(7, date);
        verify(clock, times(1)).instant();
    }

    @Test
    void closureFailureRollsBackCreation() {
        var service = service(Clock.fixed(Instant.parse("2026-11-03T00:30:00Z"), ZoneOffset.UTC));
        doThrow(new IllegalStateException("close failed")).when(repository).closeEmploymentLink(anyLong(), any());
        assertThrows(IllegalStateException.class, () -> service.create(request(false)));
        verify(transactions).rollback(any());
        verify(transactions, never()).commit(any());
        verify(repository, never()).findCreatedEmployee(anyLong());
    }

    @Test
    void invalidScopeDoesNotInsert() {
        var service = service(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        assertThrows(ResponseStatusException.class, () -> service.createAuthorized(request(true), () -> null));
        verify(repository, never()).insertEmployee(anyString(), anyString(), anyString(), any(), anyBoolean());
        verify(transactions).rollback(any());
    }

    @Test
    void invalidRequestDoesNotStartTransaction() {
        var service = service(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        assertThrows(ResponseStatusException.class, () -> service.create(null));
        verify(transactions, never()).getTransaction(any());
        verifyNoInteractions(repository);
    }
}
