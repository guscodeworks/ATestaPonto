package br.com.atestaponto.schoolqr.dto;

public final class SchoolQrResponse {
    private SchoolQrResponse() {}
    public record Qr(long unidade_escolar_id, String url) {}
    public record Unit(long unidade_escolar_id) {}
    public record Current(Qr qrCode) {}
    public record Resolution(Unit unidade) {}
}
