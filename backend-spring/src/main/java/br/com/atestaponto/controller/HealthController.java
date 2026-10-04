package br.com.atestaponto.controller;

import br.com.atestaponto.service.DatabaseHealthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final DatabaseHealthService databaseHealthService;

    public HealthController(DatabaseHealthService databaseHealthService) {
        this.databaseHealthService = databaseHealthService;
    }

    @GetMapping("/health")
    public ResponseEntity<HealthResponse> health() {
        boolean connected = databaseHealthService.isConnected();
        HealthResponse response = new HealthResponse(
                connected ? "UP" : "DOWN",
                "backend-spring",
                connected ? "connected" : "unavailable");
        return ResponseEntity.status(connected ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .body(response);
    }

    public record HealthResponse(String status, String service, String database) {
    }
}
