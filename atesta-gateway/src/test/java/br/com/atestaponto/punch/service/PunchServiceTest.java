package br.com.atestaponto.punch.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.punch.dto.PunchRequest;
import br.com.atestaponto.punch.repository.PunchRepository;
import br.com.atestaponto.punch.repository.PunchRepository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class PunchServiceTest {
    private static final String KEY = "00000000-0000-4000-8000-000000000001";
    private static final LocalDate DATE = LocalDate.of(2026, 11, 2);
    private static final Instant BEFORE_MIDNIGHT = Instant.parse("2026-11-03T02:59:59Z");
    private static final Instant MIDNIGHT = Instant.parse("2026-11-03T03:00:00Z");
    private final PunchRepository repository = mock(PunchRepository.class);
    private final ObjectMapper json = new ObjectMapper();
    private final Clock clock = mock(Clock.class);
    private final AtomicReference<Instant> current = new AtomicReference<>(BEFORE_MIDNIGHT);
    private PunchService service;

    @BeforeEach
    void setup() {
        when(clock.withZone(ZoneId.of("America/Sao_Paulo"))).thenReturn(clock);
        when(clock.getZone()).thenReturn(ZoneId.of("America/Sao_Paulo"));
        when(clock.instant()).thenAnswer(call -> current.get());
        when(repository.lockEmployee(5)).thenReturn(new Employee(5, "Teste", "teste@example.test", null, true));
        when(repository.activeLink(eq(5L), any(), eq(true))).thenReturn(7L);
        when(repository.location(7)).thenReturn(new Location(BigDecimal.ZERO, BigDecimal.ZERO, 100));
        when(repository.day(eq(7L), any(), anyBoolean())).thenReturn(List.of());
        when(repository.insert(eq(7L), any(), anyString(), anyString())).thenReturn(9L);
        service = new PunchService(repository, json, clock);
    }

    private PunchRequest request(Instant gps) {
        return new PunchRequest(LongNode.valueOf(5), KEY, "[0,0,10," + gps.toEpochMilli() + "]", null, null);
    }

    private void assertRejected(int status, PunchRequest request) {
        assertEquals(status, assertThrows(PunchException.class, () -> service.register(request)).status());
        verify(repository, never()).insert(anyLong(), any(), anyString(), anyString());
        verify(repository, never()).saveIdempotency(anyLong(), anyString(), anyString(), anyString());
    }

    private Row row(String type, String time) {
        return new Row(7, DATE.toString(), type, time, 20, "Unidade teste");
    }

    @ParameterizedTest
    @ValueSource(strings = {"employee", "idempotency"})
    void waitingBeforeDateSelectionUsesNewDay(String lock) {
        if (lock.equals("employee")) {
            when(repository.lockEmployee(5)).thenAnswer(call -> {
                current.set(MIDNIGHT);
                return new Employee(5, "Teste", null, null, true);
            });
        } else {
            when(repository.lockIdempotency(5, KEY)).thenAnswer(call -> {
                current.set(MIDNIGHT);
                return null;
            });
        }
        service.register(request(BEFORE_MIDNIGHT));
        verify(repository).activeLink(5, DATE.plusDays(1), true);
        verify(repository).day(7, DATE.plusDays(1), true);
        verify(repository).insert(7, DATE.plusDays(1), "ENTRADA", "2026-11-03 00:00:00");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void midnightDuringLinkLockRejectsEvenWhenNoLinkWasFound(boolean found) {
        when(repository.activeLink(5, DATE, true)).thenAnswer(call -> {
            current.set(MIDNIGHT);
            return found ? 7L : null;
        });
        assertRejected(409, request(BEFORE_MIDNIGHT));
        verify(repository, never()).location(anyLong());
        verify(repository, never()).day(anyLong(), any(), anyBoolean());
    }

    @ParameterizedTest
    @ValueSource(strings = {"location", "day"})
    void midnightAfterLinkLockRejectsWithoutWrites(String query) {
        if (query.equals("location")) {
            when(repository.location(7)).thenAnswer(call -> {
                current.set(MIDNIGHT);
                return new Location(BigDecimal.ZERO, BigDecimal.ZERO, 100);
            });
        } else {
            when(repository.day(7, DATE, true)).thenAnswer(call -> {
                current.set(MIDNIGHT);
                return List.of();
            });
        }
        assertRejected(409, request(BEFORE_MIDNIGHT));
    }

    @Test
    void retryAfterMidnightSelectsLinkForNewDay() {
        when(repository.activeLink(5, DATE, true)).thenAnswer(call -> {
            current.set(MIDNIGHT);
            return null;
        });
        var request = request(BEFORE_MIDNIGHT);
        assertRejected(409, request);
        var result = service.register(request);
        assertFalse(result.replayed());
        verify(repository).activeLink(5, DATE.plusDays(1), true);
        verify(repository).insert(7, DATE.plusDays(1), "ENTRADA", "2026-11-03 00:00:00");
    }

    @Test
    void effectiveTimeIsCapturedAfterLocksAndReusedDuringWrites() throws Exception {
        current.set(BEFORE_MIDNIGHT.minusSeconds(30));
        when(repository.day(7, DATE, true)).thenAnswer(call -> {
            current.set(BEFORE_MIDNIGHT);
            return List.of();
        });
        when(repository.insert(7, DATE, "ENTRADA", "2026-11-02 23:59:59")).thenAnswer(call -> {
            current.set(MIDNIGHT);
            return 9L;
        });
        var result = service.register(request(BEFORE_MIDNIGHT.minusSeconds(60)));
        assertEquals("2026-11-02 23:59:59", result.response().path("ponto").path("registrado_em").asText());
        var order = inOrder(repository, clock);
        order.verify(repository).lockEmployee(5);
        order.verify(repository).lockIdempotency(5, KEY);
        order.verify(clock).instant();
        order.verify(repository).activeLink(5, DATE, true);
        order.verify(clock).instant();
        order.verify(repository).day(7, DATE, true);
        order.verify(clock).instant();
        order.verify(repository).insert(7, DATE, "ENTRADA", "2026-11-02 23:59:59");
        verify(clock, times(3)).instant();
        var saved = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repository).saveIdempotency(eq(5L), eq(KEY), anyString(), saved.capture());
        assertEquals(json.readTree(result.response().toString()), json.readTree(saved.getValue()));
    }

    @ParameterizedTest
    @CsvSource({"-5001,false", "-5000,true", "60000,true", "60001,false"})
    void gpsAgeUsesEffectiveTime(long ageMillis, boolean accepted) {
        var request = request(BEFORE_MIDNIGHT.minusMillis(ageMillis));
        if (accepted) assertFalse(service.register(request).replayed());
        else assertRejected(400, request);
    }

    @Test
    void gpsExpiringDuringDayLockIsRejected() {
        current.set(BEFORE_MIDNIGHT.minusSeconds(61));
        var request = request(current.get());
        when(repository.day(7, DATE, true)).thenAnswer(call -> {
            current.set(BEFORE_MIDNIGHT);
            return List.of();
        });
        assertRejected(400, request);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void replayPrecedesClockVigencyAndGpsChecks(boolean samePayload) throws Exception {
        var request = request(BEFORE_MIDNIGHT);
        AtomicReference<Previous> previous = new AtomicReference<>();
        doAnswer(call -> {
            previous.set(new Previous(call.getArgument(2), call.getArgument(3)));
            return null;
        }).when(repository).saveIdempotency(eq(5L), eq(KEY), anyString(), anyString());
        var original = service.register(request);
        current.set(MIDNIGHT.plusSeconds(120));
        when(repository.lockEmployee(5)).thenReturn(new Employee(5, "Teste", null, null, false));
        when(repository.lockIdempotency(5, KEY)).thenReturn(previous.get());
        clearInvocations(repository, clock);
        if (samePayload) {
            var replay = service.register(request);
            assertTrue(replay.replayed());
            assertEquals(json.readTree(original.response().toString()), replay.response());
        } else {
            assertRejected(409, request(MIDNIGHT));
        }
        verify(repository).lockEmployee(5);
        verify(repository).lockIdempotency(5, KEY);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(clock);
    }

    @ParameterizedTest
    @CsvSource({"2026-11-03T00:30:00Z,2026-11-02,2026-11-02 21:30:00",
        "2026-11-03T03:00:00Z,2026-11-03,2026-11-03 00:00:00"})
    void utcClockStillUsesBrasiliaDateAndTime(String instant, LocalDate date, String timestamp) {
        var now = Instant.parse(instant);
        var service = new PunchService(repository, json, Clock.fixed(now, ZoneOffset.UTC));
        var request = new PunchRequest(LongNode.valueOf(5), KEY, request(now).leitura_json(), null, Instant.EPOCH);
        service.register(request);
        verify(repository).activeLink(5, date, true);
        verify(repository).insert(7, date, "ENTRADA", timestamp);
    }

    @ParameterizedTest
    @CsvSource({
        "2026-11-03T00:30:00Z,2026-11-02",
        "2026-11-03T02:59:59Z,2026-11-02",
        "2026-11-03T03:00:00Z,2026-11-03"
    })
    void todayAndRegistrationSelectLinkForSameFixedBrasiliaDate(String instant, LocalDate date) {
        var now = Instant.parse(instant);
        var service = new PunchService(repository, json, Clock.fixed(now, ZoneOffset.UTC));
        when(repository.dashboard(5, date)).thenReturn(new Dashboard("Teste", true, "PROFESSOR",
                "00:00:00", "04:00:00", "05:00:00", "09:00:00"));
        when(repository.activeLink(5, date, false)).thenReturn(7L);
        when(repository.day(7, date, false)).thenReturn(List.of());

        var today = service.today(new PunchRequest(LongNode.valueOf(5), null, null, null, null));
        service.register(request(now));

        assertEquals(date.toString(), today.ponto().data_referencia());
        verify(repository).dashboard(5, date);
        verify(repository).activeLink(5, date, false);
        verify(repository).activeLink(5, date, true);
        verify(repository).day(7, date, false);
        verify(repository).day(7, date, true);
    }

    @ParameterizedTest
    @CsvSource({
        "2026-11-03T02:59:59Z,2026-11-02,2026-11-03,false",
        "2026-11-03T03:00:00Z,2026-11-03,2026-11-03,true",
        "2026-11-03T02:59:59Z,2026-11-02,2026-11-02,true",
        "2026-11-03T03:00:00Z,2026-11-03,2026-11-02,false"
    })
    void todayUsesCurrentDateAtLinkStartAndEndEvenWithReference(
            String instant, LocalDate date, LocalDate validDate, boolean available) {
        var service = new PunchService(repository, json, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
        when(repository.dashboard(5, date)).thenReturn(new Dashboard("Teste", true, "PROFESSOR",
                "00:00:00", "04:00:00", "05:00:00", "09:00:00"));
        when(repository.activeLink(5, validDate, false)).thenReturn(7L);
        if (!available) when(repository.activeLink(5, date, false)).thenReturn(null);
        when(repository.day(7, validDate, false)).thenReturn(List.of());
        var reference = validDate.atStartOfDay(ZoneId.of("America/Sao_Paulo")).toInstant();
        var request = new PunchRequest(LongNode.valueOf(5), null, null, null, reference);

        if (available) {
            var result = service.today(request);
            assertEquals(validDate.toString(), result.ponto().data_referencia());
            verify(repository).day(7, validDate, false);
        } else {
            var error = assertThrows(PunchException.class, () -> service.today(request));
            assertEquals(404, error.status());
            assertEquals("Funcionario sem vinculo ativo", error.getMessage());
            verify(repository, never()).location(anyLong());
            verify(repository, never()).day(anyLong(), any(), anyBoolean());
        }
        verify(repository).dashboard(5, date);
        verify(repository).activeLink(5, date, false);
    }

    @Test
    void todayReferenceChangesPunchDateButNotCurrentLinkDate() {
        var service = new PunchService(repository, json, Clock.fixed(BEFORE_MIDNIGHT, ZoneOffset.UTC));
        when(repository.dashboard(5, DATE)).thenReturn(new Dashboard("Teste", true, "PROFESSOR",
                "00:00:00", "04:00:00", "05:00:00", "09:00:00"));
        when(repository.activeLink(5, DATE, false)).thenReturn(7L);
        when(repository.day(7, DATE.plusDays(1), false)).thenReturn(List.of());

        var result = service.today(new PunchRequest(LongNode.valueOf(5), null, null, null, MIDNIGHT));

        assertEquals(DATE.plusDays(1).toString(), result.ponto().data_referencia());
        verify(repository).dashboard(5, DATE);
        verify(repository).activeLink(5, DATE, false);
        verify(repository).day(7, DATE.plusDays(1), false);
    }

    @Test
    void absentLinkDoesNotAuthorizeRegistration() {
        when(repository.activeLink(5, DATE, true)).thenReturn(null);
        assertRejected(404, request(BEFORE_MIDNIGHT));
    }

    @Test
    void inactiveEmployeeDoesNotAuthorizeNewPunch() {
        when(repository.lockEmployee(5)).thenReturn(new Employee(5, "Teste", null, null, false));
        assertRejected(403, request(BEFORE_MIDNIGHT));
        verify(clock, never()).instant();
    }

    @Test
    void gpsAccuracyMustFitInsideSchoolRadius() {
        when(repository.location(7)).thenReturn(new Location(BigDecimal.ZERO, BigDecimal.ZERO, 9));
        assertRejected(403, request(BEFORE_MIDNIGHT));
    }

    @Test
    void midnightEntryIsNotRegisteredAgain() {
        when(repository.day(7, DATE, true)).thenReturn(List.of(row("ENTRADA", "00:00:00")));
        var result = service.register(request(BEFORE_MIDNIGHT));
        assertEquals("SAIDA_ALMOCO", result.response().path("ponto").path("tipo").asText());
        verify(repository).insert(7, DATE, "SAIDA_ALMOCO", "2026-11-02 23:59:59");
    }

    @Test
    void fourPunchesIncludingMidnightCompleteDay() {
        when(repository.day(7, DATE, true)).thenReturn(List.of(row("ENTRADA", "00:00:00"),
                row("SAIDA_ALMOCO", "04:00:00"), row("RETORNO_ALMOCO", "05:00:00"), row("SAIDA", "09:00:00")));
        assertRejected(409, request(BEFORE_MIDNIGHT));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void todayAndHistoryPreserveMidnightEntry(boolean complete) {
        var service = new PunchService(repository, json, Clock.fixed(BEFORE_MIDNIGHT, ZoneOffset.UTC));
        when(repository.dashboard(5, DATE)).thenReturn(new Dashboard("Teste", true, "PROFESSOR",
                "00:00:00", "04:00:00", "05:00:00", "09:00:00"));
        when(repository.activeLink(5, DATE, false)).thenReturn(7L);
        var rows = complete ? List.of(row("ENTRADA", "00:00:00"), row("SAIDA_ALMOCO", "04:00:00"),
                row("RETORNO_ALMOCO", "05:00:00"), row("SAIDA", "09:00:00"))
                : List.of(row("ENTRADA", "00:00:00"));
        when(repository.day(7, DATE, false)).thenReturn(rows);
        when(repository.history(5, DATE.withDayOfMonth(1), DATE.withDayOfMonth(30))).thenReturn(rows);
        var request = new PunchRequest(LongNode.valueOf(5), null, null,
                TextNode.valueOf("2026-11"), BEFORE_MIDNIGHT);
        var today = service.today(request);
        verify(repository).dashboard(5, DATE);
        verify(repository).activeLink(5, DATE, false);
        assertEquals("00:00:00", today.ponto().entrada());
        assertEquals(complete ? null : "SAIDA_ALMOCO", today.proxima_batida());
        assertEquals(complete, today.jornada_concluida());
        var history = service.history(request).registros().getFirst();
        assertEquals("00:00:00", history.entrada());
        assertEquals(complete ? Integer.valueOf(480) : null, history.total_minutos());
    }
}
