package br.com.atestaponto.service;

import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Service;

@Service
public class ReadinessService {
    private final DatabaseHealthService database;
    private final RedisConnectionFactory redis;

    public ReadinessService(DatabaseHealthService database, RedisConnectionFactory redis) {
        this.database = database;
        this.redis = redis;
    }

    public boolean isReady() {
        if (!database.isConnected()) return false;
        try (var connection = redis.getConnection()) {
            return "PONG".equals(connection.ping());
        } catch (DataAccessException exception) {
            return false;
        }
    }
}
