package br.com.atestaponto.auth.admin.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit.Reservation;
import br.com.atestaponto.auth.admin.service.PublicReportAuthorization;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** Teste unitario do filtro com dependencias mockadas; nao sobe Spring Security nem Redis. */
class PublicReportApiFilterTest {

    private final ObjectMapper json = new ObjectMapper();
    private final PublicAdminRateLimit limits = mock(PublicAdminRateLimit.class);
    private final PublicReportApiFilter filter = new PublicReportApiFilter(mock(PublicReportAuthorization.class), limits, json);

    @BeforeEach
    void realReserve() {
        // reserve() real sobre increment() mockado: exercita os headers RateLimit/Retry-After de producao.
        when(limits.reserve(any(), any(), anyInt(), any(HttpServletResponse.class))).thenCallRealMethod();
        when(limits.reserve(any(), any(), anyInt(), anyLong(), any(HttpServletResponse.class))).thenCallRealMethod();
    }

    private static MockHttpServletRequest request(boolean session) {
        var request = new MockHttpServletRequest("GET", "/api/admin/pontos/hoje");
        request.setServletPath("/api/admin/pontos/hoje");
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("X-Forwarded-For", "203.0.113.9");
        if (session) request.setAttribute("adminContext", new AdminContextResponse(
                new AdminContextResponse.Admin(7, "Admin Teste", "admin@example.test", true, null, null, null), List.of()));
        return request;
    }

    @Test
    void missingSessionReturnsStandardErrorContract() throws Exception {
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        filter.doFilter(request(false), response, chain);
        assertNull(chain.getRequest());
        assertEquals(401, response.getStatus());
        assertEquals("no-store", response.getHeader("Cache-Control"));
        var body = json.readTree(response.getContentAsByteArray());
        assertEquals(false, body.get("success").asBoolean());
        assertEquals("UNAUTHORIZED", body.at("/error/code").asText());
        assertEquals("Sessao administrativa Gov.br obrigatoria", body.at("/error/message").asText());
        assertEquals(0, body.at("/error/details").size());
    }

    @Test
    void ipQuotaIgnoresClientForwardedFor() throws Exception {
        when(limits.ipLimit()).thenReturn(100);
        when(limits.increment(any(), any(), anyLong())).thenReturn(new Reservation(1, 1000, "g"));
        var chain = new MockFilterChain();
        filter.doFilter(request(true), new MockHttpServletResponse(), chain);
        verify(limits).increment("ip-abuse", "10.0.0.1", 900000L);
        verify(limits).increment("sensitive", "admin:7", 900000L);
        assertEquals("10.0.0.1", chain.getRequest().getRemoteAddr());
    }

    @Test
    void exceededQuotaReturns429Contract() throws Exception {
        when(limits.ipLimit()).thenReturn(100);
        when(limits.increment(any(), any(), anyLong())).thenReturn(new Reservation(101, 1000, "g"));
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        filter.doFilter(request(true), response, chain);
        assertNull(chain.getRequest());
        assertEquals(429, response.getStatus());
        assertEquals("1", response.getHeader("Retry-After"));
        var body = json.readTree(response.getContentAsByteArray());
        assertEquals("RATE_LIMITED", body.at("/error/code").asText());
        verify(limits).increment("ip-abuse", "10.0.0.1", 900000L);
    }

    @Test
    void storeFailureFailsClosedWith503() throws Exception {
        when(limits.ipLimit()).thenReturn(100);
        when(limits.increment(any(), any(), anyLong())).thenThrow(new IllegalStateException("redis down"));
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        filter.doFilter(request(true), response, chain);
        assertNull(chain.getRequest());
        assertEquals(503, response.getStatus());
        assertEquals("RATE_LIMIT_UNAVAILABLE", json.readTree(response.getContentAsByteArray()).at("/error/code").asText());
    }
}
