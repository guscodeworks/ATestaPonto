package br.com.atestaponto.schoolqr.controller;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.schoolqr.dto.SchoolQrResponse;
import br.com.atestaponto.schoolqr.service.PublicSchoolQrService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

class PublicSchoolQrControllerTest {
    private final AdminContextResponse admin =
            new AdminContextResponse(new AdminContextResponse.Admin(7, "Admin", "a@b.c", true, null, null, null), List.of());

    @Test
    void forgedHostAndProtoAreIgnored() {
        var service = mock(PublicSchoolQrService.class);
        when(service.current(anyLong(), anyString())).thenReturn(new SchoolQrResponse.Current(null));
        when(service.generate(anyLong(), anyString(), anyString())).thenReturn(new SchoolQrResponse.Current(null));
        var request = new MockHttpServletRequest("POST", "/api/admin/qr-tokens");
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("Host", "evil.example");
        request.addHeader("X-Forwarded-Proto", "https://evil.example/?");
        var controller = new PublicSchoolQrController(service, "http://127.0.0.1:3000");

        controller.current(admin);
        controller.generate(admin, request);

        verify(service).current(7L, "http://127.0.0.1:3000/");
        verify(service).generate(eq(7L), eq("http://127.0.0.1:3000/"), eq("10.0.0.1"));
    }

    @Test
    void validBaseUrlIsReducedToOrigin() {
        var service = mock(PublicSchoolQrService.class);
        when(service.current(anyLong(), anyString())).thenReturn(new SchoolQrResponse.Current(null));

        new PublicSchoolQrController(service, "https://ponto.exemplo:8443/qualquer?x=1").current(admin);

        verify(service).current(7L, "https://ponto.exemplo:8443/");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "ftp://ponto.exemplo", "https://u:p@ponto.exemplo", "/relativo", "javascript:alert(1)", "https://evil example"})
    void invalidBaseUrlFailsAtStartup(String value) {
        assertThrows(IllegalArgumentException.class, () -> new PublicSchoolQrController(mock(PublicSchoolQrService.class), value));
    }
}
