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
  // Rotação forçada de template (só Instagram): o cliente manda o template-alvo
  // deste post pra garantir variedade — o generate-content escreve moldado pra ele.
  force_variant?: string;
  // Campanhas: desenvolver uma ideia-mãe aprovada (a ideia é a tarefa; sem arsenal).
  mother_idea?: { title: string; direction?: string; strategic_function?: string };
  // Quantas variacoes gerar numa unica chamada (1..5).
  // As 5 saem no MESMO pedido de proposito: o prompt (persona + arsenal +
  // exemplos + Camada 0 da Alma) e enorme e a saida e curta, entao 5 variacoes
  // custam ~8% a mais. Cinco chamadas separadas custariam ~5x.
  variations?: number;
}

// SEED da Hive: a FORMA que o generate-content escolheu junto com o conteudo
// (so Instagram). Vai pro hive-decide em "modo execucao" — sem 2a IA.
export interface HiveSeed {
  variant: string;
  manifestation: string;
  highlight: { target?: string; reason?: string } | null;
  subtitle: string | null;
  poles: { a?: string; b?: string } | null;
  image_scene_hint: string;
  human_presence_adds_meaning: boolean;
  mode_reason: string;
  variant_reason: string;
}

export interface GeneratedVariation {
  quote: string;
  caption: string;
  headline_type_used?: string;
  analogy_used?: string;
  // Nota de viralizacao (0-100) + razao curta, estimadas pela IA.
  virality_score?: number;
  virality_reason?: string;
  // So Instagram: template + destaque escolhidos junto com o texto.
  hive_seed?: HiveSeed;
}

export interface GenerateContentOutput extends GeneratedVariation {
  success: boolean;
  // Sempre presente. Com variations=1 tem 1 item, e os campos de topo
  // (quote/caption) espelham o primeiro — compat com quem ja chamava assim.
  variations: GeneratedVariation[];
  error?: string;
}

export interface QaCheckOutput {
  success: boolean;
  score: number | null;
  resumo: string;
  checks: Array<{ titulo: string; criterio: string; passed: boolean; nota: string }>;
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

// POST numa edge function com a sessão atual; erro vira Error com a mensagem do servidor.
async function postEdge<T>(fn: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).error ?? msg; } catch { /* texto cru */ }
    throw new Error(msg);
  }
  return JSON.parse(text) as T;
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

  // Editar com IA: ajuste CIRÚRGICO de um campo (título/legenda). A IA muda só
  // o que foi pedido e preserva o resto. Iterável — chame quantas vezes quiser.
  async editText(input: {
    field: 'titulo' | 'legenda';
    text: string;
    instruction: string;
    counterpart?: string;
    editorial_slug?: string;
    target_platform?: 'linkedin' | 'instagram';
    max_chars?: number;
  }): Promise<{ success: boolean; text: string; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/edit-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`edit-text HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as { success: boolean; text: string; error?: string };
  },

  // Regenerar um TRECHO selecionado: devolve 4-5 alternativas que encaixam no
  // lugar do trecho, coerentes com o resto. Pra trocar uma analogia sem mexer no post.
  async regenerateSnippet(input: {
    field?: 'titulo' | 'legenda';
    full_text: string;
    snippet: string;
    instruction?: string;
    count?: number;
    editorial_slug?: string;
    target_platform?: 'linkedin' | 'instagram';
  }): Promise<{ success: boolean; options: string[]; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/regenerate-snippet`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`regenerate-snippet HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as { success: boolean; options: string[]; error?: string };
  },

  // IA companheira de brainstorm do post: conversa vendo título+legenda e pode
  // propor textos prontos pra aplicar (suggestions).
  async postChat(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    post: { quote?: string; caption?: string; editorial_slug?: string; platform?: 'linkedin' | 'instagram'; target_avatar?: string };
  }): Promise<{ success: boolean; reply: string; suggestions: Array<{ field: 'titulo' | 'legenda'; text: string; label?: string }>; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/post-chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`post-chat HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as { success: boolean; reply: string; suggestions: Array<{ field: 'titulo' | 'legenda'; text: string; label?: string }>; error?: string };
  },

  // Autochecagem (QA): avalia a variação contra os critérios das Diretrizes.
  async qaCheck(input: {
    quote: string;
    caption: string;
    target_platform?: 'linkedin' | 'instagram';
    editorial_slug?: string;
  }): Promise<QaCheckOutput> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/qa-check`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`qa-check HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as QaCheckOutput;
  },

  async generateImage(input: {
    prompt: string;
    aspect_ratio?: string;
    style_hint?: string;
    model?: string;                 // 'gemini-2.5-flash-image' (nano) | 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst'
    quality?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto';
  }): Promise<{ success: boolean; image_base64: string; mime_type: string; model?: string; cost_usd?: number; tokens_input?: number; tokens_output?: number }> {
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

  // Botão "Conectar Instagram": troca o code do Login com Facebook por um token
  // de longa duração e devolve o IG business id (o App Secret fica no servidor).
  async connectInstagram(input: { code: string; redirect_uri: string }): Promise<{
    success: boolean;
    access_token: string;
    expires_at: string;
    accounts: Array<{ instagram_business_account_id: string; username: string; page_name: string }>;
    error?: string;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-connect`, {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`instagram-connect HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  },

  // Valida um token do LinkedIn no servidor (o browser bloqueia por CORS).
  // --- Campanhas (F2) ---
  async campaignMoment(input: { type: 'organica' | 'vendas'; intent?: string; user_note?: string }): Promise<{
    success: boolean; moment: { label: string; summary: string; signals: string[] }; facts: Record<string, unknown>;
  }> {
    return postEdge('campaign-moment', input);
  },

  async campaignStrategy(input: {
    mode: 'recommend' | 'adjust'; type: 'organica' | 'vendas'; intent?: string;
    moment?: { label: string; summary: string }; user_note?: string;
    current_mix?: Record<string, number>; instruction?: string; product_id?: string;
  }): Promise<{
    success: boolean;
    strategy: {
      mix: Record<'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos', number>;
      rationale: string;
      phases: Array<Record<'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos', 'muito_baixo' | 'baixo' | 'medio' | 'alto'>>;
      recommended_weeks: number;
      duration_rationale: string;
    };
  }> {
    return postEdge('campaign-strategy', input);
  },

  // --- Produção (F3): pauta do ciclo ---
  async cyclePauta(input: { cycle_id: string; mode?: 'full' | 'refresh' | 'swap'; idea_id?: string }): Promise<{
    success: boolean;
    ideas: Array<{
      title: string; summary: string;
      strategic_function: 'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos';
      editorial_slug: string; channels: Array<{ account_id: string; platform: 'linkedin' | 'instagram' }>;
      suggested_pieces: number; rationale: string;
    }>;
  }> {
    return postEdge('cycle-pauta', input);
  },

  // --- Produção (F4): desenvolver/validar conteúdo-mãe ---
  // --- Desempenho (F8) ---
  async instagramImport(input: { account_id: string; cursor?: string | null; mode?: 'full' | 'recent' }): Promise<{
    success: boolean; username: string | null; processed: number; inserted: number; updated: number; metrics: number;
    insights: boolean; next: string | null; done: boolean; total: number | null; errors: string[];
  }> {
    return postEdge('instagram-import', input);
  },
  async metricsIngest(): Promise<{ success: boolean; results: Array<{ posts: number; saved: number; insights: boolean; errors: string[] }> }> {
    return postEdge('metrics-ingest', {});
  },
  async campaignTick(): Promise<{ success: boolean; results: Array<{ pautas: Array<{ cycle_id: string; ideas: number }>; errors: string[] }> }> {
    return postEdge('campaign-tick', {});
  },

  async contentDevelop(input: {
    idea_id: string; mode?: 'develop' | 'adjust' | 'new_version';
    current?: { frase?: string; texto?: string }; instruction?: string;
  }): Promise<{
    success: boolean; frase: string; texto: string;
    considered: { base: string; coerencia: string; formato: string };
    meta: { headline_type: string | null; analogy: string | null; virality_score: number | null; virality_reason: string | null; qa_score: number | null };
  }> {
    return postEdge('content-develop', input);
  },

  async testLinkedIn(input: { token: string }): Promise<{
    success: boolean;
    name: string | null;
    email: string | null;
    sub: string | null;
    suggested_urn: string;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/test-linkedin`, {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try { msg = JSON.parse(text).error ?? msg; } catch { /* usa texto cru */ }
      throw new Error(msg);
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

  // A IA (de verdade) monta o calendário: propõe dia + horário + JUSTIFICATIVA
  // por post. Não grava — devolve o plano pro usuário revisar e aplicar.
  async distributeSchedule(input: {
    today_date: string;
    horizon_days?: number;
    standby: Array<{ id: string; platform: string; editorial_slug?: string; editorial_name?: string; title?: string; theme?: string; virality_score?: number;
      campaign_name?: string; priority?: number; priority_label?: string; window_start?: string; window_end?: string }>;
    occupied?: Array<{ date: string; platform: string; editorial_slug?: string }>;
    prefs: {
      skip_weekends?: boolean;
      per_day_limit?: number;
      start_offset_days?: number;
      platform_cadence?: Record<string, { per_week: number; times: string[] }>;
    };
  }): Promise<{ success: boolean; plan: Array<{ post_id: string; date: string; time: string; reason: string }>; summary?: string; error?: string }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/distribute-schedule`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`distribute-schedule HTTP ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text) as { success: boolean; plan: Array<{ post_id: string; date: string; time: string; reason: string }>; summary?: string; error?: string };
  },

  // Motor de decisão visual da Hive (M01): recebe o texto aprovado, decide a
  // variante (score + diversidade), o destaque, e devolve a decisão com reason.
  async hiveDecide(input: {
    text: string;
    platform?: 'linkedin' | 'instagram';
    editorial_slug?: string;
    target_avatar?: string;
    post_id?: string;
    history_variants?: string[];
    // Modo execucao: template ja escolhido na geracao — pula o Gemini.
    seed?: HiveSeed;
  }): Promise<{
    success: boolean;
    decision: {
      mode: string; variant: string; variant_confidence: number;
      highlight: { target: string; reason: string } | null;
      subtitle?: string | null;
      diagram?: { poleA?: string; poleB?: string } | null;
      human_presence_adds_meaning?: boolean;
      manifestations?: Record<string, number>;
      brand: Record<string, unknown>;
      asset_strategy: { type: string; photo_required: boolean };
      // M02: foto escolhida na hierarquia (real/adaptada/gerada) ou instrução de geração.
      asset?: {
        id?: string; url: string; width?: number | null; height?: number | null;
        origin?: string; espaco_texto?: string | null; texto_cor?: string | null; source_image_id?: string;
      } | null;
      image_generation?: {
        needed: boolean; prompt: string; forbid?: string[];
        must_have?: Record<string, unknown>; scene_hint?: string;
      } | null;
      explanation: Record<string, unknown>;
      text_check: { chars: number; limit: number; needs_editorial_review: boolean };
      [k: string]: unknown;
    };
    model_used?: string;
    error?: string;
  }> {
    const headers = await authHeader();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hive-decide`, {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`hive-decide HTTP ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  },
};
