package br.com.atestaponto.controller;

import br.com.atestaponto.service.DatabaseHealthService;
import br.com.atestaponto.service.ReadinessService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final DatabaseHealthService databaseHealthService;
    private final ReadinessService readiness;
    private final boolean redisEnabled;

    public HealthController(DatabaseHealthService databaseHealthService, ReadinessService readiness,
            @Value("${REDIS_ENABLED:false}") boolean redisEnabled) {
        this.databaseHealthService = databaseHealthService;
        this.readiness = readiness;
        this.redisEnabled = redisEnabled;
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        boolean connected = databaseHealthService.isConnected();
        String redis = !redisEnabled ? "disabled" : readiness.isRedisConnected() ? "connected" : "unavailable";
        boolean healthy = connected && !redis.equals("unavailable");
        Map<String, Object> data = Map.of("status", healthy ? "ok" : "unhealthy",
                "database", connected ? "connected" : "unavailable", "redis", redis);
        return ResponseEntity.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .body(healthy ? Map.of("success", true, "data", data)
                        : Map.of("success", false, "data", data, "error", Map.of(
                                "code", connected ? "REDIS_UNAVAILABLE" : "DATABASE_UNAVAILABLE",
                                "message", connected ? "Redis indisponivel." : "Banco de dados indisponivel.")));
    }
}
