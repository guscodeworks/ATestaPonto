package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.employee.dto.EmployeeActivationRequest;
import br.com.atestaponto.employee.dto.EmployeeActivationResponse;
import br.com.atestaponto.employee.repository.EmployeeActivationRepository;
import br.com.atestaponto.employee.repository.EmployeeActivationRepository.Link;
import br.com.atestaponto.employee.repository.EmployeeActivationRepository.Unit;
import jakarta.validation.Validator;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.server.ResponseStatusException;

class EmployeeActivationServiceTest {
    private final EmployeeActivationRepository repository = mock(EmployeeActivationRepository.class);
    private final Validator validator = mock(Validator.class);

    private Link link(boolean active) {
        return new Link(7, 20, 3, active ? "ENCERRADO" : "ATIVO", "PROFESSOR",
                "07:00:00", "11:00:00", "12:00:00", "16:00:00");
    }

    private EmployeeActivationRequest request(boolean active) {
        return new EmployeeActivationRequest(active ? "REATIVAR" : "DESATIVAR", 7L, 20L, 10L);
    }

    private EmployeeActivationService service(boolean active, Clock clock) {
        when(validator.validate(any())).thenReturn(Set.of());
        when(repository.lockEmployee(5)).thenReturn(Optional.of(!active));
        when(repository.lockActiveLink(5)).thenReturn(active ? Optional.empty() : Optional.of(link(false)));
        when(repository.lockLatestLink(5)).thenReturn(Optional.of(link(true)));
        when(repository.lockUnit(20)).thenReturn(Optional.of(new Unit(20, 10L, true)));
        when(repository.changeStatus(5, active)).thenReturn(1);
        when(repository.createLink(eq(5L), any(), any())).thenReturn(1);
        when(repository.closeLink(eq(7L), any())).thenReturn(1);
        when(repository.findStatus(5)).thenReturn(new EmployeeActivationResponse(5, active, null));
        return new EmployeeActivationService(repository, validator, clock);
    }

    @ParameterizedTest
    @CsvSource({
        "true, 2026-11-03T00:30:00Z, 2026-11-02",
        "true, 2026-11-03T02:59:59Z, 2026-11-02",
        "true, 2026-11-03T03:00:00Z, 2026-11-03",
        "false, 2026-11-03T00:30:00Z, 2026-11-02",
        "false, 2026-11-03T02:59:59Z, 2026-11-02",
        "false, 2026-11-03T03:00:00Z, 2026-11-03"
    })
    void activationAndClosureUseBrasiliaDate(boolean active, String instant, LocalDate expected) {
        service(active, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)).changeActivation(5, active, request(active));
        if (active) {
            verify(repository).createLink(5, link(true), expected);
            verify(repository, never()).closeLink(anyLong(), any());
        } else {
            verify(repository).closeLink(7, expected);
            verify(repository, never()).createLink(anyLong(), any(), any());
        }
    }

    @Test
    void dateIsCapturedAfterUnitLockAndBeforeWrites() {
        Clock clock = mock(Clock.class);
        when(clock.withZone(ZoneId.of("America/Sao_Paulo"))).thenReturn(clock);
        when(clock.getZone()).thenReturn(ZoneId.of("America/Sao_Paulo"));
        when(clock.instant()).thenReturn(Instant.parse("2026-11-03T02:59:59Z"));
        var service = service(true, clock);
        when(repository.lockUnit(20)).thenAnswer(call -> {
            when(clock.instant()).thenReturn(Instant.parse("2026-11-03T03:00:00Z"));
            return Optional.of(new Unit(20, 10L, true));
        });
        when(repository.changeStatus(5, true)).thenAnswer(call -> {
            when(clock.instant()).thenReturn(Instant.parse("2026-11-04T03:00:00Z"));
            return 1;
        });
        service.changeActivation(5, true, request(true));
        var order = inOrder(repository, clock);
        order.verify(repository).lockUnit(20);
        order.verify(clock).instant();
        order.verify(repository).changeStatus(5, true);
        order.verify(repository).createLink(5, link(true), LocalDate.of(2026, 11, 3));
        verify(clock, times(1)).instant();
    }

    @Test
    void changedScopePreventsWrites() {
        var service = service(true, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        when(repository.lockUnit(20)).thenReturn(Optional.of(new Unit(20, 11L, true)));
        assertThrows(ResponseStatusException.class, () -> service.changeActivation(5, true, request(true)));
        verify(repository, never()).changeStatus(anyLong(), anyBoolean());
        verify(repository, never()).createLink(anyLong(), any(), any());
    }
}
