-- Compatibiliza bancos locais criados antes da introdução de vínculos
-- funcionais. Não altera funcionários, unidades ou registros existentes.
CREATE TABLE IF NOT EXISTS vinculos_funcionais (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  funcionario_id BIGINT UNSIGNED NOT NULL,
  unidade_escolar_id INT NOT NULL,
  cargo_id BIGINT UNSIGNED NOT NULL,
  matricula VARCHAR(50) DEFAULT NULL,
  horario_entrada TIME NOT NULL,
  horario_saida_almoco TIME NOT NULL,
  horario_volta_almoco TIME NOT NULL,
  horario_saida TIME NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE DEFAULT NULL,
  status ENUM('ATIVO', 'AFASTADO', 'ENCERRADO') NOT NULL DEFAULT 'ATIVO',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vinculos_unidade_matricula (unidade_escolar_id, matricula),
  KEY idx_vinculos_funcionario (funcionario_id),
  KEY idx_vinculos_unidade_escolar (unidade_escolar_id),
  KEY idx_vinculos_cargo (cargo_id),
  KEY idx_vinculos_status (status),
  CONSTRAINT fk_vinculos_cargo FOREIGN KEY (cargo_id)
    REFERENCES cargos (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vinculos_funcionario FOREIGN KEY (funcionario_id)
    REFERENCES funcionarios (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vinculos_unidade_escolar FOREIGN KEY (unidade_escolar_id)
    REFERENCES unidades_escolares (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_vinculos_periodo CHECK (data_fim IS NULL OR data_fim >= data_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
