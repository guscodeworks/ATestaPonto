package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/** Teste unitario: o RemoteIpValve do Tomcat nao e executado; getRemoteAddr simula o valor ja resolvido. */
class PublicPunchServiceAuditIpTest {

    private static MockHttpServletRequest request(String remoteAddr) {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        request.addHeader("X-Forwarded-For", "203.0.113.9, 198.51.100.7");
        return request;
    }

    @Test
    void ignoresForgedForwardedForWithIpv4() {
        assertEquals("10.0.0.1", PublicPunchService.auditIp(request("10.0.0.1")));
    }

    @Test
    void ignoresForgedForwardedForWithIpv6() {
        assertEquals("2001:db8::1", PublicPunchService.auditIp(request("2001:db8::1")));
    }

    @Test
    void invalidRemoteAddrIsNotReplacedByForwardedFor() {
        assertEquals("[InvalidIP]", PublicPunchService.auditIp(request("evil\r\nhost")));
    }
}
