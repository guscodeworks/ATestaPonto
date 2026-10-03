-- Cadastro de escolas com consulta de CEP (BrasilAPI v2).
-- Aplicar ANTES de publicar o backend que expõe /api/admin/escolas.
-- Todas as colunas são opcionais/com default, então as linhas existentes
-- continuam válidas e o fluxo de ponto (que não lê estas colunas) não muda.
-- Execução única: o MySQL não oferece ADD COLUMN IF NOT EXISTS.
--   npm run db:run -- database/migrations/20261001_unidades_escolares_endereco.sql
ALTER TABLE `unidades_escolares`
  ADD COLUMN `cep` CHAR(8) DEFAULT NULL AFTER `endereco`,
  ADD COLUMN `numero` VARCHAR(20) DEFAULT NULL AFTER `cep`,
  ADD COLUMN `bairro` VARCHAR(100) DEFAULT NULL AFTER `numero`,
  ADD COLUMN `uf` CHAR(2) DEFAULT NULL AFTER `cidade`,
  -- 1 = CEP confirmado na BrasilAPI; 0 = endereço informado manualmente.
  ADD COLUMN `cep_verificado` TINYINT(1) NOT NULL DEFAULT 0 AFTER `uf`,
  -- Quem definiu latitude/longitude. Linhas antigas foram digitadas à mão.
  ADD COLUMN `origem_coordenadas` ENUM('BRASILAPI','MANUAL') NOT NULL DEFAULT 'MANUAL' AFTER `cep_verificado`,
  ADD CONSTRAINT `chk_unidade_uf` CHECK (`uf` IS NULL OR CHAR_LENGTH(`uf`) = 2);
