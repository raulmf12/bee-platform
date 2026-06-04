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
}

export interface GenerateContentOutput {
  success: boolean;
  quote: string;
  caption: string;
  headline_type_used?: string;
  analogy_used?: string;
  error?: string;
}

export const edge = {
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
};
