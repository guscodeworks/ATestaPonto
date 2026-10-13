package br.com.atestaponto.employeecredentials.dto;

public final class EmployeeCredentialsResponse {
    private EmployeeCredentialsResponse() {}

    public record Employee(long id, String nome, String email) {}
    public record Recovery(Employee employee) {}
    public record Change(boolean updated) {}
}
