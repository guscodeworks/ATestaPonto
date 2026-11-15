package br.com.atestaponto.auth.admin.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.auth.admin.controller.PublicAdminAuthController.AdminPrincipal;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit.Reservation;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Filtros reais com dependencias mockadas; sem startup, banco ou Redis. */
class PublicTemporaryPasswordFilterTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PublicAdminRateLimit limits = mock(PublicAdminRateLimit.class);
    private final PublicEmployeeAuthorization authorization = mock(PublicEmployeeAuthorization.class);
    private final PublicAccessApiFilter access = new PublicAccessApiFilter(limits, json);
    private final PublicEmployeeAuthorizationFilter employees = new PublicEmployeeAuthorizationFilter(authorization, json);
    private final AdminContextResponse admin = mock(AdminContextResponse.class);

    @BeforeEach
    void configureSessionAndMockOnlyRateStorage() {
        when(limits.ipLimit()).thenReturn(100);
        when(limits.reserve(any(), any(), anyInt(), any(HttpServletResponse.class))).thenCallRealMethod();
        when(limits.reserve(any(), any(), anyInt(), anyLong(), any(HttpServletResponse.class))).thenCallRealMethod();
        when(limits.increment(any(), any(), anyLong())).thenReturn(new Reservation(1, 1500, "g"));
        var principal = new AdminPrincipal(7, "test-admin", Instant.EPOCH, "Admin", "admin@example.test");
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of()));
    }

    @AfterEach
    void clearSession() { SecurityContextHolder.clearContext(); }

    private MockHttpServletRequest request(String id, String method, String body) {
        String path = "/api/admin/funcionarios/" + id + "/senha-temporaria";
        var request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("X-Forwarded-For", "203.0.113.9");
        request.setAttribute("adminContext", admin);
        request.setContentType("application/json");
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        return request;
    }

    @Test
    void reissueReservesIpAdminAndEmployeeQuotasAndPreservesParsedBody() throws Exception {
        var payload = json.createObjectNode().put("confirmacao", "REEMITIR").put("versao_esperada", "a".repeat(64));
        var request = request("5", "POST", payload.toString());
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        access.doFilter(request, response, chain);

        assertSame(request, chain.getRequest());
        assertEquals(payload, request.getAttribute("publicAccessBody"));
        assertEquals("no-store", response.getHeader("Cache-Control"));
        assertEquals("no-cache", response.getHeader("Pragma"));
        verify(limits).reserve("ip-abuse", "10.0.0.1", 100, response);
        verify(limits).reserve("sensitive", "admin:7", 40, response);
        verify(limits).reserve("temporary-password", List.of("admin:7", "5"), 5, response);
        assertTrue(response.getHeaders("RateLimit-Policy").contains("\"temporary-password\"; q=5; w=900"));
    }

    @ParameterizedTest
    @CsvSource({"ip-abuse,101", "sensitive,41", "temporary-password,6"})
    void anyExceededQuotaFailsClosed(String quota, int hits) throws Exception {
        when(limits.increment(eq(quota), any(), anyLong())).thenReturn(new Reservation(hits, 1500, "g"));
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        access.doFilter(request("5", "POST", "{}"), response, chain);

        assertNull(chain.getRequest());
        assertEquals(429, response.getStatus());
        assertEquals("2", response.getHeader("Retry-After"));
        assertEquals("no-store", response.getHeader("Cache-Control"));
        assertEquals("RATE_LIMITED", json.readTree(response.getContentAsByteArray()).at("/error/code").asText());
    }

    @Test
    void unavailableRateStoreFailsClosedBeforeAuthorizationOrMutation() throws Exception {
        when(limits.increment(any(), any(), anyLong())).thenThrow(new IllegalStateException("redis unavailable"));
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        access.doFilter(request("5", "POST", "{}"), response, chain);

        assertNull(chain.getRequest());
        assertEquals(503, response.getStatus());
        assertEquals("no-store", response.getHeader("Cache-Control"));
        assertEquals("RATE_LIMIT_UNAVAILABLE", json.readTree(response.getContentAsByteArray()).at("/error/code").asText());
    }

    @Test
    void duplicateJsonIsRejectedWithoutPassingBodyToController() throws Exception {
        var request = request("5", "POST", "{\"confirmacao\":\"REEMITIR\",\"confirmacao\":\"OUTRA\"}");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        access.doFilter(request, response, chain);

        assertNull(chain.getRequest());
        assertNull(request.getAttribute("publicAccessBody"));
        assertEquals(400, response.getStatus());
        assertEquals("BAD_REQUEST", json.readTree(response.getContentAsByteArray()).at("/error/code").asText());
    }

    @Test
    void reissueRequiresEditCapabilityAndPassesAuthorizedContext() throws Exception {
        var context = new PublicEmployeeAuthorization.Context(7, "funcionario.editar", List.of(20L), null, null, null);
        when(authorization.authorize(admin, "funcionario.editar", 5L, null)).thenReturn(context);
        var request = request("5", "POST", "{}");
        var chain = new MockFilterChain();

        employees.doFilter(request, new MockHttpServletResponse(), chain);

        assertSame(request, chain.getRequest());
        assertSame(context, request.getAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE));
        verify(authorization).authorize(admin, "funcionario.editar", 5L, null);
    }

    @Test
    void deniedEditCapabilityCannotReachController() throws Exception {
        when(authorization.authorize(admin, "funcionario.editar", 5L, null))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN));
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        employees.doFilter(request("5", "POST", "{}"), response, chain);

        assertNull(chain.getRequest());
        assertEquals(403, response.getStatus());
    }

    @ParameterizedTest
    @ValueSource(strings = {"+5", "005"})
    void reissueRejectsAliasesBeforeAuthorization(String id) throws Exception {
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        employees.doFilter(request(id, "POST", "{}"), response, chain);

        assertNull(chain.getRequest());
        assertEquals(422, response.getStatus());
        verifyNoInteractions(authorization);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PATCH", "PUT", "DELETE"})
    void reissueRejectsOtherMethodsBeforeAuthorization(String method) throws Exception {
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        employees.doFilter(request("5", method, "{}"), response, chain);

        assertNull(chain.getRequest());
        assertEquals(403, response.getStatus());
        verifyNoInteractions(authorization);
    }
}
