// Motor fotográfico do Marcos (docs/fotografia/01–06) — cliente da edge
// `marcos-photo`. A edge lê o texto, escolhe estilo/variação (F01–F04), gera
// com as referências por nível e passa pelos portões G0–G5 + do estilo.
// Aqui: retentativa automática quando o portão reprova (máx. 2 tentativas) e a
// revisão humana (aprovar | pedir ajuste | rejeitar).
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

export interface PhotoGeneration {
  id: string; post_id: string | null; purpose: 'post' | 'validation_board'; origin: string;
  style_id: string; variant_id: string; expression_id: string; wardrobe_id: string; environment_id: string;
  gaze: string; crop: string; text_space: 'left' | 'right' | 'top' | 'bottom' | 'none'; aspect: string;
  image_url: string | null; model: string | null; attempt: number; source_ref_keys: string[];
  auto_status: 'aprovada' | 'revisar' | 'rejeitada' | null; hard_fail: string | null;
  identity_status: string | null; realism_status: string | null;
  review_status: 'pending' | 'approved' | 'adjust' | 'rejected'; reviewer_notes: string | null;
  gates: { failures?: string[]; observacoes?: string; G1_identidade?: { score?: number }; error?: string } | null;
  plan: { reasons?: string[]; penalties?: string[]; sufficiency?: { a0: number; body_allowed: boolean; note?: string }; comparison?: Record<string, { key: string; url: string } | null> } | null;
  mother_text: string | null; created_at: string;
}
export type GenerateResult =
  | { status: 'generated'; generation: PhotoGeneration; attempts: PhotoGeneration[] }
  | { status: 'needs_real_photo' | 'no_approved_style'; reason: string };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/marcos-photo`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { let m = text.slice(0, 300); try { m = JSON.parse(text).error ?? m; } catch { /* cru */ } throw new Error(m); }
  return JSON.parse(text) as T;
}

// Gera uma foto pro texto. Se o portão reprovar (verdade/identidade/realismo
// crítico), tenta de novo UMA vez com os motivos da reprovação.
export async function generateMarcosPhoto(input: {
  text: string; postId?: string; forceVariant?: string; purpose?: 'post' | 'validation_board'; adjustNote?: string; parentId?: string;
}): Promise<GenerateResult> {
  const attempts: PhotoGeneration[] = [];
  let previousFailure: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await call<{ status: string; generation?: PhotoGeneration; plan?: { reasons?: string[] }; error?: string }>({
      action: 'generate', text: input.text, post_id: input.postId, force_variant: input.forceVariant, purpose: input.purpose,
      adjust_note: input.adjustNote, parent_id: attempts.at(-1)?.id ?? input.parentId, previous_failure: previousFailure, attempt,
    });
    if (r.status === 'needs_real_photo' || r.status === 'no_approved_style') {
      return { status: r.status, reason: r.plan?.reasons?.[0] ?? r.error ?? '' };
    }
    if (!r.generation) throw new Error('O motor fotográfico não devolveu imagem.');
    attempts.push(r.generation);
    if (r.generation.auto_status !== 'rejeitada') break;
    previousFailure = (r.generation.gates?.failures ?? []).join('; ') || 'reprovada no portão de qualidade';
    // Mantém a MESMA variação na nova tentativa (só corrige os problemas).
    input = { ...input, forceVariant: r.generation.variant_id };
  }
  const best = [...attempts].sort((a, b) => rank(a) - rank(b))[0];
  return { status: 'generated', generation: best, attempts };
}
const rank = (g: PhotoGeneration) => (g.auto_status === 'aprovada' ? 0 : g.auto_status === 'revisar' ? 1 : 2);

export async function reviewMarcosPhoto(generationId: string, decision: 'approve' | 'adjust' | 'reject', note?: string): Promise<PhotoGeneration> {
  const r = await call<{ generation: PhotoGeneration }>({ action: 'review', generation_id: generationId, decision, note });
  return r.generation;
}

export async function getPhotoGeneration(id: string): Promise<PhotoGeneration | null> {
  const { data } = await supabase.from('photo_generations').select('*').eq('id', id).maybeSingle();
  return (data as PhotoGeneration | null) ?? null;
}

// Espaço de texto do motor → posição do texto no compositor M02.
export const TEXT_SPACE_TO_PLACE: Record<string, 'esquerda' | 'direita' | 'topo' | 'baixo' | 'centro'> = {
  left: 'esquerda', right: 'direita', top: 'topo', bottom: 'baixo', none: 'esquerda',
};
