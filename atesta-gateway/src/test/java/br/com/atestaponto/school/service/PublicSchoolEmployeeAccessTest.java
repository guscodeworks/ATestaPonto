package br.com.atestaponto.school.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicSchoolAuthorization;
import br.com.atestaponto.school.dto.SchoolListResponse;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PublicSchoolEmployeeAccessTest {
    private final PublicAdminAuthorization admins = mock(PublicAdminAuthorization.class);
    private final SchoolService schools = mock(SchoolService.class);
    private final PublicSchoolService service = new PublicSchoolService(
            schools, null, null, new PublicSchoolAuthorization(admins, schools), null, null);

    private void admin(String profile, Long schoolId) {
        var access = new Access(1, 7, profile, 3L, schoolId, "ATIVO", null, null, null, null, null);
        when(admins.requireActive(7)).thenReturn(new AdminContextResponse(
                new AdminContextResponse.Admin(7, "A", "a@b.c", true, null, null, null), List.of(access)));
    }

    private void school(long id) {
        when(schools.findForAdmin(id)).thenReturn(new SchoolListResponse.Item(id, 3, "DRE", "Escola X", null, null,
                null, BigDecimal.ZERO, BigDecimal.ZERO, 100, true, null, null));
    }

    @Test
    void ownSchoolReturnsNameAndUrlWithoutToken() {
        admin("DIRETOR", 10L);
        school(10);
        var result = service.employeeAccess(7, "10", "https://ponto.exemplo/", "10.0.0.1");
        assertEquals("Escola X", result.get("escola_nome"));
        assertEquals("https://ponto.exemplo/ponto/acessar", result.get("url"));
    }

    @Test
    void otherSchoolIsForbidden() {
        admin("DIRETOR", 10L);
        school(11);
        var error = assertThrows(ResponseStatusException.class,
                () -> service.employeeAccess(7, "11", "https://ponto.exemplo/", "10.0.0.1"));
        assertEquals(403, error.getStatusCode().value());
    }
}
