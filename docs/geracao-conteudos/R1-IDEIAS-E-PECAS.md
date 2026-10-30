# Geração de conteúdos — R1: preservar ideias e visualizar peças

Estado: implementação local para revisão; não publicada. Base: main 242cdd7.

## Premissas aprovadas pelo Marcos

A Hive propõe caminhos a partir da biblioteca, públicos e objetivos. Criação com campanha ou avulsa; ideias-mãe reutilizáveis; recortes por editoria; conteúdo antes de formato; peças com vida própria; revisão de texto/imagem independente; controle de repetição por conta e canal; simplicidade no frontend. Evoluir sobre a estrutura atual, preservando histórico. O pedido autoriza preparar a implementação em partes; a aprovação anterior de regressão era do PR #1 e não se aplica a esta versão.

## Diagnóstico pelo código

- `Idea` já admite backlog e vínculos opcionais com campanha/ciclo, mas contém canais e uma única editoria.
- `Content` já referencia a ideia; `user_posts` referencia o conteúdo.
- `buildPipeline` agrupava todas as peças sob o conteúdo, usando o estágio menos avançado. Uma peça publicada podia ficar escondida por outra pendente.
- `generatePauta(refresh)` marcava propostas anteriores da Hive como descartadas.
- `approvePauta` aprovava todos os registros não descartados, incluindo backlog.
- `developIdeas` desenvolve todas as aprovadas, até três em paralelo.
- `validateContent` cria uma peça de LinkedIn conforme os canais da ideia; `productionTodo` depende desses canais.

Leitura de código, não inventário do banco em produção. Nenhum dado real alterado.

## Recorte implementado nesta primeira entrega

1. Cada registro de peça não arquivada recebe cartão, estágio, destino, data, código e ação próprios no Pipeline.
2. A origem editorial fica visível no cartão. Filtros de conta/canal usam a própria peça, não os destinos de peças irmãs.
3. Conteúdos continuam visíveis enquanto aguardam desenvolvimento/validação, ainda não têm peças ou possuem desdobramentos previstos pendentes. Não criamos cartão operacional duplicado para um conteúdo já desdobrado integralmente.
4. A ausência de peça para um destino não rebaixa uma irmã aprovada/agendada/publicada.
5. Uma peça sem conta não satisfaz um destino com conta específica. Conteúdo descartado não oculta histórico de peças.
6. Alertas de repetição da ideia/conteúdo não são herdados como prova de repetição de cada peça. Alertas próprios da peça permanecem. O motor de detecção não foi redesenhado neste recorte.
7. Pedir nova seleção guarda propostas anteriores em backlog, preservando título, direção e vínculos. Ideias pessoais permanecem ativas.
8. A pauta oferece Guardar para depois e mostra a quantidade de ideias guardadas no ciclo, com Retomar ideia.
9. Aprovar a pauta não aprova nem desenvolve ideias guardadas; inclui somente propostas/aprovadas.
10. Retomar após avanço do ciclo recoloca a ideia em desenvolvimento, preservando peças anteriores. O acesso a uma ideia pelo Pipeline leva explicitamente à etapa de pauta.

Alternativas não arquivadas são registros individuais e aparecem como peças distintas; o banner do ciclo continua contando grupos de revisão. Essa diferença deve ser avaliada na validação de uso. Não é uma contagem de publicações futuras confirmadas.

## Próximas entregas necessárias para cumprir o redesenho inteiro

- R2: seleção de várias ideias interessantes com desenvolvimento explícito de UMA por vez; banco global independente do ciclo, retomada na entrada de criação e preservação ao trocar uma ideia individual.
- R3: retirar exigências de canal/conta da ideia e criação avulsa, transferir decisões para planos de peças depois da validação conceitual; alterar os consumidores juntos (pauta, content-develop, validateContent e productionTodo), com compatibilidade para dados antigos.
- R4: ideia-mãe → múltiplos recortes editoriais, procedência na biblioteca e reuso entre campanhas; inventário, migrations aditivas e rollback se necessário.
- R5: antirrepetição na geração por conta/canal e intenção; variações independentes de texto/imagem; teste completo da jornada.

Não esconder o campo de canal como se a dependência tivesse sido removida. R1 ainda preserva o motor antigo de desenvolvimento em lote e a seleção antecipada de canais.

## Validação e publicação

- Testes puros via `playwright.r1.config.ts`: cobrem estados independentes, filtros, histórico e destinos; incluem a suíte existente de Home.
- E2E F3 atualizado para verificar armazenamento e retomada após reload; F7 atualizado para cartões individuais e navegação para a peça.
- Build, resultados e impedimentos registrados ao concluir a execução.
- Antes de publicar: F3, F7 e regressão completa; verificar a retomada de um ciclo já avançado e a aprovação de pauta com backlog.
- Sem navegador/configuração E2E no executor, não declarar esses cenários aprovados nem publicar em produção.
- Reverter os arquivos desta entrega restaura o comportamento visual anterior. Ideias guardadas continuam sendo dados válidos com status backlog; não apagá-las na reversão.

### Resultado local — 27/10/2026

- Build TypeScript/Vite aprovado; aviso de chunks grandes preexistente.
- 9/9 testes puros de Pipeline/Home aprovados em 8,1 s.
- F3/F7 coletados pelo Playwright: 8 testes incluindo autenticação. Não executados.
- `git diff --check` aprovado.
- Executor sem Chromium configurado, sem `.env.e2e.local` e sem token administrativo no ambiente. Não houve tentativa de contornar o bloqueio anterior de acesso ao Supabase.
- Regressão completa pendente; nenhum push, merge ou deploy desta entrega.
