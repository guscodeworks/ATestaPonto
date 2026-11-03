package br.com.atestaponto.employeecredentials.dto;

public final class EmployeeCredentialsResponse {
    private EmployeeCredentialsResponse() {}

    public record Employee(long id, String nome, String email) {}
    public record Recovery(Employee employee) {}
    public record Change(boolean updated) {}
    public record AuthenticationEmployee(long id, String cpf, String nome, String email,
                                         boolean ativo, String senha_hash, Boolean primeiro_acesso) {
        @Override
        public String toString() { return "AuthenticationEmployee[redacted]"; }
    }
    public record Authentication(AuthenticationEmployee employee) {}
    public record ActiveLink(long id, long unidade_escolar_id) {}
    public record LoginLink(boolean modern, ActiveLink vinculo) {}
}
