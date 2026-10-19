// Store de posts (user_posts). RLS filtra automaticamente por user.

import { create } from 'zustand';
import { postApi } from '@/lib/api';
import type { PostStatus, UserPost } from '@/types';

interface PostState {
  posts: UserPost[];
  // Falha ao ler as peças (≠ "não há peças"): a tela mostra o erro e oferece tentar de novo.
  error: string | null;
  loading: boolean;

  load: () => Promise<void>;
  get: (id: string) => UserPost | undefined;
  create: (input: Parameters<typeof postApi.create>[0]) => Promise<UserPost>;
  update: (id: string, patch: Partial<UserPost>) => Promise<void>;
  // Relê a peça do banco depois de um comando do servidor (aprovar/agendar): a tela mostra o que foi GRAVADO.
  refreshOne: (id: string) => Promise<UserPost | null>;
  // Incorpora uma peça já devolvida pelo servidor (sem nova leitura).
  applyServer: (post: UserPost) => void;
  setStatus: (id: string, status: PostStatus) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export const usePostStore = create<PostState>((set, get) => ({
  posts: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true });
    try {
      const posts = await postApi.list();
      set({ posts, loading: false, error: null });
    } catch (e) {
      console.error('[postStore.load]', e);
      set({ loading: false, error: String((e as Error).message ?? e) });
    }
  },

  get: (id) => get().posts.find((p) => p.id === id),

  create: async (input) => {
    const post = await postApi.create(input);
    set({ posts: [post, ...get().posts] });
    return post;
  },

  update: async (id, patch) => {
    const updated = await postApi.update(id, patch);
    set({ posts: get().posts.map((p) => (p.id === id ? updated : p)) });
  },

  refreshOne: async (id) => {
    const fresh = await postApi.get(id).catch(() => null);
    if (fresh) set({ posts: get().posts.some((p) => p.id === id) ? get().posts.map((p) => (p.id === id ? fresh : p)) : [fresh, ...get().posts] });
    return fresh;
  },

  applyServer: (post) => {
    set({ posts: get().posts.map((p) => (p.id === post.id ? post : p)) });
  },

  setStatus: async (id, status) => {
    const updated = await postApi.setStatus(id, status);
    set({ posts: get().posts.map((p) => (p.id === id ? updated : p)) });
  },

  delete: async (id) => {
    await postApi.delete(id);
    set({ posts: get().posts.filter((p) => p.id !== id) });
  },
}));
