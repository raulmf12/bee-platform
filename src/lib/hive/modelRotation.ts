// Rodízio round-robin dos modelos de imagem, pro dia a dia AMOSTRAR cada modelo
// durante a semana de teste. Estado no localStorage (por navegador).
//
// Trava de segurança: os modelos GPT só entram no rodízio SE a chave OpenAI
// estiver configurada — senão a geração normal do dia a dia quebraria (o ramo
// OpenAI erraria por falta de chave). Sem chave → só Nano Banana (comportamento
// atual). Colar a chave = entrar em modo de teste automaticamente.
import { useAuthStore } from '@/store/authStore';

const ROTATION_KEY = 'bee_image_model_rotation';
const NANO = 'gemini-2.5-flash-image';
const GPT = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];

export function imageModelCandidates(): string[] {
  const hasOpenAI = Boolean(useAuthStore.getState().settings?.openai_api_key);
  return hasOpenAI ? [NANO, ...GPT] : [NANO];
}

// Próximo modelo do rodízio (round-robin sobre os candidatos disponíveis).
export function nextImageModel(candidates: string[] = imageModelCandidates()): string {
  if (candidates.length <= 1) return candidates[0] ?? NANO;
  try {
    const n = Number(localStorage.getItem(ROTATION_KEY) ?? '0') || 0;
    const model = candidates[n % candidates.length];
    localStorage.setItem(ROTATION_KEY, String((n + 1) % candidates.length));
    return model;
  } catch {
    return candidates[0];
  }
}
