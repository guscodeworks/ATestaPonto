package br.com.atestaponto.publicpunch.controller;

import br.com.atestaponto.publicpunch.service.EmployeeAccessSessions;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EmployeePagesController {
    private final EmployeeAccessSessions sessions;

    public EmployeePagesController(EmployeeAccessSessions sessions) { this.sessions = sessions; }

    @GetMapping({"/", "/login", "/login/"})
    public ResponseEntity<Resource> login(HttpServletRequest request, HttpServletResponse response) {
        sessions.clearQr(request, response);
        return page();
    }

    @GetMapping({"/home", "/home/", "/index.html", "/index.html/", "/home.html", "/home.html/"})
    public ResponseEntity<Void> home() { return ResponseEntity.status(302).location(URI.create("/")).build(); }

    @GetMapping({"/login.html", "/login.html/", "/funcionario/login", "/funcionario/login/",
            "/funcionario/login.html", "/funcionario/login.html/"})
    public ResponseEntity<Void> legacyLogin() {
        return ResponseEntity.status(302).location(URI.create("/login")).build();
    }

    @GetMapping({"/ponto", "/ponto/", "/bater-ponto", "/bater-ponto/"})
    public ResponseEntity<Void> shortcut() {
        return ResponseEntity.status(302).location(URI.create("/ponto/acessar")).build();
    }

    @GetMapping({"/ponto/acessar", "/ponto/acessar/"})
    public ResponseEntity<Resource> access(HttpServletRequest request, HttpServletResponse response) {
        sessions.establishQr(request, response);
        return page();
    }

    private ResponseEntity<Resource> page() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
                .body(new ClassPathResource("employee-pages/index.html"));
    }
}
