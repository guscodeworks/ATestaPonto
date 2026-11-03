package br.com.atestaponto.service;

import br.com.atestaponto.repository.DatabaseHealthRepository;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

@Service
public class DatabaseHealthService {

    private final DatabaseHealthRepository repository;

    public DatabaseHealthService(DatabaseHealthRepository repository) {
        this.repository = repository;
    }

    public boolean isConnected() {
        try {
            return repository.selectOne();
        } catch (DataAccessException exception) {
            return false;
        }
    }
}
