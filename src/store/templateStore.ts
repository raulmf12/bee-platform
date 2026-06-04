// Store de templates. Auto-semeia o template oficial Bee Quote se faltar.

import { create } from 'zustand';
import { templateApi } from '@/lib/api';
import type { PostTemplate } from '@/types';

interface TemplateState {
  templates: PostTemplate[];
  loading: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  ensureSystemTemplates: () => Promise<void>;
  get: (id: string) => PostTemplate | undefined;
  byPlatform: (platform: string) => PostTemplate[];
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  loaded: false,

  load: async () => {
    set({ loading: true });
    try {
      // Templates do sistema sao criados via SQL seed (scripts/dump-template.ts -> SQL).
      // O frontend nao tenta criar pra evitar conflito com RLS.
      const templates = await templateApi.list();
      set({ templates, loading: false, loaded: true });
    } catch (e) {
      console.error('[templateStore.load]', e);
      set({ loading: false, loaded: true });
    }
  },

  ensureSystemTemplates: async () => {
    // No-op no front. Seed roda via SQL (vide scripts/dump-template.ts).
  },

  get: (id) => get().templates.find((t) => t.id === id),

  byPlatform: (platform) => get().templates.filter((t) => t.platform === platform),
}));
