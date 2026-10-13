package br.com.atestaponto.adminaccess.dto;

import br.com.atestaponto.auth.admin.dto.AdminIdDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;

public final class AdminAccessRequest {
    private AdminAccessRequest() {}
    public record Id(@NotNull @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long id) {}
    public record ListQuery(@NotNull Boolean global,
            @NotNull @JsonDeserialize(contentUsing = AdminIdDeserializer.class) List<@NotNull @Positive Long> diretorias,
            @NotNull @JsonDeserialize(contentUsing = AdminIdDeserializer.class) List<@NotNull @Positive Long> unidades,
            @NotNull @Min(1) @Max(100) @JsonDeserialize(using = AdminIdDeserializer.class) Long limit,
            @NotNull @Min(0) @JsonDeserialize(using = AdminIdDeserializer.class) Long offset) {}
    public record ResourceQuery(@NotBlank String perfil,
            @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long diretoriaId,
            @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long unidadeId) {}
    public record Options(@NotNull Boolean diretorias, @NotNull Boolean unidades) {}
    public record Grant(
            @NotNull @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long adminId,
            @NotNull @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long acessoAutorizadorId,
            @NotBlank @Pattern(regexp = "[0-9]{11}") String cpf,
            @Size(min = 3, max = 150) String nome, @Email @Size(max = 150) String email,
            @NotBlank String perfil,
            @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long diretoriaId,
            @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long unidadeId,
            @NotNull @Pattern(regexp = "ATIVO|SUSPENSO") String status,
            LocalDate dataInicio, LocalDate dataFim) {}
    public record Change(
            @NotNull @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long adminId,
            @NotNull @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long acessoAutorizadorId,
            @NotNull @Positive @JsonDeserialize(using = AdminIdDeserializer.class) Long acessoId,
            @NotNull @Pattern(regexp = "suspender|reativar|revogar") String acao,
            @NotNull @Pattern(regexp = "ATIVO|SUSPENSO|REVOGADO|PENDENTE") String statusAtual) {}
}
