package br.com.atestaponto.auth.admin.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
        when(schools.findForScopeInWriteTransaction(20L)).thenReturn(school(20, 10));
        when(schools.findForScopeInWriteTransaction(30L)).thenReturn(school(30, 11));
        when(schools.listForScopeInWriteTransaction(10L)).thenReturn(List.of(school(20, 10), school(21, 10)));
    }

    private void verifyNoReadOnlyQueries() {
        verify(schools, never()).findForScope(anyLong());
        verify(schools, never()).listForScope(anyLong());
        verify(links, never()).findActiveByEmployeeId(anyLong());
        verify(links, never()).findVisibleForAdminByEmployeeId(anyLong());
        verify(links, never()).findLatestByEmployeeId(anyLong());
    }

    @Test
    void readAuthorizationKeepsReadOnlyQueries() {
        when(links.findActiveByEmployeeId(5L)).thenReturn(Optional.of(new EmploymentLinkScopeResponse(50, 20, 10L)));
        authorization.authorize(admin("ADMIN_DIRETORIA", 10L, null), "funcionario.editar", 5L, 20L);
        verify(schools, never()).findForScopeInWriteTransaction(anyLong());
        verify(schools, never()).listForScopeInWriteTransaction(anyLong());
        verify(links, never()).findActiveByEmployeeIdInWriteTransaction(anyLong());
    }

    @Test
    void writeRevalidationUsesWriteTransactionQueries() {
        when(links.findActiveByEmployeeIdInWriteTransaction(5L))
                .thenReturn(Optional.of(new EmploymentLinkScopeResponse(50, 20, 10L)));
        var context = authorization.authorizeInWriteTransaction(admin("ADMIN_DIRETORIA", 10L, null),
                "funcionario.editar", 5L, 20L);
        assertEquals(List.of(20L, 21L), context.schoolIds());
        assertEquals(10L, context.targetDepartmentId());
        assertEquals(50, context.link().id());
        assertEquals(20, authorization.authorizeInWriteTransaction(admin("DIRETOR", null, 20L),
                "funcionario.desativar", 5L, null).link().unidade_escolar_id());
        verifyNoReadOnlyQueries();
    }

    @Test
    void writeRevalidationKeepsLinkSelectionPerCapability() {
        when(links.findLatestByEmployeeIdInWriteTransaction(5L))
                .thenReturn(Optional.of(new EmploymentLinkScopeResponse(51, 20, 10L)));
        when(links.findVisibleForAdminByEmployeeIdInWriteTransaction(5L))
                .thenReturn(Optional.of(new EmploymentLinkScopeResponse(52, 20, 10L)));
        var admin = admin("DIRETOR", null, 20L);
        assertEquals(51, authorization.authorizeInWriteTransaction(admin, "funcionario.reativar", 5L, null).link().id());
        assertEquals(52, authorization.authorizeInWriteTransaction(admin, "funcionario.visualizar", 5L, null).link().id());
        verify(links, never()).findActiveByEmployeeIdInWriteTransaction(anyLong());
        verifyNoReadOnlyQueries();
    }

    @Test
    void writeRevalidationDeniesOutOfScope() {
        when(links.findActiveByEmployeeIdInWriteTransaction(6L))
                .thenReturn(Optional.of(new EmploymentLinkScopeResponse(60, 30, 11L)));
        when(links.findActiveByEmployeeIdInWriteTransaction(9L)).thenReturn(Optional.empty());
        assertForbidden(() -> authorization.authorizeInWriteTransaction(admin("DIRETOR", null, 20L), "funcionario.editar", 6L, null));
        assertForbidden(() -> authorization.authorizeInWriteTransaction(admin("DIRETOR", null, 20L), "funcionario.editar", 9L, null));
        assertForbidden(() -> authorization.authorizeInWriteTransaction(admin("ADMIN_DIRETORIA", 10L, null), "funcionario.criar", null, 30L));
        assertForbidden(() -> authorization.authorizeInWriteTransaction(admin("COORDENADOR", null, 20L), "funcionario.editar", null, null));
        verifyNoReadOnlyQueries();
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
