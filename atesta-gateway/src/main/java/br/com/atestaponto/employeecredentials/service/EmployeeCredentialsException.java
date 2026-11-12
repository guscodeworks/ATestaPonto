package br.com.atestaponto.employeecredentials.service;

public class EmployeeCredentialsException extends RuntimeException {
    private final int status;
    private final String code;

    public EmployeeCredentialsException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }
}
