package br.com.atestaponto.report.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import br.com.atestaponto.report.service.PublicReportService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.util.LinkedMultiValueMap;

/** Teste unitario: o RemoteIpValve do Tomcat nao e executado; getRemoteAddr simula o valor ja resolvido. */
class PublicReportControllerTest {

    @Test
    void auditIpIgnoresForgedForwardedFor() {
        var service = mock(PublicReportService.class);
        var request = new MockHttpServletRequest("GET", "/api/admin/pontos/hoje");
        request.setServletPath("/api/admin/pontos/hoje");
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("X-Forwarded-For", "203.0.113.9, 198.51.100.7");
        var admin = new AdminContextResponse(new AdminContextResponse.Admin(7, "Admin", "a@b.c", true, null, null, null), List.of());
        when(service.read(any(), any(), any(), eq(7L), any())).thenReturn(Map.of());

        new PublicReportController(service).read(admin, new Scope(true, List.of(), List.of()), new LinkedMultiValueMap<>(), request);

        verify(service).read(eq("hoje"), any(), any(), eq(7L), eq("10.0.0.1"));
    }
}
