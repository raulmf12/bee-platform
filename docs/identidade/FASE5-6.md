# Fases 5 e 6 · Stories/publicação por formato e isolamento multi-cliente — implementado

## Fase 5 · Conteúdos sequenciais — etapa B (migração `20261019000001_stories_publicacao.sql`)
- **Stories Instagram**: formato `story` (1 a 10 telas, 1080×1920). Roteiro próprio (telas curtas, uma ideia por tela,
  sem legenda) com **interação planejada** opcional (pergunta/enquete/caixinha) marcada como execução manual — a API não
  publica figurinhas. Todas as telas, inclusive a capa, pelo compositor da sequência (área segura respeitada).
- **Publicação automática por formato** (`_shared/publish-sequence.ts`, roteada por `_shared/publish.ts`):
  carrossel Instagram (um contêiner por página → contêiner CAROUSEL → publicar); carrossel LinkedIn como **documento PDF**
  (Documents API + Posts API; o PDF é o mesmo pacote exportado ou é montado no servidor com pdf-lib); Stories um a um na
  ordem. Versão da API do LinkedIn configurável (`LINKEDIN_API_VERSION`, padrão 202608).
- **Sempre o pacote aprovado/programado**: a versão agendada vem de `piece_versions`; nunca publica só a 1ª página.
- **Verificação prévia** (`publish-post` com `dry_run`): pacote aprovado, quantidade dentro da capacidade, todos os
  arquivos acessíveis, legenda, credenciais — e o plano de chamadas, sem publicar nem contar tentativa.
- **Registro**: `post_publications` (versão + destino, estado, IDs externos, erro) e `post_unit_publications` (Stories,
  por unidade). Falha parcial em Stories para na primeira falha; **retomar** continua na ordem sem repetir as publicadas.
- Agendador publica os formatos com `auto_publish` habilitado em `format_capabilities` (carrossel IG/LinkedIn e Stories).
- Interface: `PublishPanel` na etapa final da sequência (Verificar → Publicar agora/Retomar, publicações e telas).
- Testes: `e2e/f20-stories-publicacao.spec.ts` (fluxo de Stories; publicador REAL em verificação, recusando pacote não
  aprovado e arquivos inacessíveis antes de qualquer chamada externa; aprovação de Stories sem legenda).
- **Não testado com publicação real** (para não postar nas contas do Marcos): o primeiro carrossel/documento/Stories
  em produção deve ser acompanhado.

## Fase 6 · Isolamento multi-cliente (migração `20261020000001_isolamento_clientes.sql`)
- **RLS por marca** em todas as bases de identidade, metodologia, sistema visual, fotos, ACJ e Alma (`bee_*`, `genesis_*`,
  `design_*`, `photo_references`, `acj_definitions`, `alma_*`): leitura e escrita só para membros do workspace da marca;
  `brand_id` nulo = padrão neutro do produto. Antes, quase tudo era legível (e parte gravável) por qualquer usuário.
- Produtos de sistema e documentos globais de conhecimento só para a própria marca; **RAG** (`match_knowledge`) só traz
  documentos globais das marcas do usuário.
- **Funções com credencial de serviço**: helper `brandScope`/`userBrandScope` (`_shared/context.ts`) aplicado em
  bee-context, generate-content (bases + sistema visual + Alma), hive-decide, cycle-pauta, campaign-moment,
  acj-orchestrator, content-develop, generate-script, generate-caption-from-video, mine-content, qa-check. Sem marca →
  padrões neutros, nunca dados da Bee. Sonda `identity-setup` `context_probe` mostra o que a Hive carrega.
- **Brechas fechadas**: publicar peça de outro usuário pelo ID; publicar com a **conta social de outro usuário**;
  criar sessão de identidade ou campanha/ideia/conteúdo/peça apontando para marca/perfil de outro cliente.
- **Cliente novo**: `create_my_workspace` cria o próprio workspace + marca (sem herdar nada); "Minha identidade" abre a
  configuração inicial com perguntas neutras do produto.
- Testes: `e2e/f19-isolamento.spec.ts` com um **segundo usuário real** criado só para o teste (e removido depois).

## O que ainda depende de decisão
- Sistema visual por marca: um cliente novo não tem templates próprios (a imagem é bloqueada com aviso, sem usar o da Bee).
- Primeira publicação real de cada formato acompanhada.
