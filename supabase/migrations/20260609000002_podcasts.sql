-- ---------------------------------------------------------------------
-- PODCASTS + CORTES (clips)
-- ---------------------------------------------------------------------
-- Fluxo dedicado de podcast:
--   1. Usuario vincula o corte a um "podcast" = o video do YouTube do
--      episodio completo. O sistema puxa titulo + descricao do YouTube.
--   2. Sobe o corte (video) -> bucket media em {user_id}/podcasts/{clip_id}/
--   3. Transcricao roda na hora (process-video) e fica guardada no clip.
--   4. O corte fica na biblioteca; dali gera o post.
-- ---------------------------------------------------------------------

-- 1. PODCASTS (episodios — 1 por video do YouTube) ----------------------
CREATE TABLE IF NOT EXISTS public.podcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_url       TEXT,
  youtube_video_id  TEXT,
  title             TEXT NOT NULL,
  description       TEXT,
  channel           TEXT,
  thumbnail_url     TEXT,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Um mesmo episodio do YouTube nao duplica por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS idx_podcasts_user_video
  ON public.podcasts(user_id, youtube_video_id)
  WHERE youtube_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_podcasts_user ON public.podcasts(user_id);

-- 2. PODCAST_CLIPS (cortes subidos) -------------------------------------
CREATE TABLE IF NOT EXISTS public.podcast_clips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  podcast_id        UUID REFERENCES public.podcasts(id) ON DELETE SET NULL,
  title             TEXT,
  video_path        TEXT,            -- caminho no bucket media
  video_url         TEXT,            -- public url
  transcript        TEXT,            -- guardada no upload
  visual_summary    TEXT,
  duration_seconds  INT,
  content_type      TEXT DEFAULT 'podcast',
  -- post gerado a partir do corte (opcional — fluxo emenda na geracao)
  post_id           UUID REFERENCES public.user_posts(id) ON DELETE SET NULL,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clips_user ON public.podcast_clips(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_podcast ON public.podcast_clips(podcast_id);

-- 3. updated_at automatico ----------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_podcasts_touch ON public.podcasts;
CREATE TRIGGER trg_podcasts_touch BEFORE UPDATE ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_podcast_clips_touch ON public.podcast_clips;
CREATE TRIGGER trg_podcast_clips_touch BEFORE UPDATE ON public.podcast_clips
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. RLS (cada usuario so ve/gerencia o que e dele) ---------------------
ALTER TABLE public.podcasts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "podcasts_all_own" ON public.podcasts;
CREATE POLICY "podcasts_all_own" ON public.podcasts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "podcast_clips_all_own" ON public.podcast_clips;
CREATE POLICY "podcast_clips_all_own" ON public.podcast_clips FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
