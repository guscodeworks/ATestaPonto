package br.com.atestaponto.adminaccess.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.adminaccess.dto.AdminAccessRequest;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.Access;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.Resource;
import br.com.atestaponto.adminaccess.repository.AdminAccessRepository;
import br.com.atestaponto.adminaccess.repository.AdminAccessRepository.Authorizer;
import org.junit.jupiter.api.Test;

/** Teste unitario: repositorio mockado; regras reais de concessao do AdminAccessService, sem MySQL. */
class AdminAccessServiceTest {
    private static final String CPF = "52998224725";
    private final AdminAccessRepository repository = mock(AdminAccessRepository.class);
    private final AdminAccessService service = new AdminAccessService(repository);
    private final AdminAccessRequest.Grant request = new AdminAccessRequest.Grant(7L, 10L, CPF, null, null, "SECRETARIA",
            null, 5L, "ATIVO", null, null);

    AdminAccessServiceTest() {
        when(repository.lockAuthorizer(10, 7)).thenReturn(new Authorizer(10, "DIRETOR", null, 5L));
        when(repository.school(5L, true)).thenReturn(new Resource(3L, 5L));
    }

    @Test
    void selfGrantIsForbiddenAndDoesNotWrite() {
        when(repository.findActiveUser(CPF)).thenReturn(7L);
        var error = assertThrows(AdminAccessException.class, () -> service.grant(request));
        assertEquals(403, error.status());
        assertEquals("FORBIDDEN", error.code());
        verify(repository, never()).createUser(anyString(), any(), any());
        verify(repository, never()).grant(anyLong(), any());
    }

    @Test
    void legitimateGrantToAnotherUserIsAllowed() {
        var access = mock(Access.class);
        when(repository.findActiveUser(CPF)).thenReturn(8L);
        when(repository.grant(8L, request)).thenReturn(99L);
        when(repository.find(99L, false)).thenReturn(access);
        var granted = service.grant(request);
        assertEquals(access, granted.acesso());
        assertFalse(granted.criou_identidade());
        verify(repository).grant(8L, request);
    }
}
