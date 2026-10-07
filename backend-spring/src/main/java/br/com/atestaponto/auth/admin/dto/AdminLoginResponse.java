package br.com.atestaponto.auth.admin.dto;

public record AdminLoginResponse(Admin admin) {
    public record Admin(long id, String nome, String email, boolean ativo) {}
}
