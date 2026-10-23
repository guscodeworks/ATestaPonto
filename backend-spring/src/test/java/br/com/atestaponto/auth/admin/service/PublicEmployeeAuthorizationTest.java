package br.com.atestaponto.auth.admin.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import br.com.atestaponto.employmentlink.service.EmploymentLinkReadService;
import br.com.atestaponto.school.dto.SchoolScopeResponse;
import br.com.atestaponto.school.service.SchoolService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/** Teste unitario da autorizacao territorial; escolas e vinculos vem de mocks, nao do MySQL. */
class PublicEmployeeAuthorizationTest {

    private final SchoolService schools = mock(SchoolService.class);
    private final EmploymentLinkReadService links = mock(EmploymentLinkReadService.class);
    private final PublicEmployeeAuthorization authorization = new PublicEmployeeAuthorization(schools, links);

    private static SchoolScopeResponse school(long id, long departmentId) {
        return new SchoolScopeResponse(id, departmentId, "Escola " + id, null, null, 100, true, null, null, null, null, null);
    }

    private static AdminContextResponse admin(String profile, Long departmentId, Long schoolId) {
        return new AdminContextResponse(new AdminContextResponse.Admin(7, "Admin Teste", "admin@example.test", true, null, null, null),
                List.of(new Access(1, 7, profile, departmentId, schoolId, "ATIVO", null, null, null, null, null)));
    }

    private void assertForbidden(Runnable call) {
        assertEquals(403, assertThrows(ResponseStatusException.class, call::run).getStatusCode().value());
    }

    @BeforeEach
    void scope() {
        when(schools.findForScope(20L)).thenReturn(school(20, 10));
        when(schools.findForScope(30L)).thenReturn(school(30, 11));
        when(schools.listForScope(10L)).thenReturn(List.of(school(20, 10), school(21, 10)));
    }

    @Test
    void schoolProfileReachesOnlyEmployeesOfItsSchool() {
        when(links.findActiveByEmployeeId(5L)).thenReturn(Optional.of(new EmploymentLinkScopeResponse(50, 20, 10L)));
        when(links.findActiveByEmployeeId(6L)).thenReturn(Optional.of(new EmploymentLinkScopeResponse(60, 30, 11L)));
        assertEquals(50, authorization.authorize(admin("DIRETOR", null, 20L), "funcionario.editar", 5L, null).link().id());
        assertForbidden(() -> authorization.authorize(admin("DIRETOR", null, 20L), "funcionario.editar", 6L, null));
    }

    @Test
    void departmentProfileIsLimitedToSchoolsOfItsDepartment() {
        assertEquals(List.of(20L, 21L), authorization.authorize(admin("ADMIN_DIRETORIA", 10L, null), "funcionario.listar", null, null).schoolIds());
        assertForbidden(() -> authorization.authorize(admin("ADMIN_DIRETORIA", 10L, null), "funcionario.editar", null, 30L));
    }

    @Test
    void deniesMissingEmployeeLinkOrCapability() {
        when(links.findActiveByEmployeeId(9L)).thenReturn(Optional.empty());
        assertForbidden(() -> authorization.authorize(admin("DIRETOR", null, 20L), "funcionario.editar", 9L, null));
        assertForbidden(() -> authorization.authorize(admin("COORDENADOR", null, 20L), "funcionario.editar", null, null));
        assertForbidden(() -> authorization.authorize(admin("ADMIN_SEDUC", null, null), "funcionario.listar", null, null));
    }
}
