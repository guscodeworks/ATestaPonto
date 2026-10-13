package br.com.atestaponto.punch.service;

public class PunchException extends RuntimeException {
    private final int status;
    private final String code;

    public PunchException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }
}
