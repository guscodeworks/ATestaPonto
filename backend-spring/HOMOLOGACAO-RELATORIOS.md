# Homologação de relatórios, dashboard e sessão

HTTP direto no Spring, Java 21, MySQL 8.4/Redis 7 descartáveis, Gov.br Python simulado e dados fictícios. Sem Express, sem carregar `.env`. O histórico abaixo preserva falhas e reexecuções por grupo.

**Resultado consolidado: PASSOU.** Build Java 21 (`./mvnw -o -DskipTests package`) e `git diff --check` aprovados. Foram verificadas 266 requisições públicas nas duas rodadas, além das chamadas OAuth e HMAC internas. Nenhum grupo permanece FALHOU ou BLOQUEADO.

| Grupo | Resultado final |
| --- | --- |
| Seis endpoints, HTTP/JSON, agregados e paginação não aplicável | PASSOU |
| Datas, limites semanais e vigência histórica | PASSOU na reexecução |
| Capacidades, SEDUC/DRE/escola, território vazio e filtros forjados | PASSOU na reexecução |
| Sessão ausente, expirada, revogada e cadastro inativo | PASSOU |
| Auditoria e ausência de credenciais nos logs | PASSOU |
| Rate limiting Redis real, 429, indisponibilidade 503 e recuperação | PASSOU |
| HMAC, replay, timestamp, corpo e URL adulterados | PASSOU |
| Preservação de mysql-dev, node-dev e `.env`; limpeza temporária | PASSOU em ambas as rodadas |

As duas falhas iniciais eram expectativas do harness: colchetes precisavam ser codificados na URL; o perfil acumulado SEDUC + escola pode consultar agregados globais, mantendo os nominais locais. Corrigido somente `scripts/check-public-reports.py`; repetidos apenas `datas,territorio`. Não houve alteração adicional no código Java.

Reprodução: empacotar com Java 21 e executar `python3 backend-spring/scripts/check-public-reports.py`. Para repetir grupos, usar `--only datas,territorio` (ou os grupos listados no `--help`). Requer Docker com as imagens locais `mysql:8.4` e `redis:7-alpine`; cria recursos com nomes exclusivos e remove somente esses recursos. Não usa `.env` nem Express. O provedor OAuth é o simulador Python reutilizado do harness de escolas.

Arquivos desta homologação: `backend-spring/scripts/check-public-reports.py`, este relatório e atualização de `backend-spring/RELATORIOS-PUBLICOS.md`. Sem commit, merge ou deploy. Cobertura limitada às fixtures descritas, sem execução no ambiente real.

## Rodada 2026-10-17T20:30:02-03:00: FALHOU

Grupos: todos. Requisicoes publicas verificadas: 135.

- **PASSOU** `infra`: Java 21, Spring real, MySQL e Redis temporarios; Gov.br Python local; JVM UTC
- **PASSOU** `contratos`: hoje: contrato exato e contagens por pessoa/vinculo
- **PASSOU** `contratos`: relatorio: contrato exato e contagens por pessoa/vinculo
- **PASSOU** `contratos`: resumo: contrato exato e contagens por pessoa/vinculo
- **PASSOU** `contratos`: semanal: sete dias, vigencia historica e totais pessoa-dia
- **PASSOU** `contratos`: hierarquia: somente agregados; sem dados nominais extras
- **PASSOU** `contratos`: auth/me: identidade e capacidades sem campos extras
- **PASSOU** `contratos`: barra final aceita; paginacao e intervalo nao aplicaveis, ignorados como no Express
- **FALHOU** `datas`: Headers: /api/admin/pontos/hoje?data[x]=a
- **PASSOU** `territorio`: perfil 1: escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 3: escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 4: escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 5: escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 6: escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 7: escopo servidor e filtros forjados sem vazamento
- **FALHOU** `territorio`: /api/admin/pontos/relatorio/hierarquia?data=2026-09-28&unidade_escolar_id=2: esperado 403, recebido 200: {"data":{"data_referencia":"2026-09-28","resumo":{"total_funcionarios":1,"total_ativos":1,"presentes":1,"ausentes":0,"taxa_presenca_percent":100,"total_vinculos":1,"total_escolas":1,"total_diretorias":1},"diretorias":[{"diretoria_ensino_id":2,"diretoria_ensino_nome":"Fixture DRE B","resumo":{"total_funcionarios":1,"total_ativos":1,"presentes":1,"ausentes":0,"taxa_presenca_percent":100,"total_vinculos":1,"total_escolas":1,"total_diretorias":1},"escolas":[{"unidade_escolar_id":2,"unidade_escolar_n
- **PASSOU** `sessao`: todos os GETs exigem sessao; headers/identidade do navegador nao autorizam
- **PASSOU** `sessao`: auth/me preserva snapshot de identidade e loginAt
- **PASSOU** `sessao`: capacidades recalculadas apos mudanca de perfil
- **PASSOU** `sessao`: acesso revogado bloqueia todos os GETs na proxima requisicao
- **PASSOU** `sessao`: cadastro inativo bloqueia todos os GETs
- **PASSOU** `sessao`: vigencia expirada apos login bloqueada
- **PASSOU** `auditoria`: somente diario/hierarquia bem-sucedidos auditados; identidade/IP/filtros corretos
- **PASSOU** `auditoria`: logs sem chaves, credenciais ou tokens de homologacao
- **PASSOU** `hmac`: HMAC: assinatura valida aceita; cookie, replay, corpo/URL alterados, relogio e ID invalidos rejeitados
- **PASSOU** `limites`: 40 sucessos, 41a retorna 429/Retry-After; chaves/TTL Redis compativeis; me fora da cota
- **PASSOU** `limites`: cota por recurso preexistente em Redis respeitada
- **PASSOU** `limites`: cota IP compartilhada preexistente respeitada
- **PASSOU** `limites`: Redis indisponivel retorna 503 sem fallback; recuperacao retorna 200
- **PASSOU** `sessao`: expiracao absoluta: replay do cookie expirado rejeitado nos seis GETs
- **PASSOU** `limpeza`: somente recursos temporarios removidos; mysql-dev, node-dev e .env preservados

## Rodada 2026-10-17T20:31:02-03:00: PASSOU

Grupos: datas,territorio. Requisicoes publicas verificadas: 131.

- **PASSOU** `infra`: Java 21, Spring real, MySQL e Redis temporarios; Gov.br Python local; JVM UTC
- **PASSOU** `datas`: hoje: invalidas 400, bissexto e padrao Sao Paulo com JVM UTC
- **PASSOU** `datas`: relatorio: invalidas 400, bissexto e padrao Sao Paulo com JVM UTC
- **PASSOU** `datas`: relatorio/semanal: invalidas 400, bissexto e padrao Sao Paulo com JVM UTC
- **PASSOU** `datas`: relatorio/hierarquia: invalidas 400, bissexto e padrao Sao Paulo com JVM UTC
- **PASSOU** `datas`: limites semanais 1000..9999, semana futura zerada, resumo ignora data
- **PASSOU** `datas`: fronteiras de vigencia e funcionario hoje inativo preservado no historico
- **PASSOU** `territorio`: perfil 1: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 3: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 4: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 5: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 6: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 7: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 9: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: perfil 13: capacidades, escopo servidor e filtros forjados sem vazamento
- **PASSOU** `territorio`: SEDUC: globais apenas agregados, filtros validos e inexistente 403
- **PASSOU** `territorio`: SEDUC + escola: nominal local, resumo global
- **PASSOU** `territorio`: DRE vazia: resultados vazios, nunca acesso global
- **PASSOU** `territorio`: IDs territoriais invalidos/duplicados/injecao rejeitados com 400
- **PASSOU** `limpeza`: somente recursos temporarios removidos; mysql-dev, node-dev e .env preservados
