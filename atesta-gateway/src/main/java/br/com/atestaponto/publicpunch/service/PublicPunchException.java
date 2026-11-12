package br.com.atestaponto.publicpunch.service;

public class PublicPunchException extends RuntimeException {
    private final int status;
    private final String code;
    private final Object details;
    public PublicPunchException(int status, String code, String message) { this(status, code, message, java.util.Map.of()); }
    public PublicPunchException(int status, String code, String message, Object details) {
        super(message); this.status = status; this.code = code; this.details = details;
    }
    public int status() { return status; }
    public String code() { return code; }
    public Object details() { return details; }
}
