-- A03: aplicar antes de publicar o backend/cliente que exigem chave por ação.
-- Não remover registros enquanto as respectivas chaves puderem ser reenviadas.
CREATE TABLE IF NOT EXISTS ponto_idempotencia (
  funcionario_id BIGINT UNSIGNED NOT NULL,
  chave CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  requisicao_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resposta JSON NOT NULL,
  PRIMARY KEY (funcionario_id, chave)
) ENGINE=InnoDB;
