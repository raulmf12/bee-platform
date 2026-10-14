# Fase 1 · Identidade e contextos (fundação) — implementado

Base: `Hive_Identidade_Contextos_Setup_e_Evolucao_v1.md` §4, §9, §10, §11 e o Guia §5.

## Modelo
workspace → marca (Genesis) → emissor (pessoa/institucional) → frente (Consulting/Academy) → público
(≠ estado do interlocutor) → **perfil de comunicação** (versionado em `communication_profile_versions`)
→ **snapshot de contexto** (`context_snapshots`) gravado em cada criação.

Migração `20261015000001_identidade_contextos.sql` (rollback em `supabase/rollback/`):
- tabelas `workspaces`, `workspace_members`, `brands`, `emitters`, `business_fronts`, `audiences`,
  `communication_profiles`, `communication_profile_versions`, `context_snapshots`, `setup_sessions`;
- `brand_id` nas bases Genesis/bee_*/produtos/conhecimento/fotos (tudo Bee hoje);
- escopo `front_id/emitter_id/profile_id` em `bee_directives` e `ai_learnings` (+ RPC `ai_prompt_learnings`);
- `profile_id` em campanhas/ideias/conteúdos/peças; `context_snapshot_id` em conteúdos/peças (peça herda por trigger);
- `user_posts.reference_status` (importados = `historical`, nunca referência de voz automática).

## Configuração inicial da Bee (revisável na Fase 3)
- Emissores: Marcos Piccini (pessoa, perfil fotográfico `marcos`) e Bee Consulting (institucional, sem 1ª pessoa).
- Frentes: Bee Academy (ofertas Masterclass/FLS) e Bee Consulting.
- Públicos: Líderes (ativo, legado), Transformadores (hipótese), Pessoas e papéis em questões organizacionais (hipótese).
- Perfis: **Bee Academy · Marcos · Líderes e transformadores** (ativo, padrão), **Bee Consulting · Marcos · Organizações** (ativo), **Bee Consulting · Institucional** (rascunho).
- Campanha Masterclass → Academy; demais campanhas → "perfil a definir" (aviso visível, sem fallback silencioso).

## Resolvedor comum (`supabase/functions/_shared/context.ts`)
Ordem: snapshot (conteúdo/peça) → perfil da campanha → perfil escolhido → padrão da marca (fallback marcado).
Usado por: generate-content, content-develop, cycle-pauta, campaign-strategy, campaign-moment, qa-check (mesmo
snapshot da geração), edit-text, post-chat, regenerate-snippet, acj-orchestrator, generate-persona, persona-chat,
suggest-audience, mine-content, generate-script, generate-caption-from-video, hive-decide (M02 só com perfil
fotográfico do emissor), learn-from-feedback/correction (lição nasce com a frente).
Removidos os textos fixos "Marcos Piccini, escrevendo para a Bee Academy", "20 anos/dois livros" (agora autoridade
do emissor, a confirmar) e "líder/gestor" dos caminhos genéricos.

## Interface (mínima nesta fase)
Seletor de perfil na nova campanha e no detalhe da campanha; linha "Contexto: quem fala · frente · público" na
validação do conteúdo-mãe. O percurso "Minha identidade" é a Fase 3.

## Aceite verificado
Mesma pauta/editoria/plataforma gerada com Academy e com Consulting (contextos distintos, sem fallback); voz
institucional em "nós"; snapshots gravados; testes `e2e/f15-identidade-contexto.spec.ts`.

## Fica para depois
Fase 3: percurso Minha identidade (sessões, propostas, editorias, calibração, ativação de versões, recalibração).
Fase 6: isolamento entre clientes (RLS por workspace em todas as tabelas, functions com service role, RAG).
