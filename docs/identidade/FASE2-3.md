# Fases 2 e 3 · Ajustes de peças e Minha identidade — implementado

## Fase 2 · Ajustes e alternativas de peças (`Hive_Ajustes_e_Alternativas_de_Pecas_v1.md`)
Toda mudança numa peça vira **proposta (candidato)** sobre a versão-base; a peça ativa só muda ao **Aplicar**.

- Migração `20261016000001_ajustes_pecas.sql`: `piece_candidates`, `piece_versions`, `user_posts.version/scheduled_version`,
  `apply_piece_candidate` (preservação validada no banco, conflito de versão → HTTP 409 `PT409`, aprovações afetadas
  invalidadas), `update_scheduled_package`, trigger que prende a peça agendada à versão programada.
- `src/lib/pieces/ops.ts` (serviço comum) e `src/components/pieces/PieceActionsPanel.tsx` na revisão do ciclo:
  Ajustar texto (frase/legenda, pedir à Hive ou editar) · Trocar imagem · Trocar template (com aviso de impacto) ·
  Outra abordagem · Explorar visual (indisponível, explicado). Comparação atual × proposta, "mantido" calculado pelo diff,
  "Pedir outro ajuste" a partir da proposta ou da versão atual. "Gerar outra foto" do Marcos vira proposta de troca de imagem.
- Publicação: peça agendada publica o pacote programado (`piece_versions`) até "Atualizar agendamento".
- Testes: `e2e/f16-ajustes-pecas.spec.ts` (+ f5/f12 atualizados).

## Fase 3 · Minha identidade (Guia de implementação §3–§10)
Menu **Base Hive › Minha identidade** (`/identidade`).

- **Entradas:** Configurar minha identidade (marca sem identidade) · Revisar identidade e frentes · Adicionar frente ·
  Recalibrar (no perfil) · Continuar configuração (sessão em andamento). `/identidade/configurar?modo=&perfil=&marca=`.
- **Tela 1 — visão atual:** marca, Genesis (herdado, link para edição detalhada), perfis com versão, emissores, frentes,
  públicos, fontes e "o que falta revisar".
- **Sessão** (`/identidade/sessoes/:id`, tudo salvo e retomável): O que mudou → Conversa guiada (uma pergunta por vez, com o
  porquê; editar respostas) → Materiais (referência atual × histórico) → O que a Hive entendeu (propostas por bloco com origem
  declarado/evidência/hipótese/mantido, diferenças, edição direta, aceitar, pedir ajuste) → Perfis → Editorias → Calibração
  (amostras com o perfil EM RASCUNHO; feedback; lição com escopo do perfil) → Ativar (impacto e alcance) → Pronto.
- **Servidor:** `identity-setup` (`next_question`, `propose`) — perguntas de abertura da Bee guardadas em
  `brands.metadata.setup_seed_questions` (Guia §5); banco genérico para outras marcas. Propostas saneadas (refs inventadas
  descartadas, recalibração só toca o perfil-alvo). `_shared/identity-draft.ts` sobrepõe as propostas à configuração atual;
  `generate-content` aceita `calibration: { session_id, profile_ref }`.
- **Ativação** (`activate_setup_session`, atômica): confere a versão-base (conflito → 409), aplica só blocos aceitos, cria
  nova versão (`communication_profile_versions` com a composição completa) para cada perfil afetado, recalibração **copia**
  o que é compartilhado (os outros perfis não mudam), editorias novas entram "em teste" (nunca apaga), lições da calibração
  viram `ai_learnings` com `profile_id`. Alcance "só novas criações" prende as campanhas em andamento na versão anterior
  (`campaigns.profile_version`; o resolvedor usa a composição congelada).
- Criação avulsa agora também escolhe o perfil (`ideas.profile_id`); `?profile=` em Criar conteúdo e Nova campanha.
- Migração `20261017000001_minha_identidade.sql` (rollback em `supabase/rollback/`).
- Testes: `e2e/f17-minha-identidade.spec.ts` (sempre numa marca de teste `e2e-*`, nunca a Bee).

## Decisões que ficam com o Marcos (dentro do percurso)
Núcleo dos transformadores, interlocutores da Consulting, uso da voz institucional e curadoria final das editorias.

## Próximas fases
F4 carrossel (etapa A) · F5 Stories/publicação · F6 isolamento multi-cliente (RLS por workspace em todas as tabelas,
RAG por marca) — pré-requisito para clientes externos (item 10 do roteiro de aceite).
