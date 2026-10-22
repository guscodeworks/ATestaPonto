package br.com.atestaponto.auth.admin.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.AdminPageAuthorization;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminPagesController {
    private final AdminPageAuthorization authorization;

    public AdminPagesController(AdminPageAuthorization authorization) {
        this.authorization = authorization;
    }

    @GetMapping({"/admin", "/admin/", "/admin/index", "/admin/index/", "/admin/index.html", "/admin/index.html/"})
    public void index(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin,
            HttpServletResponse response) throws IOException {
        authorization.require(admin, null);
        response.sendRedirect("/admin/dashboard");
    }

    @GetMapping({"/admin/dashboard", "/admin/dashboard/"})
    public ResponseEntity<Resource> dashboard(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "dashboard.html", null);
    }

    @GetMapping({"/admin/diretorias", "/admin/diretorias/"})
    public ResponseEntity<Resource> departments(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "departments.html", "diretoria.gerenciar");
    }

    @GetMapping({"/admin/escolas", "/admin/escolas/"})
    public ResponseEntity<Resource> schools(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "schools.html", "escola.listar");
    }

    @GetMapping({"/admin/escolas/nova", "/admin/escolas/nova/"})
    public ResponseEntity<Resource> registerSchool(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "register-school.html", "escola.criar");
    }

    @GetMapping({"/admin/funcionario", "/admin/funcionario/", "/admin/funcionarios", "/admin/funcionarios/"})
    public ResponseEntity<Resource> employees(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "employees.html", "funcionario.listar");
    }

    @GetMapping({"/admin/funcionarios/novo", "/admin/funcionarios/novo/"})
    public ResponseEntity<Resource> registerEmployee(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "register-employee.html", "funcionario.criar");
    }

    @GetMapping({"/admin/registrar-funcionario", "/admin/registrar-funcionario/",
            "/admin/registrar-funcionario.html", "/admin/registrar-funcionario.html/"})
    public void legacyRegisterEmployee(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin,
            HttpServletResponse response) throws IOException {
        authorization.require(admin, "funcionario.criar");
        response.sendRedirect("/admin/funcionarios/novo");
    }

    @GetMapping({"/admin/pontos", "/admin/pontos/", "/admin/pontos-do-dia", "/admin/pontos-do-dia/"})
    public ResponseEntity<Resource> points(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "daily-points.html", "ponto.hoje.visualizar");
    }

    @GetMapping({"/admin/relatorios", "/admin/relatorios/"})
    public ResponseEntity<Resource> reports(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "reports.html", "relatorio.hierarquico.visualizar");
    }

    @GetMapping({"/admin/configuracoes", "/admin/configuracoes/"})
    public ResponseEntity<Resource> settings(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin) {
        return page(admin, "settings.html", null);
    }

    @GetMapping({"/admin/login.html", "/admin/login.html/"})
    public void legacyLogin(HttpServletResponse response) throws IOException {
        response.sendRedirect("/admin/login");
    }

    @GetMapping({"/admin/dashboard.html", "/admin/dashboard.html/",
            "/admin/funcionario.html", "/admin/funcionario.html/",
            "/admin/funcionarios.html", "/admin/funcionarios.html/",
            "/admin/funcionarios/novo.html", "/admin/funcionarios/novo.html/",
            "/admin/pontos.html", "/admin/pontos.html/", "/admin/pontos-do-dia.html", "/admin/pontos-do-dia.html/",
            "/admin/relatorios.html", "/admin/relatorios.html/", "/admin/configuracoes.html", "/admin/configuracoes.html/",
            "/admin/configuracao", "/admin/configuracao/", "/admin/configuracao.html", "/admin/configuracao.html/"})
    public void legacyHtml(@RequestAttribute(value = "adminContext", required = false) AdminContextResponse admin,
            HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getServletPath();
        String target = path.startsWith("/admin/configuracao") && !path.startsWith("/admin/configuracoes")
                ? "/admin/configuracoes" : path.substring(0, path.lastIndexOf(".html"));
        String capability = switch (target) {
            case "/admin/dashboard", "/admin/configuracoes" -> null;
            case "/admin/funcionario", "/admin/funcionarios" -> "funcionario.listar";
            case "/admin/funcionarios/novo" -> "funcionario.criar";
            case "/admin/pontos", "/admin/pontos-do-dia" -> "ponto.hoje.visualizar";
            case "/admin/relatorios" -> "relatorio.hierarquico.visualizar";
            default -> throw new IllegalArgumentException("Alias administrativo invalido");
        };
        authorization.require(admin, capability);
        response.sendRedirect(target);
    }

    private ResponseEntity<Resource> page(AdminContextResponse admin, String file, String capability) {
        authorization.require(admin, capability);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(new MediaType("text", "html", java.nio.charset.StandardCharsets.UTF_8))
                .body(new ClassPathResource("admin-pages/" + file));
    }
}
