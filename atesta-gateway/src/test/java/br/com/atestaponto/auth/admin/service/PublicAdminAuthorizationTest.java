package br.com.atestaponto.auth.admin.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

/** Teste unitario: AdminContextService e mockado; filtros de vigencia do SQL nao sao exercitados. */
class PublicAdminAuthorizationTest {

    private final AdminContextService admins = mock(AdminContextService.class);
    private final PublicAdminAuthorization authorization = new PublicAdminAuthorization(admins);

    private static AdminContextResponse context(boolean active, Access... accesses) {
        return new AdminContextResponse(new AdminContextResponse.Admin(7, "Admin Teste", "admin@example.test", active,
                null, null, null), List.of(accesses));
    }

    private static Access access(long ownerId, String profile, Long departmentId, Long schoolId, String status) {
        return new Access(1, ownerId, profile, departmentId, schoolId, status, null, null, null, null, null);
    }

    private void assertForbidden(AdminContextResponse context) {
        when(admins.readForUpdate(7)).thenReturn(context);
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> authorization.requireActiveForUpdate(7))
                .getStatusCode().value());
    }

    @Test
    void acceptsActiveConsistentAccess() {
        var context = context(true, access(7, "DIRETOR", null, 20L, "ATIVO"));
        when(admins.read(7L)).thenReturn(context);
        assertSame(context, authorization.requireActive(7));
    }

    @ParameterizedTest
    @ValueSource(strings = {"REVOGADO", "SUSPENSO", "EXPIRADO"})
    void rejectsNonActiveAccessEvenAmongValidOnes(String status) {
        assertForbidden(context(true, access(7, "DIRETOR", null, 20L, "ATIVO"), access(7, "SECRETARIA", null, 21L, status)));
    }

    @Test
    void rejectsInactiveAdminOrMissingAccesses() {
        assertForbidden(context(false, access(7, "DIRETOR", null, 20L, "ATIVO")));
        assertForbidden(context(true));
    }

    @Test
    void rejectsAccessOfAnotherAdminOrInconsistentScope() {
        assertForbidden(context(true, access(8, "DIRETOR", null, 20L, "ATIVO")));
        assertForbidden(context(true, access(7, "ADMIN_SEDUC", 10L, null, "ATIVO")));
        assertForbidden(context(true, access(7, "ADMIN_DIRETORIA", null, null, "ATIVO")));
        assertForbidden(context(true, access(7, "DIRETOR", 10L, 20L, "ATIVO")));
        assertForbidden(context(true, access(7, "ROOT", null, null, "ATIVO")));
    }
}
