-- MOTOR FOTOGRÁFICO DA HIVE (fotos do Marcos) — docs/fotografia/01–06.
-- Constituição Fotográfica Global v1.0 + Perfil Visual Marcos Piccini v1.1 +
-- estilos F01–F04. Aditiva e idempotente; aplicada via SQL (Management API).

-- Biblioteca de REFERÊNCIAS por nível (Perfil §11–12): A0 aparência atual,
-- A identidade/expressão, B/C apoio, D anatomia/fala histórica.
CREATE TABLE IF NOT EXISTS public.photo_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id text NOT NULL DEFAULT 'marcos_piccini',
  ref_key text NOT NULL,                       -- chave do manifesto (ex.: HAR_0472, 20260923_152032, OPENHIVE_61)
  priority text NOT NULL CHECK (priority IN ('A0', 'A', 'B', 'C', 'D')),
  roles text[] NOT NULL DEFAULT '{}',
  url text NOT NULL,
  storage_path text,
  asset_id uuid REFERENCES public.design_assets(id) ON DELETE SET NULL,
  file_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producer_id, ref_key)
);

-- Cada imagem do motor (Constituição §12 + metadados dos estilos).
CREATE TABLE IF NOT EXISTS public.photo_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id text NOT NULL DEFAULT 'marcos_piccini',
  producer_profile_version text NOT NULL,
  post_id uuid REFERENCES public.user_posts(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.photo_generations(id) ON DELETE SET NULL,   -- ajuste/nova tentativa
  purpose text NOT NULL DEFAULT 'post' CHECK (purpose IN ('post', 'validation_board')),
  origin text NOT NULL CHECK (origin IN ('real', 'adaptada', 'gerada')),
  source_ref_keys text[] NOT NULL DEFAULT '{}',
  style_id text, variant_id text, expression_id text, wardrobe_id text, environment_id text,
  gaze text, crop text, text_space text, aspect text,
  mother_text text,
  content_semantics jsonb,
  plan jsonb,                                    -- seleção completa (razões, pontuações, penalidades, suficiência)
  prompt text,
  model text,
  image_url text, storage_path text, width int, height int,
  attempt int NOT NULL DEFAULT 1,
  gates jsonb,                                   -- leitura visual G0–G5 + portões do estilo
  auto_status text CHECK (auto_status IN ('aprovada', 'revisar', 'rejeitada')),
  hard_fail text,
  identity_status text, realism_status text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'adjust', 'rejected')),
  reviewer_notes text,
  approved_by uuid, approved_at timestamptz,
  library_asset_id uuid REFERENCES public.design_assets(id) ON DELETE SET NULL,  -- entra na biblioteca válida ao aprovar
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photo_gen_user_recent ON public.photo_generations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_gen_post ON public.photo_generations (post_id);

-- Aprovação humana de cada ESTILO (Constituição §11), por usuário (quem revisa):
-- só estilos aprovados entram em produção; a prancha de validação vem antes.
-- Ausência de linha = rascunho.
CREATE TABLE IF NOT EXISTS public.photo_style_approvals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  style_id text NOT NULL CHECK (style_id IN ('F01', 'F02', 'F03', 'F04')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  board_generation_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, style_id)
);

ALTER TABLE public.photo_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_style_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_generations ENABLE ROW LEVEL SECURITY;
-- Referências: base compartilhada do produtor (mesmo padrão de design_assets).
DROP POLICY IF EXISTS photo_references_all ON public.photo_references;
CREATE POLICY photo_references_all ON public.photo_references FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS photo_style_approvals_owner ON public.photo_style_approvals;
CREATE POLICY photo_style_approvals_owner ON public.photo_style_approvals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS photo_generations_owner ON public.photo_generations;
CREATE POLICY photo_generations_owner ON public.photo_generations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
