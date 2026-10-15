package br.com.atestaponto.cargo.service;

import br.com.atestaponto.cargo.dto.CargoResponse;
import br.com.atestaponto.cargo.repository.CargoReadRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CargoReadService {
    private final CargoReadRepository repository;

    public CargoReadService(CargoReadRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<CargoResponse> list() {
        return repository.list();
    }
}
