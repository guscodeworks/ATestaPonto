package br.com.atestaponto.auth.admin.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.Resource;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import java.util.List;
import org.junit.jupiter.api.Test;

class AdminAccessPolicyTest {

    private static Access access(long id, String profile, Long departmentId, Long schoolId) {
        return new Access(id, 1, profile, departmentId, schoolId, "ATIVO", null, null, null, null, null);
    }

    @Test
    void unknownOrMissingProfileHasNoCapability() {
        assertFalse(AdminAccessPolicy.permits(null, "escola.listar"));
        assertFalse(AdminAccessPolicy.permits("", "escola.listar"));
        assertFalse(AdminAccessPolicy.permits("ROOT", "escola.listar"));
    }

    @Test
    void seducDoesNotManageEmployees() {
        assertFalse(AdminAccessPolicy.permits("ADMIN_SEDUC", "funcionario.criar"));
        assertFalse(AdminAccessPolicy.permits("ADMIN_SEDUC", "funcionario.editar"));
        assertTrue(AdminAccessPolicy.permits("ADMIN_SEDUC", "diretoria.gerenciar"));
    }

    @Test
    void coordinatorCannotCreateOrEditEmployees() {
        assertFalse(AdminAccessPolicy.permits("COORDENADOR", "funcionario.criar"));
        assertFalse(AdminAccessPolicy.permits("COORDENADOR", "funcionario.editar"));
    }

    @Test
    void scopeWithoutTerritoryDoesNotCover() {
        var resource = new Resource(10L, 20L);
        assertFalse(AdminAccessPolicy.covers(access(1, "ADMIN_DIRETORIA", null, null), resource));
        assertFalse(AdminAccessPolicy.covers(access(1, "DIRETOR", 10L, null), resource));
        assertFalse(AdminAccessPolicy.covers(access(1, "DIRETOR", 10L, 21L), resource));
        assertFalse(AdminAccessPolicy.covers(access(1, "ADMIN_DIRETORIA", 11L, null), resource));
        assertTrue(AdminAccessPolicy.covers(access(1, "ADMIN_DIRETORIA", 10L, null), resource));
        assertTrue(AdminAccessPolicy.covers(access(1, "DIRETOR", null, 20L), resource));
    }

    @Test
    void globalAccessCoversAnyResource() {
        assertTrue(AdminAccessPolicy.covers(access(1, "ADMIN_SEDUC", null, null), new Resource(10L, 20L)));
        assertTrue(AdminAccessPolicy.covers("ADMIN_SEDUC", null, null, new Resource(null, null)));
    }

    @Test
    void departmentAccessCoversOnlyItsDepartment() {
        assertTrue(AdminAccessPolicy.covers("ADMIN_DIRETORIA", 10L, null, new Resource(10L, null)));
        assertTrue(AdminAccessPolicy.covers("ADMIN_DIRETORIA", 10L, null, new Resource(10L, 20L)));
        assertFalse(AdminAccessPolicy.covers("ADMIN_DIRETORIA", 10L, null, new Resource(11L, 20L)));
        assertFalse(AdminAccessPolicy.covers("ADMIN_DIRETORIA", 10L, null, new Resource(null, null)));
        // Diretoria nao herda cobertura por unidade.
        assertFalse(AdminAccessPolicy.covers("ADMIN_DIRETORIA", null, 20L, new Resource(10L, 20L)));
    }

    @Test
    void schoolAccessCoversOnlyItsSchool() {
        for (String profile : AdminAccessPolicy.SCHOOL_PROFILES) {
            assertTrue(AdminAccessPolicy.covers(profile, 10L, 20L, new Resource(10L, 20L)));
            assertFalse(AdminAccessPolicy.covers(profile, 10L, 20L, new Resource(10L, 21L)));
            // Escola nao herda cobertura da diretoria.
            assertFalse(AdminAccessPolicy.covers(profile, 10L, 20L, new Resource(10L, null)));
        }
    }

    @Test
    void invalidProfilesDoNotCover() {
        var resource = new Resource(10L, 20L);
        assertFalse(AdminAccessPolicy.covers(null, 10L, 20L, resource));
        assertFalse(AdminAccessPolicy.covers("", 10L, 20L, resource));
        assertFalse(AdminAccessPolicy.covers("ROOT", 10L, 20L, resource));
        assertFalse(AdminAccessPolicy.covers("admin_seduc", 10L, 20L, resource));
    }

    @Test
    void missingScopesDoNotCover() {
        assertFalse(AdminAccessPolicy.covers("ADMIN_DIRETORIA", null, null, new Resource(null, null)));
        assertFalse(AdminAccessPolicy.covers("DIRETOR", null, null, new Resource(null, null)));
        assertFalse(AdminAccessPolicy.covers("DIRETOR", null, null, new Resource(10L, 20L)));
        assertFalse(AdminAccessPolicy.covers("SECRETARIA", 10L, null, new Resource(10L, 20L)));
    }

    @Test
    void delegationIsLimitedByProfile() {
        assertFalse(AdminAccessPolicy.delegates("DIRETOR", "DIRETOR", true));
        assertFalse(AdminAccessPolicy.delegates("SECRETARIA", "COORDENADOR", true));
        assertFalse(AdminAccessPolicy.delegates("ADMIN_SEDUC", "DIRETOR", true));
        assertTrue(AdminAccessPolicy.delegates("ADMIN_SEDUC", "DIRETOR", false));
        assertTrue(AdminAccessPolicy.delegates("DIRETOR", "SECRETARIA", true));
    }

    @Test
    void authorizerPrefersMostSpecificScopeAndFailsClosed() {
        var resource = new Resource(10L, 20L);
        var department = access(1, "ADMIN_DIRETORIA", 10L, null);
        var school = access(2, "DIRETOR", 10L, 20L);
        var other = access(3, "DIRETOR", 10L, 99L);
        assertEquals(school, AdminAccessPolicy.authorizer(List.of(department, school), "acesso.conceder", "SECRETARIA", resource, true));
        assertNull(AdminAccessPolicy.authorizer(List.of(other), "acesso.conceder", "SECRETARIA", resource, true));
        assertNull(AdminAccessPolicy.authorizer(List.of(), "acesso.conceder", "SECRETARIA", resource, true));
    }
}
