# Plataforma Bee Consulting

> Plataforma interna de criação e publicação de conteúdo da Bee Consulting — consultoria sistêmica de liderança liderada por **Marcos Piccini**.

Uma SaaS-like de criação de posts pra LinkedIn e Instagram, fundamentada em RAG e na arquitetura editorial proprietária da Bee. A IA gera **só o conteúdo** (frase + caption); o sistema substitui a frase num template visual editável (sem custo de geração de imagem).

Três eixos organizam o sistema: a **[Alma](#-a-alma)** (a psique que guia toda geração via Camada 0), os **[Templates como dado](#-templates-são-dado)** (palco fixo + slots que a IA preenche, com motor de layout) e a **[Eficácia da IA](#-eficácia-da-ia-e-o-portão-da-campanha)** (o Aprovar mede, a IA aprende com as correções, e a campanha autônoma só destrava aos 90%).

---

## 📑 Índice

- [Visão geral](#-visão-geral)
- [Arquitetura](#-arquitetura)
- [A arquitetura editorial Bee](#-a-arquitetura-editorial-bee)
- [A Alma](#-a-alma)
- [Templates são dado](#-templates-são-dado)
- [Eficácia da IA e o portão da campanha](#-eficácia-da-ia-e-o-portão-da-campanha)
- [Stack técnica](#-stack-técnica)
- [Pré-requisitos](#-pré-requisitos)
- [Setup local (passo-a-passo)](#-setup-local-passo-a-passo)
- [Estrutura de pastas](#-estrutura-de-pastas)
- [Banco de dados](#-banco-de-dados)
- [Edge Functions](#-edge-functions)
- [Canvas Studio (editor visual)](#-canvas-studio-editor-visual)
- [Integrações de publicação (LinkedIn + Instagram)](#-integrações-de-publicação-linkedin--instagram)
- [Custos estimados](#-custos-estimados)
- [Deploy](#-deploy)
- [Comandos úteis](#-comandos-úteis)
- [Roadmap](#-roadmap)
- [Troubleshooting](#-troubleshooting)
- [Licença](#-licença)

---

## 🎯 Visão geral

### Problema
Bee Consulting publica posts no LinkedIn e Instagram seguindo uma **voz proprietária muito específica** (codificada num Guia de Voz de centenas de páginas). Manter consistência editorial entre 8 pilares editoriais distintos, 2 avatares-alvo, vocabulário próprio, analogias restritas a natureza/biologia, e few-shot examples reais — tudo isso, manualmente, é trabalhoso e inconsistente.

### Solução
Uma plataforma onde quem cuida do conteúdo:
1. Escolhe um **editorial** (Diagnóstico Sistêmico, Provocação de Crença, História Pessoal Vulnerável, etc).
2. Opcional: escolhe um **arsenal item** (case, framework, livro).
3. Define o **avatar-alvo** (Identificado / Incomodado / Ambos).
4. Adiciona um **briefing** opcional.
5. **IA gera frase + caption** no estilo Bee — usando RAG (12k+ chunks) + arquitetura editorial codificada em SQL como contexto.
6. Sistema **renderiza um template visual** (frase navy serif + espiral honey oficial sobre fundo branco) — totalmente editável num Canvas tipo Canva.
7. Publicação direta no **LinkedIn e/ou Instagram** com 1 clique.

### Diferencial
- **Custo de imagem = R$ 0** — não usa Nano Banana / Imagen. Template visual + IA só pro texto.
- **Voz consistente** — IA recebe ~5–10k chars de contexto Bee em cada chamada (persona + editorial + few-shot + style rules + RAG + **Camada 0 da Alma** + **aprendizados das suas correções**).
- **Aprende com você** — cada post que você corrige vira uma lição no prompt; a campanha autônoma só liga quando a IA acerta 90%.
- **Geração em lote** — cada geração entrega **3 a 5 posts independentes** de uma vez, cada um com **código único** (`BEE-DDMMAA-Gnn-Dn-Vn`) e **nota de viralização (0–100)**; título e legenda aprovados/rejeitados individualmente.
- **Métricas de inteligência da IA** — o sistema conta quantas **correções da IA** e **edições manuais** cada post exigiu até ser aprovado (`ai_edit_rounds` / `manual_edits`) — dados pra medir e melhorar a IA.
- **Agenda de conteúdo** — calendário estilo Google Agenda (não substitui o Kanban): arraste posts em stand-by pro dia ou deixe a IA distribuir; cor por editoria + ícone da rede + filtros.
- **Multi-plataforma simultâneo** — 1 fluxo de criação gera 2 posts (LinkedIn 4:5 + Instagram 1:1) ligados via `companion_post_id`.

---

## 🏗 Arquitetura

```
┌────────────────────────────────────────────────────────────────┐
│                       Browser (React SPA)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Vite + React 18 + TypeScript + Tailwind + Radix + Zustand│  │
│  │  - Auth (login/signup)                                     │  │
│  │  - Kanban editorial (drag-drop)                            │  │
│  │  - NewPost (image/video) com multi-plataforma              │  │
│  │  - Canvas Studio (editor Fabric.js)                        │  │
│  │  - Configurações                                           │  │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬──────────────────────────────────┬────────────────┘
             │                                  │
             ▼                                  ▼
    ┌────────────────────┐           ┌──────────────────────────┐
    │   Supabase Auth    │           │   Supabase REST (db.ts)  │
    │   (PKCE flow)      │           │   Bypassa supabase-js v2 │
    └────────────────────┘           │   pra evitar hang bug    │
                                     └──────────┬───────────────┘
                                                │
             ┌──────────────────────────────────┼────────────────────┐
             ▼                                  ▼                    ▼
    ┌─────────────────┐              ┌──────────────────┐  ┌──────────────────┐
    │  Postgres       │              │  Edge Functions  │  │  Storage (media) │
    │  + pgvector     │◄─────────────┤  (Deno)          │  │  - PNGs render   │
    │  + pg_cron      │              │  - generate-*    │  │  - vídeos (TUS)  │
    │  + RLS          │              │  - publish-post  │  │                  │
    └─────────────────┘              │  - ingest-doc    │  └──────────────────┘
                                     └──────┬───────────┘
                                            │
                          ┌─────────────────┴─────────────────┐
                          ▼                                   ▼
                ┌──────────────────┐                ┌───────────────────┐
                │  Gemini API      │                │  Social APIs      │
                │  - 3.5 Flash     │                │  - LinkedIn v2    │
                │  - Embedding 001 │                │  - IG Graph v21   │
                │  - Files (video) │                │                   │
                └──────────────────┘                └───────────────────┘
```

### Fluxo crítico: criar um post de Frase

1. `NewPost.tsx` coleta editorial + arsenal + avatar + plataformas + briefing
2. Front chama `edge.generateContent({...})` com JWT
3. Edge function `generate-content`:
   - Carrega **12 contextos em paralelo** da DB (editorial, arsenal, avatares, few-shot examples, glossary, style rules, headline types, analogies, hashtags…)
   - Faz **embedding da query** + chama `match_knowledge` RPC → top-8 chunks do RAG
   - Monta system prompt em **9 camadas** (~5–10k chars)
   - Chama Gemini Flash → JSON `{quote, caption, headline_type_used, analogy_used}`
4. Front recebe → mostra preview editável (step 5 do wizard)
5. User confirma → front chama `hydrateBeeQuote({quote, sizeId})` → gera JSON Fabric do template
6. `create()` insere o post no banco (ou 2 posts cross-linked se multi-plataforma)
7. `/posts/{id}` abre o `PostEditor` com `CanvasStudio` embedded → user pode editar o canvas
8. "Exportar" sobe PNG pro Storage → "Publicar no LinkedIn" chama `edge.publishPost`

---

## 🐝 A arquitetura editorial Bee

A inteligência editorial não vive na IA — vive em **8 tabelas seedadas** que codificam o Guia de Voz da Bee. O Gemini é um executor que recebe esse contexto.

### Tabelas-chave (`bee_*`)

| Tabela | O que armazena | Linhas (seed) |
|---|---|---|
| `bee_editorials` | 8 editoriais: Diagnóstico Sistêmico, Provocação de Crença, História Pessoal, Depoimento, Case Anonimizado, Bastidor, Reflexão Filosófica, Trecho de Livro | 8 |
| `bee_arsenal` | Items pré-mapeados por editorial: cases, frameworks, citações dos livros do Marcos, padrões corporativos | ~50+ |
| `bee_avatars` | 2 avatares: O Identificado, O Incomodado — com `dor`, `gatilhos`, `example_phrases` | 2 |
| `bee_style_rules` | DO / DONT / GENERAL — regras duras do que a voz faz e não faz | ~30 |
| `bee_headline_types` | 4 tipos de título: Contradição Direta, Diagnóstico Imperativo, Pergunta-que-implica, Metáfora-que-nomeia | 4 |
| `bee_glossary` | Vocabulário proprietário: "egomecânico", "Olhar Bee", "travessia", etc. Flag `must_appear` | ~15 |
| `bee_analogies` | Banco de analogias — **só natureza/biologia**, proibido finanças/tecnologia | ~20 |
| `bee_hashtags` | Required + optional, agrupadas por `topic` | ~30 |
| `bee_example_posts` | Few-shot examples reais do Marcos — `image_quote`, `caption`, `why_good`, `headline_type` | ~15 |

### RAG complementar (`knowledge_*`)

| Tabela | O que armazena |
|---|---|
| `knowledge_documents` | Metadados dos docs ingeridos (PDFs, DOCX, TXT do Guia de Voz, livros, posts antigos) |
| `knowledge_chunks` | Chunks de ~1000 chars com **embedding vector(1536)** via `gemini-embedding-001` |

A função `match_knowledge(embedding, top_k, threshold, user_id)` usa pgvector cosine similarity pra retornar top chunks relevantes ao tema do post.

### Construção do prompt (`generate-content/index.ts`)

```
[1] PERSONA          — Marcos Piccini, voz que vem de dentro do sistema
[2] AVATAR ALVO      — estado/dor/gatilhos/example_phrases do avatar escolhido
[3] EDITORIAL        — name + description + structure_template + emotional_sequence
[4] POST DE REFERÊNCIA — se for adaptação cross-platform (companion post)
[5] ARSENAL ITEM     — title + summary + details do material selecionado
[6] FEW-SHOT EXAMPLES — 1-2 posts reais do mesmo editorial (image_quote + caption + why_good)
[7] DO / DONT / GENERAL — regras de estilo
[8] HEADLINE TYPES   — 4 opções com exemplo de cada
[9] CONTEXTO        — glossário + analogias + hashtags + 8 chunks RAG
[10] OUTPUT RULES   — JSON {quote, caption, headline_type_used, analogy_used}
```

---

## 🔄 Metodologia viva

Em vez de seed estático, o arsenal e os editoriais **evoluem** com curadoria humana no meio:

```
FONTES                 mine-content       bee_suggestions      /curadoria        VIVO
cortes de podcast  →   (Gemini destila →  (fila, pending)  →   humano aprova  →  bee_arsenal
docs / posts           candidatos)                             edita/rejeita     bee_example_posts
                                                                                  ↓ entra na geração
                                                                                  e ROTACIONA por frescor
```

- **`/editoriais`** — CRUD dos 8 pilares (os oficiais editáveis, slug travado, não apagáveis; criar novos integra na hora à geração).
- **`/arsenal`** — biblioteca viva: uso/frescor/ativo por item + frases-exemplo. O que está **ativo** entra na rotação.
- **`/curadoria`** — a fila de sugestões: aprovar/editar/rejeitar. **Portão humano obrigatório** — nada minerado entra na metodologia sem aprovação (protege a voz de derivar).
- **Feedback**: ao publicar um post, a frase vencedora vira candidata a few-shot (também passa pela curadoria).

## 🎙 Podcasts (`/podcasts`)

Fluxo dedicado de corte de podcast:
1. Vincula ao episódio do **YouTube** → `youtube-meta` puxa título + descrição.
2. Sobe o corte (TUS resumable) → `process-video` **transcreve na hora** → o corte é **guardado** (`podcast_clips`, aparece na Biblioteca, aba "Cortes").
3. Emenda na geração da caption e cria o(s) post(s), ligados ao corte e ao episódio.
4. Botão **Minerar** em cada corte → alimenta a Curadoria a partir da transcrição.

## ⚡ Piloto automático

Botão **"Automático"** (no Kanban e no topo do Novo post, ou deep-link `/posts/novo?auto=1`): com 1 clique o sistema **escolhe sozinho** o editorial (ponderado por frequência, evitando repetir o último), o arsenal (rotação do mais fresco), a rede social (alterna LI/IG) e o avatar — gera e entrega o **post pronto** no editor pra revisar/publicar.

---

## 🫀 A Alma

A psique do sistema — o princípio vivo que guia toda geração. Vive em `/alma` e é
**amoral por definição**: não julga certo/errado, sustenta possibilidades.

| Peça | Tabela | O que é |
|---|---|---|
| **O Self** | `alma_objetivo` | O objetivo, vivo e editável pelo criador. Guarda histórico (`is_current`) |
| **6 Dimensões** | `alma_dimensoes` | Totalidade, Essencialidade, Potencialidade, Integralidade, Maturidade, Vivacidade. Cada uma é uma **oitava**: olhar mecânico (armadilha) → olhar sistêmico (potência), medida em `oitava` 0–100 |
| **O Isso** | `alma_pulsoes` | As pulsões — o que a Alma quer antes de pensar |
| **A Sombra** | `alma_sombra` | O olhar mecânico como mecanismo de defesa (Negação, Projeção, Repressão, Racionalização) |
| **Complexos** | `alma_crencas` | Crenças vivas com força, estágio e evidências |
| **Pulso** | `alma_eventos` | **O barramento** — cada ação do sistema emite um evento aqui |

### Camada 0

O estado da Alma é destilado e injetado no **topo** do system prompt do
`generate-content`, antes da persona. É o que faz a Alma moldar cada post em vez
de ser uma tela decorativa.

### O barramento

`alma_eventos` é o que torna a Alma "o coração de tudo": qualquer feature nova
só precisa chamar `almaApi.emitEvento(...)` pra alimentar a psique. Já emitem:
geração de post, publicação, curadoria aprovada, correção e aprovação intacta.

---

## 🖼 Templates são dado

Um template define **como a IA monta a imagem** do post. Ele não é código nem
JSON estático: é **palco fixo + slots dinâmicos + regras**.

| Parte | O que é | Onde |
|---|---|---|
| **Palco** | fundo, logo, formas, textos fixos | `template_config.slides_json` (Fabric.js literal) |
| **Slots** | o que a IA preenche | `template_config.slides[].fields[]`, casados por `name` == `content_key` |
| **Regras** | como o slot se adapta ao conteúdo | `field.text_rules` |

### Por que as regras existem

O texto da IA tem tamanho imprevisível. Um template estático quebraria: uma frase
mais longa que a do design vazaria do canvas. O **motor de layout**
(`lib/templates/layout.ts`) escolhe o maior corpo de fonte que cabe em
`max_lines`, balanceia a quebra de linha (busca binária, semântica do CSS
`text-wrap: balance`), respeita pontuação e recentraliza pelo número **real** de
linhas.

```
config (banco) ─→ hydrateTemplate() ─→ motor de layout ─→ Fabric JSON ─→ canvas
```

### Editor de templates (`/templates`)

O mesmo Canvas Studio, em `templateMode`. Você desenha o palco e marca um
elemento como **campo dinâmico**; a geometria (âncora vertical, largura) é
**derivada do desenho** — você posiciona a caixa e as regras saem dali. Só os
limites tipográficos (máx. linhas, faixa de fonte, balancear) são explícitos.

- **Descrição do campo** — o briefing do slot, escrito pra IA: sem ele ela sabe
  onde pôr, mas não o quê.
- **Campo de imagem** — sobe uma imagem de exemplo e descreve o objetivo dela.
- **"Testar com: Curta / Média / Longa"** — roda o motor real no seu desenho.
  Você vê o template se defender de um texto grande **antes** de salvar.

### Armadilhas conhecidas (documentadas no código)

- O Fabric **não serializa props custom** no `toJSON()`. Use
  `toObject(FABRIC_CUSTOM_PROPS)` — senão `name`/`beeSlot` somem e o template
  perde os slots.
- `BeeSlotMeta.kind` **não pode se chamar `type`**: o Fabric enlivena qualquer
  valor aninhado com chave `type` e tentaria construir um objeto de texto a
  partir dos metadados, quebrando o `loadFromJSON`.
- O preview dos cards é **renderizado no cliente** do `template_config`, não
  guardado no banco: um PNG 1080×1350 em base64 por template incharia o `list()`.

---

## 🎯 Eficácia da IA e o portão da campanha

A **Campanha de conteúdo** gera e publica sozinha. Por isso ela nasce **travada**
e só abre quando a IA provar que escreve na voz da casa.

### O botão Aprovar é o instrumento de medição

Aprovar um post **sem tocar no texto** = a IA acertou. Aprovar **depois de
editar** = errou, e o diff vira lição. A régua é dura: **qualquer edição de texto
conta**. Mexer no canvas não conta — só `quote` e `caption`.

```
gerar (1..5 variações) → ai_generations + ai_variations (PRISTINO, imutável)
   ↓ você corrige
Aprovar → ai_reviews (original × final)  ──→ learn-from-correction
   ↓                                            ↓
ai_gate_status()                          ai_learnings (dedup por similaridade)
   ↓                                            ↓
campanha destrava aos 90%              entram no prompt da próxima geração
```

### As tabelas

| Tabela | Papel |
|---|---|
| `ai_generations` | 1 por geração — editorial, avatar, arsenal, briefing |
| `ai_variations` | O texto **original da IA. Imutável** — é o lado esquerdo de todo diff |
| `ai_reviews` | A medição, gravada no Aprovar. 1 por post (upsert) |
| `ai_learnings` | As lições destiladas. `ativo=true` entra no prompt; `evidencias` conta reforços |

### O portão (`ai_gate_status()`)

Vive **no banco**, não no front. Dois lados diferentes consultam — o frontend
(mostra o cadeado) e o `editorial-line-tick` (cron, sem sessão). Duas
implementações divergiriam e a campanha destravaria num lado só.

Exige **as duas** coisas:
- **30 posts revisados** (janela móvel)
- de **6 gerações distintas**

A 2ª regra existe porque as 5 variações de uma geração **não são independentes**
(mesmo editorial, mesmo arsenal, mesmo prompt): 20 posts de 4 gerações são 4
tentativas de verdade, não 20. E a janela é 30 e não 20 **por causa dela** — com
5 variações por geração, uma janela de 20 comporta no máximo 4 gerações (20/5) e
exigir 6 nela seria impossível.

### As 5 variações saem numa única chamada

O prompt é enorme (persona + arsenal + few-shot + RAG + Camada 0) e a saída é
curta. 5 variações no mesmo JSON custam ~8% a mais; 5 chamadas separadas
custariam ~5x. Medido: **1 variação levou 28s, 5 levaram 29s**.

O usuário escolhe **1 a 5** por geração. A régua é por post medido, então quem
gera de 1 em 1 precisa de 30 gerações pra destravar; de 5 em 5, precisa de 6.

### Dashboard (`/aprendizado`)

Percentual, o que falta pra destravar, as lições ativas (com liga/desliga) e as
correções recentes (o que a IA escreveu × o que você deixou).

### Dedup das lições — calibrado, não chutado

Sem dedup, 30 correções viram 30 lições quase-iguais e o prompt vira ruído — o
oposto de aprender. A similaridade (Jaccard sobre bigramas) foi **medida**:

| Par | Similaridade |
|---|---|
| Mesma lição, palavras diferentes | ~0.60 |
| Lições de fato diferentes | ≤0.29 |

Janela útil (0.29 .. 0.60] → limiar **0.45**. O primeiro valor tentado (0.72)
ficava **acima** do teto dos verdadeiros positivos: nada nunca deduplicaria.

---

## 🛠 Stack técnica

### Front-end
- **Vite 5** — bundler
- **React 18 + TypeScript** strict
- **Tailwind CSS** + **Radix UI** (shadcn-style components)
- **Lucide React** — ícones
- **Zustand** — state management (authStore, postStore, templateStore)
- **React Router 6**
- **Sonner** — toasts
- **Fabric.js v6** — Canvas Studio
- **TipTap** — rich text
- **TUS resumable** (`tus-js-client`) — upload de vídeos >50MB com retry

### Back-end (Supabase)
- **Postgres** + **pgvector** + **pg_cron** + **pg_net** + **Vault**
- **Auth** — PKCE flow
- **Storage** — bucket `media` (PNGs + vídeos)
- **Edge Functions** (Deno) — 10 funções

### IA
- **Gemini 3.5 Flash** — texto principal (fallback 3.1 Flash Lite → 3.1 Pro → 2.5 Pro)
- **Gemini Embedding 001** — RAG embeddings (1536 dim)
- **Gemini Files API** — transcrição de vídeo
- **Gemini Nano Banana** — geração de imagem (não usado no fluxo Frase)

### Infra
- **Netlify** — hospedagem do SPA
- **Supabase** — projeto privado, region SA

### Por que `lib/db.ts` em vez de supabase-js diretamente
A versão do `@supabase/supabase-js` em uso (2.46.x) tem um bug onde queries `.select()` ficam pendentes (hang) após `signIn` — provavelmente relacionado ao auto-refresh do JWT. O wrapper `lib/db.ts` usa `fetch` direto contra a REST PostgREST com o JWT do `authStore` e nunca hanga. `supabase-js` é usado **apenas pra auth** com `autoRefreshToken: false, flowType: 'pkce'`.

---

## 🚦 Pré-requisitos

- **Node.js 20+** (`nvm install 20`)
- **npm 10+**
- Conta **Supabase** + projeto criado
- **Supabase CLI** (`brew install supabase/tap/supabase`)
- Chave **Gemini API** ([Google AI Studio](https://aistudio.google.com/app/apikey))
- (Opcional) Conta **LinkedIn Developer**
- (Opcional) Conta **Meta for Developers** + IG Business
- (Opcional) **Netlify CLI** pra deploy (`npm i -g netlify-cli`)

---

## ⚡ Setup local (passo-a-passo)

### 1. Clonar e instalar

```bash
git clone git@github.com:SEU_USER/bee-platform.git
cd bee-platform
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Edita `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

> Pega esses 2 valores em **Supabase Dashboard → Settings → API**.

### 3. Aplicar migrations no Supabase

Existem 9 migrations em `supabase/migrations/`. Aplica na ordem:

**Opção A — via CLI:**
```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

**Opção B — via Dashboard:**
Cola cada `.sql` no SQL Editor, rode na ordem:
1. `20260527_rag_setup.sql` — pgvector + tabelas RAG + função `match_knowledge`
2. `20260527_bee_editorial_arch.sql` — todas as tabelas `bee_*` + seed de 8 editoriais, arsenal, glossário, etc
3. `20260527_bee_avatar_examples.sql` — avatares (Identificado / Incomodado) + example phrases
4. `20260528_products_editorial_lines.sql` — `bee_products` + `editorial_lines` + cron tick setup
5. `20260604_arsenal_diagnostico_sistemico.sql` — adiciona 11 padrões corporativos como arsenal pra Diagnóstico Sistêmico
6. `20260604_publish_integrations.sql` — colunas em `user_settings` (tokens) e `user_posts` (tracking de publicação)
7. `20260609000001_bee_editorials_crud.sql` — `is_system` + policies de escrita pra editar/criar editoriais pela UI
8. `20260609000002_podcasts.sql` — `podcasts` + `podcast_clips` (cortes + transcrição)
9. `20260610000001_living_methodology.sql` — lifecycle em `bee_arsenal`/`bee_example_posts` + fila `bee_suggestions` + RPCs de uso

> ⚠️ **Nota sobre versões colididas**: as migrations antigas usam prefixo de data de 8 dígitos (várias `20260527_*`), e os seeds não têm todos `ON CONFLICT`. Se o histórico remoto estiver vazio, **não** rode `db push` cego (duplicaria seed). Aplique só as migrations novas (idempotentes) isolando-as, ou use o SQL Editor.

### 4. Criar bucket `media` no Storage

Supabase Dashboard → Storage → **New bucket** → nome `media` → public OFF → criar.

Adicionar política RLS pro user gerenciar só seus arquivos:

```sql
CREATE POLICY "user_owns_media" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### 5. Configurar secrets das edge functions

```bash
supabase secrets set GEMINI_API_KEY=AIzaSyXXX...
supabase secrets set GEMINI_MODEL=gemini-3.5-flash  # opcional, default já é flash
supabase secrets set RAG_TOP_K=8                     # opcional
supabase secrets set RAG_THRESHOLD=0.25              # opcional
supabase secrets set YOUTUBE_API_KEY=AIzaSyYYY...    # opcional — sem ela, youtube-meta usa oEmbed + scrape
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são auto-injetadas pelo Supabase.

### 6. Deploy das edge functions

```bash
npx supabase functions deploy generate-content generate-image-ai \
  generate-caption-from-video process-video hybrid-image-search \
  ingest-document search-knowledge editorial-line-tick \
  download-proxy publish-post youtube-meta mine-content
```

### 7. Configurar pg_cron (publicação agendada futura)

No SQL Editor, com extensão habilitada:

```sql
SELECT cron.schedule(
  'editorial-line-tick',
  '0 * * * *',  -- toda hora cheia
  $$
  SELECT net.http_post(
    url := 'https://SEU_PROJETO.supabase.co/functions/v1/editorial-line-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  );
  $$
);
```

> Pré-requisito: salvar service_role no Vault uma vez: `SELECT vault.create_secret('SEU_SERVICE_ROLE_KEY', 'service_role_key');`

### 8. Rodar local

```bash
npm run dev
```

Abre http://localhost:5173 → cria conta → começa a usar.

### 9. (Opcional) Ingerir documentos pro RAG

Acessa `/conhecimento` → upload de PDFs/DOCX/TXT (Guia de Voz, livros, posts antigos). A IA fica muito melhor com 50+ docs ingeridos.

---

## 📁 Estrutura de pastas

```
bee-platform/
├── public/
│   ├── bee-spiral.png              # Logo espiral oficial honey
│   └── ...
├── scripts/                        # Utilitários (seed, parsers)
├── src/
│   ├── components/
│   │   ├── editor/
│   │   │   └── canvas-studio/      # Canvas Studio (editor tipo Canva)
│   │   │       ├── CanvasStudio.tsx
│   │   │       ├── CanvasArea.tsx
│   │   │       ├── EmbeddedToolbar.tsx
│   │   │       ├── PropertiesPanel.tsx
│   │   │       ├── SidebarLeft.tsx
│   │   │       ├── Toolbar.tsx
│   │   │       ├── useEditor.ts    # Hook central — Fabric + history + zoom
│   │   │       └── panels/         # Templates|Campos / Texto / Elementos / Uploads / Marca
│   │   ├── layout/                 # Sidebar, AppShell
│   │   ├── shared/                 # PlatformBadge, StatusBadge, etc
│   │   └── ui/                     # shadcn-style: Button, Card, Input, Select…
│   ├── lib/
│   │   ├── api.ts                  # postApi, kanbanApi, beeApi, productApi, etc
│   │   ├── db.ts                   # REST wrapper (bypassa supabase-js hang bug)
│   │   ├── edge.ts                 # Helpers pra chamar edge functions com JWT
│   │   ├── storage.ts              # Upload de imagem + vídeo (TUS)
│   │   ├── supabase.ts             # Client config
│   │   ├── templates/
│   │   │   └── beeQuote.ts         # Template Bee Quote (hidratação Fabric JSON)
│   │   └── utils.ts                # cn (Tailwind merge), helpers
│   ├── pages/
│   │   ├── Dashboard.tsx           # Hub + kanban editorial (KanbanBoard)
│   │   ├── posts/
│   │   │   ├── NewPost.tsx         # Wizard imagem — gera 1..5 variações
│   │   │   ├── NewVideoPost.tsx    # Wizard vídeo
│   │   │   └── PostEditor.tsx      # Edit + Canvas Studio embedded + Aprovar + Publicar
│   │   ├── templates/              # /templates — galeria + editor de templates
│   │   ├── alma/Alma.tsx           # /alma — a psique do sistema
│   │   ├── aprendizado/            # /aprendizado — dashboard de eficácia da IA
│   │   ├── linhas/                 # Campanha de conteúdo (atrás do portão)
│   │   ├── produtos/               # Produtos (pre/launch/post-launch)
│   │   ├── conhecimento/           # Upload pra RAG
│   │   ├── biblioteca/             # Biblioteca de assets
│   │   ├── settings/
│   │   │   └── SettingsPage.tsx    # Perfil / Voz / Branding / Integrações
│   │   └── onboarding/             # First-time setup
│   ├── components/
│   │   ├── posts/KanbanBoard.tsx   # Kanban (6 colunas) — vive no Dashboard
│   │   └── ai/GateLock.tsx         # Tela de campanha travada
│   ├── lib/templates/              # layout (motor) · hydrate · slots · resolve · extract
│   ├── store/                      # Zustand: authStore, postStore, templateStore
│   ├── types/index.ts              # TypeScript: UserPost, PostTemplate, Ai*, Alma*…
│   ├── App.tsx                     # Router + ProtectedRoute + AppShell
│   ├── main.tsx                    # Entry
│   └── index.css                   # Tailwind base + tema Bee
├── supabase/
│   ├── functions/                  # 10 edge functions
│   │   ├── _shared/                # security.ts, embed.ts, chunker.ts
│   │   ├── generate-content/
│   │   ├── generate-image-ai/
│   │   ├── generate-caption-from-video/
│   │   ├── process-video/
│   │   ├── hybrid-image-search/
│   │   ├── ingest-document/
│   │   ├── search-knowledge/
│   │   ├── editorial-line-tick/
│   │   ├── publish-post/
│   │   └── download-proxy/
│   └── migrations/                 # 6 SQL migrations
├── netlify.toml                    # Config Netlify SPA + headers
├── tailwind.config.ts              # Tema Bee (cores, fontes)
├── tsconfig.json
├── vite.config.ts
└── package.json
```

---

## 🗄 Banco de dados

### Tabelas principais

| Tabela | Propósito |
|---|---|
| `profiles` | User profile (name, avatar_color) — 1:1 com auth.users |
| `user_settings` | Settings por user (tokens API, persona, tone, branding, **linkedin_token**, **instagram_access_token**, etc) |
| `user_posts` | Posts criados — platform, format, caption, carousel_fabric_json, rendered_slides, **published_url** |
| `post_templates` | Templates visuais. `slug` = chave estável dos de sistema (`bee-quote-portrait/square/landscape`); `template_config` = palco + slots + regras |
| `post_drafts` | Rascunhos auto-save (snapshot do canvas) |
| `kanban_columns` | Colunas do Kanban por user |
| `bee_*` | 8 tabelas da arquitetura editorial (descritas acima) |
| `knowledge_documents` + `knowledge_chunks` | RAG |
| `bee_products` | Produtos pra referência em posts (pre/launch/post-launch) |
| `editorial_lines` + `editorial_line_runs` | Campanhas recorrentes |
| `usage_logs` | Tracking de uso de IA por user (tokens, custo aprox) |
| `podcasts` | Episódios (1 por vídeo do YouTube — title/description puxados do YouTube) |
| `podcast_clips` | Cortes subidos: video_path, **transcript** guardada, vínculo ao podcast e ao post gerado |
| `bee_suggestions` | **Fila de curadoria** — material minerado pela IA aguardando aprovação humana (kind: arsenal/example_post/analogy) |
| `alma_*` | **A Alma** — 7 tabelas: `alma_objetivo`, `alma_dimensoes`, `alma_pulsoes`, `alma_sombra`, `alma_crencas`, `alma_estado` e `alma_eventos` (o barramento) |
| `ai_generations` + `ai_variations` | Cada geração e o texto **pristino** da IA (imutável — o lado esquerdo de todo diff) |
| `ai_reviews` | A medição gravada no Aprovar: original × final, `changed` |
| `ai_learnings` | Lições destiladas das correções. Entram no prompt quando `ativo` |

**Função**: `ai_gate_status(uuid)` — o portão da campanha. Vive no banco porque o frontend e o cron precisam enxergar a MESMA regra.

**Status de post**: `idea` · `draft` · `pending_approval` · `approved` · `scheduled` · `published` · `archived`. Todo post gerado nasce em `pending_approval` e só sai por decisão humana (Aprovar) — é o que mede a eficácia.

**Metodologia viva** (`bee_arsenal` e `bee_example_posts` ganharam lifecycle): `is_active`, `usage_count`, `last_used_at`, `performance_score`. A geração rotaciona o material ativo por frescor (menos usado primeiro) e marca o uso — cada post sai diferente.

### Conventions

- **PKs**: `UUID` com `gen_random_uuid()`
- **RLS**: tudo com user_id é filtrado por `auth.uid()`
- **Timestamps**: `created_at`, `updated_at` automáticas via trigger
- **JSON columns**: `metadata` JSONB em quase todas as tabelas pra extensibilidade

---

## 🚢 Edge Functions

| Função | Input | Output | Modelo |
|---|---|---|---|
| `generate-content` | `{editorial_slug, arsenal_item_id?, target_avatar?, briefing?, target_platform?, reference_post_id?, variations?}` | `{variations: [{quote, caption, headline_type_used, analogy_used, virality_score, virality_reason}], ...primeira}` | Gemini 3.5 Flash (chain fallback). `variations` 1..5 numa **única chamada** (ângulos distintos), cada uma com **nota de viralização 0–100**. Sem `arsenal_item_id` → **rotaciona** o arsenal ativo mais fresco e marca uso |
| `generate-script` | `{editorial_slug?, target_avatar?, platform?, briefing?}` | `{titulo, roteiro, model_used}` — roteiro de vídeo (GANCHO/DESENVOLVIMENTO/VIRADA/CTA) | Gemini Flash chain |
| `learn-from-feedback` | `{post_id?, feedback_text, quote_original, caption_original, facet_focus?, …}` | `{learnings: [...]}` — destila a lição de um feedback **explícito** (ex: "corte as intros") e comita na hora (dedup por faceta×alcance) | Gemini Flash chain |
| `voice-coach` | `{messages, focus?}` | `{reply, proposals: [...]}` — agente conversacional que **propõe** lições (o usuário confirma) | Gemini Flash chain |
| `commit-learning` | `{texto, categoria, facet, scope, chat_message_id?}` | `{reforcou, learning_id, texto}` — grava uma lição confirmada (dedup) | — |
| `generate-persona` | `{base?, hints?}` | `{persona: {...}}` — cria uma pessoa inteira a partir de um público-base (não salva) | Gemini Flash chain |
| `persona-chat` | `{persona, messages, post?}` | `{reply}` — simulação de público: a persona responde EM PERSONAGEM (opcional: vê o post via visão) | Gemini Flash chain |
| `suggest-audience` | `{name, description, objetivo?, tom?}` | `{audience: {...}}` — a IA propõe o público-alvo de um editorial | Gemini Flash chain |
| `youtube-meta` | `{url}` | `{video_id, title, description, channel, thumbnail_url}` | oEmbed + scrape (ou YouTube Data API se `YOUTUBE_API_KEY`) |
| `mine-content` | `{text, source_type?, source_id?, editorial_hint?}` | `{created, skipped}` — destila candidatos pra `bee_suggestions` | Gemini Flash chain |
| `generate-caption-from-video` | `{transcript, visual_summary, content_type, editorial_slug?, …}` | `{caption}` | Gemini Flash chain |
| `process-video` | `{storage_path, mime_type, content_type}` | `{transcript, visual_summary, detected_content_type, model_used}` | Gemini Files API + Pro |
| `ingest-document` | `{path, mime_type, title}` | `{document_id, chunks_count}` | Gemini Embedding 001 |
| `search-knowledge` | `{query, match_count?, match_threshold?}` | `{results: [...]}` | Gemini Embedding 001 + RPC pgvector |
| `editorial-line-tick` | (cron) | Cria posts agendados. **Consulta `ai_gate_status` e pula linhas travadas** | — |
| `learn-from-correction` | `{review_id}` | `{learnings: [{texto, categoria, reforcou}]}` — destila a regra por trás da correção, deduplicando contra as existentes | Gemini Flash chain (temp 0.3) |
| `hybrid-image-search` | `{query, limit}` | Pexels + Unsplash results | — |
| `generate-image-ai` | `{prompt, aspect}` | Image URL | Gemini Nano Banana |
| `download-proxy` | `{url}` | Image blob (CORS bypass) | — |
| `publish-post` | `{post_id}` | `{published_url, published_id, platform}` | LinkedIn UGC API / IG Graph API |

Todas as funções:
- Verificam JWT do user (`userIdFromAuth`) — **e `verify_jwt=true` na plataforma**
- Aplicam rate limit em memória (`checkRateLimit`)
- Logam uso em `usage_events` quando aplicável
- Retornam CORS-friendly responses

> ⚠️ **Nunca faça deploy com `--no-verify-jwt`.** `userIdFromAuth` decodifica o
> JWT **sem verificar a assinatura** (a plataforma já verificou). Sem
> `verify_jwt`, qualquer um forja `{"sub": "<id>"}` e age como outro usuário,
> queimando a chave Gemini dele.

### Identidade serviço→serviço

O JWT do `service_role` **não tem `sub`**, então `userIdFromAuth` devolve null e
a função responde 401 — era por isso que o `editorial-line-tick` (cron, sem
sessão) nunca conseguiu gerar um post. O cron agora diz por quem age via header
`x-bee-user-id`, aceito **só** quando o Bearer é exatamente a `service_role`
(`internalUserId`, em `_shared/security.ts`). Um cliente não consegue forjar:
não tem a chave.

---

## 🎨 Canvas Studio (editor visual)

Editor tipo Canva construído sobre **Fabric.js v6**, sem libs pesadas extras.

### Layout
```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar (back · title · preset · undo/redo · zoom · save)    │
├──┬─────────┬─────────────────────────────────┬──────────────┤
│  │         │                                 │              │
│  │ Painel  │           Canvas                │ Properties   │
│  │ ativo   │         (zoom CSS)              │   Panel      │
│  │         │                                 │              │
│ Sidebar    │                                 │              │
│ Left       │                                 │              │
└──┴─────────┴─────────────────────────────────┴──────────────┘
```

### Sidebar Left — 5 painéis
1. **Templates** — Bee Quote 4:5, 1:1, Em branco 4:5 e 1:1
2. **Texto** — 5 presets (Título, Subtítulo, Frase de impacto, Parágrafo, Pequeno) + 8 fontes
3. **Elementos** — Formas (retângulo, círculo, triângulo, linha), Espiral Bee, Separadores
4. **Uploads** — Drag-drop + galeria persistida em localStorage
5. **Marca** — Paleta Bee oficial + 3 variantes do logo + fontes oficiais

### Properties Panel
- **Texto**: fonte, tamanho, cor, line-height, bold/italic/align
- **Forma**: fill, stroke (cor + espessura), border-radius (retângulo)
- **Imagem**: **filtro BlendColor pra tingir** (preset Original/Navy/Creme/Branco + cor livre)
- **Geral**: posição X/Y, tamanho W/H, rotação (-180°/+180°), opacidade, camadas (top/up/down/bottom), lock/unlock

### Presets de canvas
| Slug | Dimensões | Uso |
|---|---|---|
| `linkedin-portrait` | 1080×1350 | LinkedIn 4:5 padrão |
| `linkedin-square` | 1200×1200 | LinkedIn quadrado |
| `instagram-portrait` | 1080×1350 | IG 4:5 |
| `instagram-square` | 1080×1080 | IG quadrado |
| `instagram-story` | 1080×1920 | Story / Reel 9:16 |

### Zoom — CSS transform
Canvas mantém **dimensões nativas** sempre (1080×1350). O wrapper externo recebe `transform: scale(zoom)` — assim o hit-testing do Fabric continua perfeito e não há rerender custoso ao zoomar.

### Modo `embedded`
Quando usado dentro do `PostEditor`:
- Esconde a Toolbar principal (back/title/save)
- Usa `EmbeddedToolbar` compacta (preset/undo/redo/zoom/download)
- `h-full` em vez de `h-screen`

---

## 📱 Integrações de publicação (LinkedIn + Instagram)

Pra uso interno — você gera tokens manualmente e cola na UI de Configurações.

### LinkedIn

**Pré-requisito:** uma LinkedIn Page associada (crie em https://www.linkedin.com/company/setup/new/).

1. Criar app em https://www.linkedin.com/developers/apps
2. Em **Products**, ativa:
   - ✅ Sign In with LinkedIn using OpenID Connect
   - ✅ Share on LinkedIn
3. Aba **Auth** → OAuth 2.0 Tools → **Token Generator**
4. Scopes: `w_member_social`, `openid`, `profile`, `email`
5. Copia o **access_token** (60 dias)
6. Cola em **Configurações → Integrações → LinkedIn**
7. Clica **Testar conexão** — vai detectar e auto-preencher o **Author URN** (`urn:li:person:XXX`)

Pra postar como Page (não pessoal): use URN `urn:li:organization:{page_id}`.

### Instagram

**Pré-requisitos rígidos:**
- IG Business ou Creator (não pessoal)
- IG conectado a Facebook Page (via Meta Business Suite)

1. Criar app em https://developers.facebook.com/apps (tipo Business)
2. Add Product: **Instagram → Instagram Graph API**
3. No **Graph API Explorer**:
   - Generate Token com scopes: `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
   - `GET /me/accounts` → copia o `id` da Page que tem o IG
   - `GET /{page_id}?fields=instagram_business_account` → copia `instagram_business_account.id` (**IG Business Account ID**)
4. Troca o token short-lived por long-lived (60 dias):
   ```
   GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app_id}&client_secret={app_secret}&fb_exchange_token={short_token}
   ```
5. Troca de novo por Page Access Token (**não expira**):
   ```
   GET /{page_id}?fields=access_token&access_token={user_long_token}
   ```
6. Cola em **Configurações → Integrações → Instagram**
7. Clica **Testar conexão** — vai chamar o Graph e confirmar

### Limites

- LinkedIn: ~100 posts/dia/user, 60s+ entre posts
- Instagram: 100 posts/24h/conta, vídeo precisa ser processado (polling até FINISHED)

---

## 💰 Custos estimados

Para 1 post de **Frase Bee Quote** (LinkedIn ou IG):

| Componente | Custo |
|---|---|
| Gemini 3.5 Flash (text gen) | **~R$ 0,012** |
| Gemini Embedding (RAG query) | <R$ 0,00003 |
| Geração de imagem | **R$ 0,00** (template-based) |
| Supabase | desprezível por post (plano fixo) |
| **Total** | **~R$ 0,01–0,02 por post** |

### Escala
| Volume | Custo Gemini/mês |
|---|---|
| 100 posts | R$ 1,20 |
| 500 posts | R$ 6,00 |
| 1.000 posts | R$ 12,00 |
| 5.000 posts | R$ 60,00 |

> Posts de vídeo custam mais (~R$ 0,30–1,50) por causa da transcrição via Gemini Files API.
> Usage logs em `usage_logs` permitem auditoria precisa.

---

## 🚀 Deploy

### Netlify (recomendado)

Arquivo `netlify.toml` já configurado com SPA redirect.

**Via CLI:**
```bash
npm install -g netlify-cli
netlify login
npm run build
netlify deploy --prod --dir=dist
```

**Via drag-drop:**
1. `npm run build`
2. Arrasta a pasta `dist/` em https://app.netlify.com/drop

**Via GitHub:**
1. Conecta o repo no Netlify Dashboard
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Env vars: cole `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`

### Edge functions

Sempre que mudar uma function, redeploy:
```bash
npx supabase functions deploy NOME_DA_FUNCTION
```

Ou todas de uma vez:
```bash
npx supabase functions deploy generate-content generate-image-ai generate-caption-from-video process-video hybrid-image-search ingest-document search-knowledge editorial-line-tick download-proxy publish-post
```

---

## 🧰 Comandos úteis

```bash
# Dev server
npm run dev

# Build de produção
npm run build

# Preview do build local
npm run preview

# Lint
npm run lint

# Typecheck explícito (sem emit)
npx tsc --noEmit

# Supabase
supabase link --project-ref XXX           # vincular ao projeto
supabase db push                          # aplicar migrations
supabase functions deploy FN_NAME         # deploy função
supabase secrets list                     # ver secrets
supabase secrets set KEY=VALUE            # setar secret
supabase functions logs FN_NAME --since=10m   # logs

# Git
git add -A
git commit -m "feat: ..."
git push origin main
```

---

## 🛣 Roadmap

### Implementado ✅
- [x] Auth com Supabase (PKCE)
- [x] Kanban editorial com drag-drop nativo
- [x] Wizard de criação de post (imagem)
- [x] Multi-plataforma (LI + IG simultâneo via companion_post_id)
- [x] Wizard de criação de post (vídeo) — TUS resumable upload
- [x] Canvas Studio (editor visual completo)
- [x] Templates Bee Quote (4:5, 1:1, em branco)
- [x] Painel Marca (paleta + logo + fontes)
- [x] Tint de cor em imagens (BlendColor filter)
- [x] RAG (12k+ chunks via pgvector)
- [x] Geração de conteúdo (8 editoriais Bee + arsenal + few-shot)
- [x] Adaptação cross-platform (referenciar post LI no IG e vice-versa)
- [x] Linhas Editoriais (campanhas recorrentes via pg_cron)
- [x] Produtos (pre/launch/post-launch references)
- [x] Integração de publicação LinkedIn + Instagram
- [x] Botão "Publicar agora" no PostEditor
- [x] Aba "Integrações" em Settings com test connection
- [x] **Frase do template**: quebra de linha balanceada (measureText + busca binária, evita órfãs)
- [x] **Editoriais editáveis** (`/editoriais`) — CRUD dos 8 pilares, integra na hora à geração
- [x] **Fluxo de podcast** (`/podcasts`) — vínculo YouTube + transcrição guardada + cortes na Biblioteca
- [x] **Metodologia viva** — mineração IA (`mine-content`) + fila `bee_suggestions` + curadoria humana (`/curadoria`)
- [x] **Lifecycle + rotação** do arsenal/exemplos (uso/frescor/ativo) na geração
- [x] **Piloto automático** — 1 botão escolhe tudo e entrega o post pronto
- [x] **A Alma** (`/alma`) — psique amoral, 6 dimensões como oitavas, Camada 0 no prompt, barramento de eventos
- [x] **Templates são dado** — editor de templates (`/templates`) com slots dinâmicos, descrição de campo, imagem de exemplo e teste curta/longa
- [x] **Eficácia da IA** — 5 variações por geração (1..5 à escolha), medição via Aprovar, portão de 90%, dashboard `/aprendizado`
- [x] **Aprendizado por correção** (`learn-from-correction`) — destila lições das suas edições, deduplica e injeta no prompt
- [x] **Campanha autônoma atrás do portão** — o cron (`editorial-line-tick`) respeita `ai_gate_status`
- [x] **Aprendizado por feedback explícito** (`learn-from-feedback`) — você diz o que corrigir, a IA aprende na hora e regenera
- [x] **Coach de voz** (`/coach`) — agente conversacional que propõe lições; confirmação humana (`commit-learning`)
- [x] **Simulação de público** (`/personas`) — personas geradas por IA respondem ao seu post em personagem
- [x] **Wizard de geração em lote** — 3–5 posts por vez, código único, **nota de viralização (0–100)**, título/legenda aprovados individualmente, Agendar ou Stand-by
- [x] **Métricas de inteligência da IA** — `ai_edit_rounds` (correções da IA) + `manual_edits` (edições humanas) por post
- [x] **Fluxo de vídeo** — upload + transcrição → legenda pronta; e geração de **roteiro** pra gravar
- [x] **Agenda de conteúdo** (`/agenda`) — calendário estilo Google Agenda, stand-by arrastável, **distribuição automática** (horário por rede + ritmo da editoria + config editável), filtros por plataforma/editoria, cor por editoria (customizável)

### Em backlog 🚧
- [ ] **Publicação agendada via pg_cron tick** — varrer posts `scheduled` com `scheduled_date <= now()` e disparar publish-post (a Agenda hoje agenda; a publicação automática é o próximo passo)
- [ ] **Dashboard de custos** — agregação de `usage_logs` por mês com gráfico
- [ ] **Refresh automático do token LinkedIn** (60d)
- [ ] **Carrossel** (10 slides) pra LinkedIn e IG
- [ ] **Stories IG** (story-only template)
- [ ] **Analytics pós-publicação** (likes, comments via webhook)
- [ ] **Multi-tenant** (hoje é single user/single Bee account)
- [ ] **OAuth flow** (em vez de tokens manuais) — necessário se evoluir pra SaaS público

---

## 🩹 Troubleshooting

### "Login eterno" / spinner que não passa
Bug do `supabase-js` 2.46. Já mitigado pelo `lib/db.ts`. Se ocorrer: tenta logout + login. Em último caso, limpa localStorage e reabre.

### "Generate-content HTTP 500: SyntaxError unterminated string in JSON"
Gemini truncou a resposta. O `parseGeminiJson` tenta recover com `tryRecoverTruncatedJson`. Se persistir, a chain de fallback tenta Flash-Lite → Pro → 2.5-pro automaticamente.

### "Sem arsenal mapeado pra este editorial"
A tabela `bee_arsenal` não tem rows pra esse editorial slug. Cheque com:
```sql
SELECT editorial_slug, COUNT(*) FROM bee_arsenal GROUP BY editorial_slug;
```
Se faltar pro editorial X, rode um INSERT seedando.

### "Imagem não renderizada. Clica em Exportar"
Antes de publicar você precisa clicar **Exportar** no header do PostEditor pra subir o PNG pro Storage. O `published_url` do post depende de ter o `rendered_slides.slide1` populado.

### Token LinkedIn expirou (60 dias)
Volta no LinkedIn Developer → Token Generator → gera outro → cola em Settings.

### Vídeo IG falha com timeout
Container pode demorar > 5min processando. Aumenta `TIMEOUT_MS` em `publish-post/index.ts`. Ou tenta vídeo menor.

### Build de produção com warning "chunks > 500KB"
Esperado. `pdfjs-dist` e `fabric` são pesados. Pra otimizar: `manualChunks` em `vite.config.ts`.

---

## 📜 Licença

**Proprietário — Bee Consulting.** Uso interno apenas. Não distribuir.

---

## ✍️ Créditos

- Stack: React + Vite + Supabase + Gemini
- Voz Bee codificada por: **Marcos Piccini** (Guia de Voz)
- Plataforma desenvolvida pra: **Bee Consulting**
- Espiral honey: identidade visual oficial da Bee
