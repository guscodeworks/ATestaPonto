# Homologacao da API publica de funcionarios

Execucao UTC: 2026-10-17T18:31:02.793800+00:00
Execucao direta no Spring, sem gateway Node.
MySQL 8.4 descartavel em tmpfs, Gov.br simulado e SMTP local; dados exclusivamente ficticios.
Nenhum banco existente, .env ou arquivo reservado ao Guilherme foi alterado.

| Resultado | Cenario |
|---|---|
| PASSOU | Sessao legitima via Authorization Code/PKCE no simulador; cookies renovados para os sete perfis |
| PASSOU | Sem sessao: GET 401 com contrato JSON |
| PASSOU | Sem sessao: POST da mesma origem retorna 401 |
| PASSOU | IDs, perfil e Bearer fornecidos pelo navegador nao criam sessao |
| PASSOU | Listagem escolar restrita aos vinculos atuais da escola A |
| PASSOU | DRE A inclui escolas A/C e exclui a DRE B |
| PASSOU | DRE B inclui somente escola B |
| PASSOU | SEDUC autentica mas nao recebe capacidades de funcionarios nem escopo global implicito |
| PASSOU | Escopo de listagem injetado pelo navegador ignorado |
| PASSOU | Paginacao, total e filtros ativo/cargo/q preservados |
| PASSOU | CPF mascarado na listagem |
| PASSOU | Listagem preserva exatamente os campos publicos |
| PASSOU | Consulta: CPF formatado, horarios e envelope preservados |
| PASSOU | Consulta nega funcionario de outra escola/DRE |
| PASSOU | Unidades para cadastro calculadas no servidor |
| PASSOU | Unidades para cadastro exigem capacidade de criar |
| PASSOU | Coordenacao e vice consultam funcionario da propria escola |
| PASSOU | RBAC: coordenacao nao escreve; DRE/SEDUC nao cadastram; secretaria nao desativa |
| PASSOU | Territorio indevido negado no cadastro, edicao e desativacao |
| PASSOU | Cadastro 201: CPF mascarado, primeiro acesso e e-mail local entregue |
| PASSOU | Cadastro persiste funcionario/login/vinculo atomicos e ignora IDs de autorizacao do cliente |
| PASSOU | Um e-mail SMTP local apos cadastro confirmado |
| PASSOU | Senha temporaria enviada corresponde ao BCrypt do banco; hash do navegador ignorado |
| PASSOU | Resposta de cadastro nao expoe senha/hash |
| PASSOU | CPF/email duplicados retornam 409 |
| PASSOU | Edicao 200 e projecao publica preservadas |
| PASSOU | Edicao/ativacao rejeitam contexto de autorizacao no payload |
| PASSOU | Desativacao 200 e timestamp ISO |
| PASSOU | Desativacao encerra vinculo ativo |
| PASSOU | Consulta de inativo usa vinculo visivel historico |
| PASSOU | Reativacao por vice-diretor: contrato 200 |
| PASSOU | Reativacao cria novo vinculo e preserva historico |
| PASSOU | Reativacao de ativo retorna 409 |
| PASSOU | DRE edita/desativa/reativa na propria diretoria e nao alcanca outra DRE |
| PASSOU | Validacoes HTTP 422 mantem envelope e codigo VALIDATION_ERROR |
| PASSOU | Mutacoes sem origem e de origem estrangeira negadas |
| PASSOU | Capacidade e territorio pertencem ao mesmo acesso; sem somar privilegios entre unidades |
| PASSOU | Rollback de cadastro remove funcionario/login/cargo e nao envia e-mail nem audita sucesso |
| PASSOU | Rollback de edicao desfaz funcionario/cargo e nao audita sucesso |
| PASSOU | Rollback de desativacao preserva ativo/vinculo e nao audita sucesso |
| PASSOU | Rollback de reativacao preserva inativo, nao cria vinculo e nao audita sucesso |
| PASSOU | Concorrencia real: troca de vinculo entre autorizacao e lock retorna 409 sem editar/auditar sucesso |
| PASSOU | Apos transferencia, acesso acompanha o vinculo atual e nao o historico |
| PASSOU | Concorrencia real: transferencia durante desativacao retorna 409, sem desativar/auditar sucesso |
| PASSOU | Concorrencia real: mudanca do ultimo vinculo durante reativacao retorna 409, sem ativar/auditar sucesso |
| PASSOU | Concorrencia real: mudanca de DRE da unidade impede cadastro e preserva rollback |
| PASSOU | Revogacao de acesso e identidade desativada invalidam a sessao na proxima requisicao |
| PASSOU | Acesso com vigencia encerrada apos login invalida a sessao |
| PASSOU | Cookie administrativo nao substitui HMAC em /internal/** |
| PASSOU | Contrato HMAC legitimo preservado |
| PASSOU | Replay HMAC negado |
| PASSOU | Assinatura HMAC adulterada negada |
| PASSOU | HMAC obrigatorio tambem no caminho alternativo /internal;probe/auth/admin/context |
| PASSOU | HMAC obrigatorio tambem no caminho alternativo /%69nternal/auth/admin/context |
| PASSOU | Auditoria registra funcionario_cadastrado |
| PASSOU | Auditoria registra funcionario_alterado |
| PASSOU | Auditoria registra funcionario_desativado |
| PASSOU | Auditoria registra funcionario_ativado |
| PASSOU | Cadastro confirmado auditado exatamente uma vez |
| PASSOU | Logs nao expoem chaves, credenciais ou senha/hash gerados |
| PASSOU | Spring e simulador permaneceram ativos durante toda a bateria |
| PASSOU | mysql-dev e node-dev preservados com mesmo ID, estado e reinicios |
| PASSOU | .env preservados byte a byte |
| PASSOU | MySQL temporario removido; processos e SMTP temporarios encerrados |

Totais: PASSOU=64; FALHOU=0; BLOQUEADO=0.

Reproducao: `cd backend-spring && ./mvnw -DskipTests package && python3 scripts/check-public-employees.py`.
Requer Java 21, Docker, imagem mysql:8.4 e dependencias existentes do simulador.
Nenhum commit, merge ou deploy executado. SMTP externo e Gov.br oficial nao fazem parte desta homologacao.
