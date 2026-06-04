# Plataforma Bee Consulting

> Plataforma interna de criação e publicação de conteúdo da Bee Consulting — consultoria sistêmica de liderança liderada por **Marcos Piccini**.

Uma SaaS-like de criação de posts pra LinkedIn e Instagram, fundamentada em RAG e na arquitetura editorial proprietária da Bee. A IA gera **só o conteúdo** (frase + caption); o sistema substitui a frase num template visual editável (sem custo de geração de imagem).

---

## 📑 Índice

- [Visão geral](#-visão-geral)
- [Arquitetura](#-arquitetura)
- [A arquitetura editorial Bee](#-a-arquitetura-editorial-bee)
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
- **Voz consistente** — IA recebe ~5–10k chars de contexto Bee em cada chamada (persona + editorial + few-shot + style rules + RAG).
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

Existem 6 migrations em `supabase/migrations/`. Aplica na ordem:

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
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são auto-injetadas pelo Supabase.

### 6. Deploy das edge functions

```bash
npx supabase functions deploy generate-content generate-image-ai \
  generate-caption-from-video process-video hybrid-image-search \
  ingest-document search-knowledge editorial-line-tick \
  download-proxy publish-post
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
│   │   │       └── panels/         # Templates / Texto / Elementos / Uploads / Marca
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
│   │   ├── posts/
│   │   │   ├── PostsKanban.tsx     # Kanban editorial com drag-drop nativo
│   │   │   ├── NewPost.tsx         # Wizard imagem
│   │   │   ├── NewVideoPost.tsx    # Wizard vídeo
│   │   │   └── PostEditor.tsx      # Edit + Canvas Studio embedded + Publicar
│   │   ├── editor/EditorPage.tsx   # /editor standalone
│   │   ├── linhas/                 # Linhas editoriais (campanhas recorrentes)
│   │   ├── produtos/               # Produtos (pre/launch/post-launch)
│   │   ├── conhecimento/           # Upload pra RAG
│   │   ├── biblioteca/             # Biblioteca de assets
│   │   ├── settings/
│   │   │   └── SettingsPage.tsx    # Perfil / Voz / Branding / Integrações
│   │   └── onboarding/             # First-time setup
│   ├── store/                      # Zustand: authStore, postStore, templateStore
│   ├── types/index.ts              # TypeScript: UserPost, UserSettings, BeeEditorial…
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
| `post_templates` | Templates visuais reutilizáveis (Bee Quote, Carousel, etc) |
| `post_drafts` | Rascunhos auto-save (snapshot do canvas) |
| `kanban_columns` | Colunas do Kanban por user |
| `bee_*` | 8 tabelas da arquitetura editorial (descritas acima) |
| `knowledge_documents` + `knowledge_chunks` | RAG |
| `bee_products` | Produtos pra referência em posts (pre/launch/post-launch) |
| `editorial_lines` + `editorial_line_runs` | Campanhas recorrentes |
| `usage_logs` | Tracking de uso de IA por user (tokens, custo aprox) |

### Conventions

- **PKs**: `UUID` com `gen_random_uuid()`
- **RLS**: tudo com user_id é filtrado por `auth.uid()`
- **Timestamps**: `created_at`, `updated_at` automáticas via trigger
- **JSON columns**: `metadata` JSONB em quase todas as tabelas pra extensibilidade

---

## 🚢 Edge Functions

| Função | Input | Output | Modelo |
|---|---|---|---|
| `generate-content` | `{editorial_slug, arsenal_item_id?, target_avatar?, briefing?, target_platform?, reference_post_id?}` | `{quote, caption, headline_type_used, analogy_used}` | Gemini 3.5 Flash (chain fallback) |
| `generate-caption-from-video` | `{transcript, visual_summary, content_type, editorial_slug?, …}` | `{caption}` | Gemini Flash chain |
| `process-video` | `{storage_path, mime_type, content_type}` | `{transcript, visual_summary, detected_content_type, model_used}` | Gemini Files API + Pro |
| `ingest-document` | `{path, mime_type, title}` | `{document_id, chunks_count}` | Gemini Embedding 001 |
| `search-knowledge` | `{query, match_count?, match_threshold?}` | `{results: [...]}` | Gemini Embedding 001 + RPC pgvector |
| `editorial-line-tick` | (cron) | Cria posts agendados | — |
| `hybrid-image-search` | `{query, limit}` | Pexels + Unsplash results | — |
| `generate-image-ai` | `{prompt, aspect}` | Image URL | Gemini Nano Banana |
| `download-proxy` | `{url}` | Image blob (CORS bypass) | — |
| `publish-post` | `{post_id}` | `{published_url, published_id, platform}` | LinkedIn UGC API / IG Graph API |

Todas as funções:
- Verificam JWT do user (`userIdFromAuth`)
- Aplicam rate limit em memória (`checkRateLimit`)
- Logam uso em `usage_logs` quando aplicável
- Retornam CORS-friendly responses

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

### Em backlog 🚧
- [ ] **Publicação agendada via pg_cron tick** — varrer posts `scheduled` com `scheduled_date <= now()` e disparar publish-post
- [ ] **Dashboard de custos** — agregação de `usage_logs` por mês com gráfico
- [ ] **Refresh automático do token LinkedIn** (60d)
- [ ] **Carrossel** (10 slides) pra LinkedIn e IG
- [ ] **Stories IG** (story-only template)
- [ ] **A/B testing de variantes de caption**
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
