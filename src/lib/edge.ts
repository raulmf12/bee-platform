// Helpers pra invocar Edge Functions do Supabase com JWT do usuario.
// Usa fetch direto pra evitar pendurar como o supabase.functions.invoke faz.

import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token ?? SUPABASE_KEY;
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
}

export interface GenerateContentInput {
  editorial_slug: string;
  arsenal_item_id?: string;
  target_avatar?: 'identificado' | 'incomodado' | 'ambos';
  briefing?: string;
  quote_max_chars?: number;
  reference_post_id?: string;
  target_platform?: 'linkedin' | 'instagram';
  // Quantas variacoes gerar numa unica chamada (1..5).
  // As 5 saem no MESMO pedido de proposito: o prompt (persona + arsenal +
  // exemplos + Camada 0 da Alma) e enorme e a saida e curta, entao 5 variacoes
  // custam ~8% a mais. Cinco chamadas separadas custariam ~5x.
  variations?: number;
}

export interface GeneratedVariation {
  quote: string;
  caption: string;
  headline_type_used?: string;
  analogy_used?: string;
  // Nota de viralizacao (0-100) + razao curta, estimadas pela IA.
  virality_score?: number;
  virality_reason?: string;
}

export interface GenerateContentOutput extends GeneratedVariation {
  success: boolean;
  // Sempre presente. Com variations=1 tem 1 item, e os campos de topo
  // (quote/caption) espelham o primeiro — compat com quem ja chamava assim.
  variations: GeneratedVariation[];
  error?: string;
}

export interface LearnFromCorrectionOutput {
  success: boolean;
  learnings: Array<{ texto: string; categoria: string; facet?: string; reforcou: boolean }>;
  skipped?: string;
  error?: string;
}

export interface LearnFromFeedbackInput {
  post_id?: string;
  feedback_text: string;
  quote_original: string;
  caption_original: string;
  editorial_slug?: string | null;
  platform?: string | null;
  target_avatar?: string | null;
  facet_focus?: 'texto' | 'legenda' | 'ambos';
}
export interface LearnFromFeedbackOutput {
  success: boolean;
  learnings: Array<{ texto: string; categoria: string; facet?: string; reforcou: boolean }>;
  skipped?: string;
  error?: string;
}

export interface SuggestAudienceOutput {
  success: boolean;
  audience: { quem: string; dor: string; desejo: string; objecoes: string[]; gatilhos: string[]; linguagem: string };
  error?: string;
}
export interface CoachFocus {
  quote?: string;
  caption?: string;
  editorial_slug?: string | null;
  platform?: string | null;
  target_avatar?: string | null;
}
export interface CoachProposal {
  texto: string;
  categoria: string;
  facet: 'texto' | 'legenda' | 'imagem';
  scope: { editorial_slug: string | null; platform: string | null; target_avatar: string | null };
}
export interface VoiceCoachOutput {
  success: boolean;
  reply: string;
  proposals: CoachProposal[];
  error?: string;
}
export interface CommitLearningOutput {
  success: boolean;
  reforcou: boolean;
  learning_id?: string;
  texto: string;
  error?: string;
}

export interface GeneratePersonaOutput {
  success: boolean;
  persona: {
    nome: string; idade: number | null; cargo: string; empresa: string;
    historia: string; rotina: string; personalidade: string;
    memorias: string[]; valores: string[];
    dor: string; desejo: string; objecoes: string[]; gatilhos: string[]; linguagem: string;
  };
  error?: string;
}
export interface PersonaProfile {
  nome?: string;
  idade?: number | null;
  cargo?: string;
  empresa?: string;
  historia?: string;
  rotina?: string;
  personalidade?: string;
  memorias?: string[];
  valores?: string[];
  quem?: string;
  estado?: string;
  dor?: string;
  desejo?: string;
  gatilhos?: string[];
  objecoes?: string[];
  linguagem?: string;
  desafio_comunicacao?: string;
  frases?: string[];
}
export interface PersonaChatOutput {
  success: boolean;
  reply: string;
  error?: string;
}

export const edge = {
  // A IA cria uma PESSOA inteira a partir de um público-base + pistas (não salva).
  async generatePersona(input: { base?: object; hints?: string }): Promise<GeneratePersonaOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-persona`, {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  // Simulação de público: a persona responde EM PERSONAGEM. Opcionalmente vê um
  // post (imagem renderizada + texto) via visão do Gemini.
  async personaChat(input: {
    persona: PersonaProfile;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    post?: { quote?: string; caption?: string; image_base64?: string };
  }): Promise<PersonaChatOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/persona-chat`, {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  // A IA propoe o publico-alvo de um editorial a partir da descricao (nao salva).
  async suggestAudience(editorial: { name?: string; description?: string; objetivo?: string; tom?: string }): Promise<SuggestAudienceOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-audience`, {
      method: 'POST', headers, body: JSON.stringify(editorial),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  // O agente de voz: conversa + PROPOE licoes (nao salva; o usuario confirma).
  async voiceCoach(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    focus?: CoachFocus,
  ): Promise<VoiceCoachOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/voice-coach`, {
      method: 'POST', headers, body: JSON.stringify({ messages, focus }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  // Grava uma licao CONFIRMADA (dedup dentro de faceta x alcance).
  async commitLearning(input: CoachProposal & { chat_message_id?: string }): Promise<CommitLearningOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/commit-learning`, {
      method: 'POST', headers,
      body: JSON.stringify({ texto: input.texto, categoria: input.categoria, facet: input.facet, scope: input.scope, chat_message_id: input.chat_message_id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  // Destila a licao de uma correcao (ai_reviews) e joga em ai_learnings.
  // Fire-and-forget: nunca deve segurar a aprovacao do post.
  async learnFromCorrection(input: { review_id: string }): Promise<LearnFromCorrectionOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/learn-from-correction`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  // Destila a licao de um feedback EXPLICITO ("corte as intros") e joga em
  // ai_learnings (dedup dentro de faceta x alcance). Aprende na hora — o wizard
  // regenera logo em seguida ja lendo a licao nova.
  async learnFromFeedback(input: LearnFromFeedbackInput): Promise<LearnFromFeedbackOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/learn-from-feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  },

  async generateContent(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-content`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`generate-content HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text) as GenerateContentOutput;
  },

  async generateImage(input: {
    prompt: string;
    aspect_ratio?: string;
    style_hint?: string;
  }): Promise<{ success: boolean; image_base64: string; mime_type: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-image-ai`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`generate-image-ai HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  },

  async searchImages(input: {
    query: string;
    count?: number;
  }): Promise<{ success: boolean; images: Array<{ url: string; thumbnail: string; title: string }> }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hybrid-image-search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`search HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  },

  async ingestDocument(input: {
    title: string;
    text: string;
    source_type?: string;
    is_global?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; document_id: string; chunk_count: number; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-document`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ingest HTTP ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  },

  async processVideo(input: {
    storage_path: string;
    mime_type?: string;
    content_type?: 'podcast' | 'talking_head' | 'vlog' | 'tutorial' | 'behind_scenes' | 'palestra' | 'reel_curto' | 'outro';
  }): Promise<{
    success: boolean;
    transcript: string;
    visual_summary: string;
    detected_content_type: string;
    content_type: string;
    file_uri: string;
    size_mb: number;
    model_used: string;
    error?: string;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`process-video HTTP ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  },

  async generateCaptionFromVideo(input: {
    transcript: string;
    visual_summary?: string;
    content_type?: string;
    editorial_slug?: string;
    target_avatar?: 'identificado' | 'incomodado' | 'ambos';
    briefing?: string;
  }): Promise<{ success: boolean; caption: string; hook_preview: string; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-caption-from-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`gen-video-caption HTTP ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  },

  // Gera um ROTEIRO de video a partir do editorial (pra gravar depois).
  // briefing repassa o feedback do "Corrigir" pra regeneracao considerar.
  async generateScript(input: {
    editorial_slug?: string;
    target_avatar?: 'identificado' | 'incomodado' | 'ambos';
    platform?: 'linkedin' | 'instagram';
    briefing?: string;
  }): Promise<{ success: boolean; titulo: string; roteiro: string; model_used?: string; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-script`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`generate-script HTTP ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  },

  async searchKnowledge(input: {
    query: string;
    match_count?: number;
    match_threshold?: number;
  }): Promise<{
    success: boolean;
    results: Array<{
      id: string;
      document_id: string;
      document_title: string;
      content: string;
      similarity: number;
    }>;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/search-knowledge`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`search-knowledge HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  },

  async publishPost(input: { post_id: string }): Promise<{
    success: boolean;
    platform: 'linkedin' | 'instagram';
    published_url: string;
    published_id: string;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/publish-post`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`publish-post HTTP ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  },

  async fetchYoutubeMeta(input: { url: string }): Promise<{
    success: boolean;
    video_id: string;
    url: string;
    title: string;
    description: string;
    channel?: string;
    thumbnail_url?: string;
    error?: string;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/youtube-meta`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`youtube-meta HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  },

  async mineContent(input: {
    text: string;
    source_type?: 'podcast_clip' | 'document' | 'post' | 'manual';
    source_id?: string;
    editorial_hint?: string;
    context?: string;
  }): Promise<{ success: boolean; created: number; skipped: number; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mine-content`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`mine-content HTTP ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  },
};
