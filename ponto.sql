-- Secure schema for Ponto Escolar backend.
-- Run this script after selecting the target database.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_login_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admins_email (email),
  KEY idx_admins_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS funcionarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cpf CHAR(11) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  desativado_em DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_funcionarios_cpf (cpf),
  UNIQUE KEY uk_funcionarios_email (email),
  KEY idx_funcionarios_ativo (ativo),
  KEY idx_funcionarios_nome (nome),
  CONSTRAINT chk_funcionarios_cpf CHECK (cpf REGEXP '^[0-9]{11}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registro_de_pontos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  funcionario_id BIGINT UNSIGNED NOT NULL,
  qr_code_id BIGINT UNSIGNED NOT NULL,
  data_referencia DATE NOT NULL,
  sequencia TINYINT UNSIGNED NOT NULL,
  tipo ENUM('ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA') NOT NULL,
  registrado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  distancia_metros DECIMAL(10,2) NOT NULL,
  ip_origem VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ponto_unico (funcionario_id, data_referencia, sequencia),
  UNIQUE KEY uk_ponto_tipo_unico (funcionario_id, data_referencia, tipo),
  KEY idx_pontos_data_func_seq (data_referencia, funcionario_id, sequencia),
  KEY idx_pontos_tipo (tipo),
  KEY idx_pontos_qr_code (qr_code_id),
  CONSTRAINT chk_pontos_sequencia CHECK (sequencia BETWEEN 1 AND 4),
  CONSTRAINT chk_pontos_distancia CHECK (distancia_metros >= 0),
  CONSTRAINT fk_pontos_funcionario FOREIGN KEY (funcionario_id)
    REFERENCES funcionarios (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_pontos_qr_code FOREIGN KEY (qr_code_id)
    REFERENCES qr_codes (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evento VARCHAR(80) NOT NULL,
  nivel ENUM('INFO', 'WARN', 'ERROR') NOT NULL DEFAULT 'INFO',
  admin_id BIGINT UNSIGNED NULL,
  funcionario_id BIGINT UNSIGNED NULL,
  mensagem VARCHAR(255) NOT NULL,
  ip_origem VARCHAR(45) NULL,
  metadados_json JSON NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_evento_data (evento, criado_em),
  KEY idx_audit_nivel_data (nivel, criado_em),
  KEY idx_audit_admin (admin_id),
  KEY idx_audit_funcionario (funcionario_id),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_audit_funcionario FOREIGN KEY (funcionario_id)
    REFERENCES funcionarios (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
