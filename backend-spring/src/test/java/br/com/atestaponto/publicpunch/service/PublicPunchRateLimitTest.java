package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit.Reservation;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** Teste unitario: PublicAdminRateLimit e mockado; o RemoteIpValve do Tomcat nao e executado aqui. */
class PublicPunchRateLimitTest {

    private final PublicAdminRateLimit limits = mock(PublicAdminRateLimit.class);
    private final PublicPunchRateLimit rateLimit = new PublicPunchRateLimit(limits, new MockEnvironment());

    @BeforeEach
    void realReserve() {
        // reserve() real sobre increment() mockado: exercita os headers RateLimit/Retry-After de producao.
        when(limits.reserve(any(), any(), anyInt(), anyLong(), any(HttpServletResponse.class))).thenCallRealMethod();
    }

    private static MockHttpServletRequest request(String remoteAddr) {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        request.addHeader("X-Forwarded-For", "203.0.113.9, 198.51.100.7");
        return request;
    }

    @Test
    void quotaUsesRemoteAddrAndIgnoresClientForwardedFor() {
        when(limits.ipLimit()).thenReturn(100);
        when(limits.increment(any(), any(), anyLong())).thenReturn(new Reservation(1, 1000, "g"));
        var response = new MockHttpServletResponse();
        rateLimit.ip(request("10.0.0.1"), response);
        rateLimit.ip(request("2001:db8:1234:5678::1"), new MockHttpServletResponse());
        verify(limits).increment("ip-abuse", "10.0.0.1", 900000L);
        verify(limits).increment("ip-abuse", "2001:db8:1234:5600::/56", 900000L);
        assertEquals("\"ip-abuse\"; r=99; t=1", response.getHeader("RateLimit"));
        assertNull(response.getHeader("Retry-After"));
    }

    @Test
    void exceededQuotaReturns429WithRetryAfter() {
        when(limits.increment(any(), any(), anyLong())).thenReturn(new Reservation(501, 1500, "g"));
        var response = new MockHttpServletResponse();
        var error = assertThrows(PublicPunchException.class, () -> rateLimit.point(42, response));
        assertEquals(429, error.status());
        assertEquals("RATE_LIMITED", error.code());
        assertEquals("2", response.getHeader("Retry-After"));
        verify(limits).increment("point", "employee:42", 300000L);
    }

    @Test
    void storeFailureFailsClosedWith503() {
        when(limits.increment(any(), any(), anyLong())).thenThrow(new IllegalStateException("redis down"));
        var response = new MockHttpServletResponse();
        var error = assertThrows(PublicPunchException.class, () -> rateLimit.point(42, response));
        assertEquals(503, error.status());
        assertEquals("RATE_LIMIT_UNAVAILABLE", error.code());
        assertNull(response.getHeader("Retry-After"));
    }
}
