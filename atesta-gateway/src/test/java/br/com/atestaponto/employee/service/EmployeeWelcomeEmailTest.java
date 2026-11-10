package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.net.SocketTimeoutException;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mock.env.MockEnvironment;

class EmployeeWelcomeEmailTest {
    private final JavaMailSenderImpl sender = mock(JavaMailSenderImpl.class);
    private final EmployeeWelcomeEmail mail = new EmployeeWelcomeEmail(sender, "access@example.test", "https://example.test/ponto/acessar");

    @Test
    void acceptanceMeansSmtpOnlyAndSendsTheGeneratedPassword() {
        assertEquals(Map.of("enviado", true, "estado", "aceito_smtp"), mail.send("Pessoa", "person@example.test", "temporary-test"));
        var message = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(message.capture());
        assertTrue(message.getValue().getText().contains("Senha temporária: temporary-test"));
        assertTrue(message.getValue().getText().contains("sete dias"));
    }

    @Test
    void disabledDoesNotAttemptDelivery() {
        var disabled = new EmployeeWelcomeEmail(new MockEnvironment().withProperty("MAIL_ENABLED", "false"));
        assertEquals("desativado", disabled.send("Pessoa", "person@example.test", "temporary-test").get("estado"));
        verifyNoInteractions(sender);
    }

    @Test
    void authenticationRejectionIsKnownFailure() {
        doThrow(new MailAuthenticationException("sensitive-server-message")).when(sender).send(any(SimpleMailMessage.class));
        assertEquals("falha", mail.send("Pessoa", "person@example.test", "temporary-test").get("estado"));
        verify(sender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void timeoutHasUnknownOutcomeAndIsNotRetried() {
        var message = new SimpleMailMessage();
        doThrow(new MailSendException("sensitive-server-message", new SocketTimeoutException(),
                Map.of(message, new SocketTimeoutException()))).when(sender).send(any(SimpleMailMessage.class));
        var result = mail.send("Pessoa", "person@example.test", "temporary-test");
        assertEquals("desconhecido", result.get("estado"));
        assertEquals(false, result.get("enviado"));
        assertFalse(result.toString().contains("temporary-test"));
        assertFalse(result.toString().contains("sensitive-server-message"));
        verify(sender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void explicitSmtpRejectionIsKnownFailure() {
        var rejection = new org.eclipse.angus.mail.smtp.SMTPSendFailedException("DATA", 554, "Rejected", null, null, null, null);
        doThrow(new MailSendException(Map.of(new SimpleMailMessage(), rejection)))
                .when(sender).send(any(SimpleMailMessage.class));
        assertEquals("falha", mail.send("Pessoa", "person@example.test", "temporary-test").get("estado"));
    }
}
