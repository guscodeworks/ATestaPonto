package br.com.atestaponto.schoolqr.service;

import br.com.atestaponto.adminaccess.service.AdminAccessException;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import br.com.atestaponto.auth.admin.service.AdminAccessPolicy;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.schoolqr.dto.SchoolQrResponse;
import com.fasterxml.jackson.databind.node.LongNode;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicSchoolQrService {
    private final SchoolQrService qr;
    private final PublicAdminAuthorization admins;
    public PublicSchoolQrService(SchoolQrService qr, PublicAdminAuthorization admins) {
        this.qr = qr; this.admins = admins;
    }

    @Transactional(readOnly = true)
    public SchoolQrResponse.Current current(long adminId, String baseUrl) {
        var access = authorize(admins.requireActive(adminId), "qr.visualizar");
        return new SchoolQrResponse.Current(qr.current(LongNode.valueOf(access.unidade_escolar_id()), baseUrl));
    }

    @Transactional
    public SchoolQrResponse.Current generate(long adminId, String baseUrl, String ip) {
        // Mantem os locks da identidade e acessos ate a publicacao atomica do QR no Redis.
        var access = authorize(admins.requireActiveForUpdate(adminId), "qr.gerar");
        var result = qr.generate(LongNode.valueOf(access.unidade_escolar_id()), baseUrl);
        // Redis nao participa do commit JDBC; audita assim que a geracao e confirmada.
        org.slf4j.LoggerFactory.getLogger(PublicSchoolQrService.class).info(
                "audit_evento evento=qr_code_escolar_gerado adminId={} ipOrigem={} unidade_escolar_id={} acesso_autorizador_id={}",
                adminId, ip, access.unidade_escolar_id(), access.id());
        return new SchoolQrResponse.Current(result);
    }

    private Access authorize(AdminContextResponse admin, String capability) {
        var candidates = admin.acessos().stream().filter(a -> AdminAccessPolicy.permits(a.perfil(), capability)
                && AdminAccessPolicy.SCHOOL_PROFILES.contains(a.perfil()) && a.unidade_escolar_id() != null && a.unidade_escolar_id() > 0)
                .sorted(Comparator.comparingLong(Access::id)).toList();
        if (candidates.isEmpty()) throw new AdminAccessException(403, "FORBIDDEN", "Capacidade administrativa insuficiente");
        var units = candidates.stream().map(Access::unidade_escolar_id).distinct().sorted().toList();
        if (units.size() != 1) throw new Ambiguous(units);
        return candidates.getFirst();
    }

    public static final class Ambiguous extends AdminAccessException {
        private final List<Long> units;
        private Ambiguous(List<Long> units) { super(409, "CONFLICT", "Operacao de QR ambigua: mais de uma unidade escolar elegivel"); this.units = units; }
        public Map<String, ?> details() { return Map.of("unidades_escolares_ids", units); }
    }
}
