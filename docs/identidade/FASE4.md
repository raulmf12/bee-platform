# Fase 4 · Conteúdos sequenciais — Etapa A (carrossel) — implementado

Base: `Hive_Conteudos_Sequenciais_v1.md` (§3 etapa A, §5–§9, §11–§12) + regra transversal de ajustes (Fase 2).

## Modelo (migração `20261018000001_sequencias.sql`, rollback em `supabase/rollback/`)
- `content_piece_plans` — plano de peças: cada desdobramento com **ID próprio** (conteúdo, conta, canal, formato,
  abordagem, propósito, arquitetura, origem padrão/Hive/autor, estado). Dois carrosséis na mesma conta são legítimos;
  aprovar a imagem única não encerra os demais.
- `post_units` — páginas com **ID estável** (posição ≠ identidade), função narrativa, título/texto, direção visual,
  layout (capa/texto/encerramento), recursos, visual, versões de texto/visual, estados de visual e de revisão. Campos
  opcionais para a evolução (duração, narração, legendas, áudio, transição, texto alternativo, interação).
  **Fonte canônica**; `rendered_slides`/`carousel_fabric_json` são projeção (`sync_unit_projection`).
- `format_capabilities` — limites e capacidades por plataforma/formato, com versão e data de verificação (IG carrossel
  2–10 páginas, exporta imagens; LinkedIn carrossel 2–20, exporta PDF; publicação automática = não, etapa B).
- `user_posts`: `plan_id`, `narrative_architecture`, `script_status`, `visual_direction`, `approved_version`,
  `export_package`, `source_content_at`.
- Regras no banco: texto da página alterado → visual da página "desatualizado" e revisão pendente (a imagem NÃO é
  trocada); posição alterada → só refaz se a direção usa numeração; qualquer mudança nas páginas derruba a aprovação
  final e marca o agendamento como desatualizado; `reorder_units` (IDs preservados), `apply_unit_candidate` (só as
  páginas selecionadas e os componentes autorizados; conflito de versão), `approve_sequence` (só com roteiro aprovado,
  todas as páginas prontas e aprovadas, quantidade dentro da capacidade e legenda); conteúdo-mãe alterado sinaliza
  as peças derivadas sem sobrescrever.

## IA (`sequence-script`)
`recommend_plan` (peças com propósito; carrossel só com densidade), `script` (roteiro com arquitetura narrativa —
história, perspectiva, conceito, caso, experimentação —, progressão real, capa/encerramento, legenda; validado contra
o contrato e gravado em `post_units`), `adjust_units` (só as páginas selecionadas / sequência / legenda), `coherence`
(abertura, continuidade, redundância, legibilidade, encerramento). Usa o mesmo cérebro (Genesis/diretrizes/voz),
o contexto do perfil e o contrato ACJ do conteúdo-mãe.

## Interface
- Revisão do ciclo › **Plano de peças** por conteúdo: itens com conta/canal/formato/abordagem/propósito, "Sugestões da
  Hive", "Acrescentar", remover, "Produzir planejadas".
- Peça de carrossel → **Roteiro** (editar, inserir, remover, reordenar, pedir ajuste com escopo, legenda, revisar
  coerência, refazer, aprovar roteiro) → **Direção visual** do conjunto antes de renderizar (fundo, template da capa,
  numeração, assinatura) → **Páginas**: visão de conjunto + página a página, progresso, falhas com motivo, "Produzir
  pendentes" (só pendentes/desatualizadas/falhas), aprovar página/todas, ajustar texto (página atual, selecionadas,
  sequência inteira, legenda — Hive ou edição direta), trocar imagem da capa, trocar template/direção (proposta de todas
  as páginas), mover página, reabrir roteiro; sempre **comparar atual × proposta** antes de aplicar → **Aprovar sequência
  (vN)** → **Exportar** (PDF no LinkedIn, ZIP de imagens no Instagram) da versão aprovada → marcar como publicado.
- Capa = pipeline de imagem única (template M01/M02, foto/fundo preservados ao reacomodar texto); páginas internas e
  encerramento = `src/lib/hive/composeSequence.ts` (mesmos tokens; texto que não cabe falha com motivo, nunca corta).
- Agenda: uma entrada por peça, marcada "Carrossel (manual)". O publicador recusa carrossel/Stories com motivo claro
  (nunca publica só a 1ª página) e o agendador não os tenta.
- Bucket `media` passou a aceitar `application/pdf` e `application/zip` (pacotes exportados).

## Testes
`e2e/f18-sequencias.spec.ts`: plano com imagem + carrossel na mesma conta LinkedIn sem duplicar ao retomar; roteiro
antes do visual; reordenar preserva IDs; falha numa página retomada sem refazer as prontas; página ajustada invalida só o
próprio visual; aprovação incompleta recusada; PDF da versão aprovada com as 5 páginas em ordem; regras do banco
(escopo/preservação dos candidatos, conflito, reordenação com numeração, agendamento).

## Próximo (etapa B)
Stories Instagram, publicação automática por formato (carrossel IG via containers; documento LinkedIn) conforme
permissões verificadas, registro por unidade e retomada ordenada.
