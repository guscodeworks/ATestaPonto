-- Baseline estrutural canônico do Ponto Escolar.
--
-- Fonte: estrutura do dump ponto.sql de 2026-08-26, complementada pela tabela
-- ponto_idempotencia exigida pelo backend atual e pelas colunas de endereço/CEP
-- de unidades_escolares (migration 20261001_unidades_escolares_endereco.sql).
--
-- Este arquivo destina-se exclusivamente à criação de um banco vazio.
-- Não contém dados, credenciais ou comandos DROP/ALTER.
-- Schemas históricos chamados ponto.sql ou "ponto (2).sql" são incompatíveis
-- com a aplicação atual e não devem ser usados.

CREATE TABLE `diretorias_ensino` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(150) NOT NULL,
  `codigo` VARCHAR(50) NOT NULL,
  `cidade_sede` VARCHAR(100) NOT NULL DEFAULT 'Campinas',
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_diretorias_ensino_codigo` (`codigo`),
  UNIQUE KEY `uk_diretorias_ensino_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cargos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cargo` VARCHAR(80) NOT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cargos_cargo` (`cargo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `funcionarios` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cpf` CHAR(11) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `nome` VARCHAR(150) NOT NULL,
  `telefone` VARCHAR(20) DEFAULT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `desativado_em` DATETIME DEFAULT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `usuarios_administrativos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cpf` CHAR(11) NOT NULL,
  `nome` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `ultimo_login_em` DATETIME DEFAULT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_admin_cpf` (`cpf`),
  UNIQUE KEY `uq_usuarios_admin_email` (`email`),
  CONSTRAINT `chk_usuarios_admin_ativo` CHECK (`ativo` IN (0, 1)),
  CONSTRAINT `chk_usuarios_admin_cpf` CHECK (REGEXP_LIKE(`cpf`, '^[0-9]{11}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `unidades_escolares` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `diretoria_ensino_id` INT UNSIGNED NOT NULL,
  `nome` VARCHAR(150) NOT NULL,
  `latitude` DECIMAL(10,8) NOT NULL,
  `longitude` DECIMAL(11,8) NOT NULL,
  `raio_permitido_metros` INT NOT NULL DEFAULT 100,
  `ativa` TINYINT(1) NOT NULL DEFAULT 1,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `codigo_inep` VARCHAR(20) DEFAULT NULL,
  `endereco` VARCHAR(255) DEFAULT NULL,
  `cep` CHAR(8) DEFAULT NULL,
  `numero` VARCHAR(20) DEFAULT NULL,
  `bairro` VARCHAR(100) DEFAULT NULL,
  `cidade` VARCHAR(100) NOT NULL DEFAULT 'Campinas',
  `uf` CHAR(2) DEFAULT NULL,
  `cep_verificado` TINYINT(1) NOT NULL DEFAULT 0,
  `origem_coordenadas` ENUM('BRASILAPI','MANUAL') NOT NULL DEFAULT 'MANUAL',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_unidades_codigo_inep` (`codigo_inep`),
  KEY `idx_unidades_diretoria` (`diretoria_ensino_id`),
  CONSTRAINT `fk_unidades_diretoria` FOREIGN KEY (`diretoria_ensino_id`)
    REFERENCES `diretorias_ensino` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_unidade_latitude` CHECK (`latitude` BETWEEN -90 AND 90),
  CONSTRAINT `chk_unidade_longitude` CHECK (`longitude` BETWEEN -180 AND 180),
  CONSTRAINT `chk_unidade_raio` CHECK (`raio_permitido_metros` > 0),
  CONSTRAINT `chk_unidade_uf` CHECK (`uf` IS NULL OR CHAR_LENGTH(`uf`) = 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `login_funcionario` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `funcionario_id` BIGINT UNSIGNED NOT NULL,
  `senha_hash` VARCHAR(255) NOT NULL,
  `primeiro_acesso` TINYINT(1) NOT NULL DEFAULT 1,
  `senha_temporaria_expira_em` DATETIME DEFAULT NULL,
  `senha_alterada_em` DATETIME DEFAULT NULL,
  `ultimo_login_em` DATETIME DEFAULT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `funcionario_id` (`funcionario_id`),
  CONSTRAINT `fk_login_funcionario` FOREIGN KEY (`funcionario_id`)
    REFERENCES `funcionarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `vinculos_funcionais` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `funcionario_id` BIGINT UNSIGNED NOT NULL,
  `unidade_escolar_id` INT NOT NULL,
  `cargo_id` BIGINT UNSIGNED NOT NULL,
  `matricula` VARCHAR(50) DEFAULT NULL,
  `horario_entrada` TIME NOT NULL,
  `horario_saida_almoco` TIME NOT NULL,
  `horario_volta_almoco` TIME NOT NULL,
  `horario_saida` TIME NOT NULL,
  `data_inicio` DATE NOT NULL,
  `data_fim` DATE DEFAULT NULL,
  `status` ENUM('ATIVO', 'AFASTADO', 'ENCERRADO') NOT NULL DEFAULT 'ATIVO',
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vinculos_unidade_matricula` (`unidade_escolar_id`, `matricula`),
  KEY `idx_vinculos_funcionario` (`funcionario_id`),
  KEY `idx_vinculos_unidade_escolar` (`unidade_escolar_id`),
  KEY `idx_vinculos_cargo` (`cargo_id`),
  KEY `idx_vinculos_status` (`status`),
  CONSTRAINT `fk_vinculos_cargo` FOREIGN KEY (`cargo_id`)
    REFERENCES `cargos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_vinculos_funcionario` FOREIGN KEY (`funcionario_id`)
    REFERENCES `funcionarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_vinculos_unidade_escolar` FOREIGN KEY (`unidade_escolar_id`)
    REFERENCES `unidades_escolares` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_vinculos_periodo` CHECK (`data_fim` IS NULL OR `data_fim` >= `data_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `acessos_administrativos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_administrativo_id` BIGINT UNSIGNED NOT NULL,
  `perfil` ENUM(
    'ADMIN_SEDUC',
    'ADMIN_DIRETORIA',
    'DIRETOR',
    'VICE_DIRETOR',
    'SECRETARIA',
    'COORDENADOR'
  ) NOT NULL,
  `diretoria_ensino_id` INT UNSIGNED DEFAULT NULL,
  `unidade_escolar_id` INT DEFAULT NULL,
  `status` ENUM('PENDENTE', 'ATIVO', 'SUSPENSO', 'REVOGADO') NOT NULL DEFAULT 'PENDENTE',
  `data_inicio` DATE NOT NULL DEFAULT (CURDATE()),
  `data_fim` DATE DEFAULT NULL,
  `concedido_por_acesso_id` BIGINT UNSIGNED DEFAULT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_acessos_usuario` (`usuario_administrativo_id`),
  KEY `idx_acessos_diretoria` (`diretoria_ensino_id`),
  KEY `idx_acessos_unidade` (`unidade_escolar_id`),
  KEY `idx_acessos_status` (`status`),
  KEY `idx_acessos_concedido_por` (`concedido_por_acesso_id`),
  CONSTRAINT `fk_acessos_concedido_por` FOREIGN KEY (`concedido_por_acesso_id`)
    REFERENCES `acessos_administrativos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_acessos_diretoria` FOREIGN KEY (`diretoria_ensino_id`)
    REFERENCES `diretorias_ensino` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_acessos_unidade` FOREIGN KEY (`unidade_escolar_id`)
    REFERENCES `unidades_escolares` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_acessos_usuario` FOREIGN KEY (`usuario_administrativo_id`)
    REFERENCES `usuarios_administrativos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_acessos_escopo` CHECK (
    (`perfil` = 'ADMIN_SEDUC' AND `diretoria_ensino_id` IS NULL AND `unidade_escolar_id` IS NULL)
    OR (`perfil` = 'ADMIN_DIRETORIA' AND `diretoria_ensino_id` IS NOT NULL AND `unidade_escolar_id` IS NULL)
    OR (
      `perfil` IN ('DIRETOR', 'VICE_DIRETOR', 'SECRETARIA', 'COORDENADOR')
      AND `diretoria_ensino_id` IS NULL
      AND `unidade_escolar_id` IS NOT NULL
    )
  ),
  CONSTRAINT `chk_acessos_periodo` CHECK (`data_fim` IS NULL OR `data_fim` >= `data_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `registro_de_pontos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vinculo_funcional_id` BIGINT UNSIGNED NOT NULL,
  `data_referencia` DATE NOT NULL,
  `tipo` ENUM('ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA') NOT NULL,
  `registrado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_registro_vinculo_data_tipo` (`vinculo_funcional_id`, `data_referencia`, `tipo`),
  KEY `idx_registro_data_referencia` (`data_referencia`),
  KEY `idx_registro_vinculo_data` (`vinculo_funcional_id`, `data_referencia`),
  CONSTRAINT `fk_registro_vinculo_funcional` FOREIGN KEY (`vinculo_funcional_id`)
    REFERENCES `vinculos_funcionais` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ponto_idempotencia` (
  `funcionario_id` BIGINT UNSIGNED NOT NULL,
  `chave` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `requisicao_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `resposta` JSON NOT NULL,
  PRIMARY KEY (`funcionario_id`, `chave`)
) ENGINE=InnoDB;
