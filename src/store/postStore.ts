// Store de posts (user_posts). RLS filtra automaticamente por user.

import { create } from 'zustand';
import { postApi } from '@/lib/api';
import type { PostStatus, UserPost } from '@/types';

interface PostState {
  posts: UserPost[];
  loading: boolean;

  load: () => Promise<void>;
  get: (id: string) => UserPost | undefined;
  create: (input: Parameters<typeof postApi.create>[0]) => Promise<UserPost>;
  update: (id: string, patch: Partial<UserPost>) => Promise<void>;
  setStatus: (id: string, status: PostStatus) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export const usePostStore = create<PostState>((set, get) => ({
  posts: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const posts = await postApi.list();
      set({ posts, loading: false });
    } catch (e) {
      console.error('[postStore.load]', e);
      set({ loading: false });
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

  setStatus: async (id, status) => {
    const updated = await postApi.setStatus(id, status);
    set({ posts: get().posts.map((p) => (p.id === id ? updated : p)) });
  },

  delete: async (id) => {
    await postApi.delete(id);
    set({ posts: get().posts.filter((p) => p.id !== id) });
  },
}));
