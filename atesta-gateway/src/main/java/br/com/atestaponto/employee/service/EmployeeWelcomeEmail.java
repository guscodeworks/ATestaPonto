package br.com.atestaponto.employee.service;

import java.net.URI;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.stereotype.Service;

@Service
public class EmployeeWelcomeEmail {
    private static final Logger LOG = LoggerFactory.getLogger(EmployeeWelcomeEmail.class);
    private final JavaMailSenderImpl sender;
    private final String from, loginUrl;

    @Autowired
    public EmployeeWelcomeEmail(Environment env) {
        boolean enabled = env.getProperty("MAIL_ENABLED", Boolean.class,
                "production".equals(env.getProperty("NODE_ENV")));
        if (!enabled) {
            sender = null;
            from = loginUrl = null;
            return;
        }
        sender = new JavaMailSenderImpl();
        sender.setHost(env.getRequiredProperty("SMTP_HOST"));
        sender.setPort(env.getRequiredProperty("SMTP_PORT", Integer.class));
        sender.setUsername(env.getRequiredProperty("SMTP_USER"));
        sender.setPassword(env.getRequiredProperty("SMTP_PASS"));
        sender.setDefaultEncoding("UTF-8");
        boolean secure = env.getProperty("SMTP_SECURE", Boolean.class, false);
        var properties = sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.auth", "true");
        properties.setProperty("mail.smtp.ssl.enable", String.valueOf(secure));
        properties.setProperty("mail.smtp.starttls.enable", String.valueOf(!secure));
        properties.setProperty("mail.smtp.connectiontimeout", "3000");
        properties.setProperty("mail.smtp.timeout", "5000");
        properties.setProperty("mail.smtp.writetimeout", "5000");
        from = env.getRequiredProperty("MAIL_FROM");
        URI base = URI.create(env.getRequiredProperty("APP_BASE_URL"));
        if (base.getHost() == null || base.getUserInfo() != null
                || !("https".equals(base.getScheme()) || "http".equals(base.getScheme()))) {
            throw new IllegalArgumentException("APP_BASE_URL invalida");
        }
        loginUrl = base.resolve("/ponto/acessar").toString();
    }

    EmployeeWelcomeEmail(JavaMailSenderImpl sender, String from, String loginUrl) {
        this.sender = sender;
        this.from = from;
        this.loginUrl = loginUrl;
    }

    public void sendRecovery(String name, String email, String code) {
        if (sender == null) return;
        try {
            var message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(email);
            message.setSubject("Código para redefinir sua senha - ATesta Ponto");
            message.setText("Olá, " + name + "!\n\nSeu código para redefinir a senha é: " + code
                    + "\n\nEle vence em 15 minutos. Se você não solicitou esta alteração, ignore este e-mail.");
            sender.send(message);
        } catch (RuntimeException failure) {
            LOG.error("Falha ao enviar código de recuperação de senha");
        }
    }

    public Map<String, Object> send(String name, String email, String password) {
        if (sender == null) return Map.of("enviado", false, "motivo", "desativado", "estado", "desativado");
        try {
            var message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(email);
            message.setSubject("Acesso ao Atesta Ponto");
            message.setText("Olá, " + name + "!\n\nSeu acesso ao Atesta Ponto foi criado.\nLogin: "
                    + email + "\nSenha temporária: " + password + "\n\nAcesse: " + loginUrl
                    + "\nEsta senha vence em sete dias. Por segurança, altere sua senha no primeiro acesso.");
            sender.send(message);
            return Map.of("enviado", true, "estado", "aceito_smtp");
        } catch (RuntimeException failure) {
            // Excecoes SMTP podem conter destinatario, corpo e credenciais.
            LOG.error("Falha ao enviar e-mail de acesso ao funcionario");
            return Map.of("enviado", false, "motivo", "falha_no_envio", "estado", deliveryFailure(failure));
        }
    }

    private static String deliveryFailure(Throwable failure) {
        if (failure instanceof MailAuthenticationException || failure instanceof MailParseException) return "falha";
        if (failure instanceof org.springframework.mail.MailSendException sent && !sent.getFailedMessages().isEmpty()) {
            return sent.getFailedMessages().values().stream()
                    .allMatch(error -> "falha".equals(deliveryFailure(error))) ? "falha" : "desconhecido";
        }
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof java.net.ConnectException || cause instanceof java.net.UnknownHostException
                    || cause instanceof jakarta.mail.AuthenticationFailedException) return "falha";
            if (cause instanceof org.eclipse.angus.mail.smtp.SMTPSendFailedException rejected
                    && rejected.getReturnCode() >= 400 && rejected.getReturnCode() < 600) return "falha";
            if (cause instanceof jakarta.mail.SendFailedException rejected
                    && rejected.getInvalidAddresses() != null && rejected.getInvalidAddresses().length > 0
                    && (rejected.getValidSentAddresses() == null || rejected.getValidSentAddresses().length == 0)) return "falha";
        }
        // Sem rejeicao comprovada, inclusive timeout, o servidor pode ter aceitado a mensagem.
        return "desconhecido";
    }
}
