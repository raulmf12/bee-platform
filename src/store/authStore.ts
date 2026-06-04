// Auth store. Usa apenas supabase.auth.* + nossa lib/db.ts (fetch direto).

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { setAuthCache } from '@/lib/db';
import { kanbanApi, profileApi, settingsApi } from '@/lib/api';
import type { Profile, UserSettings } from '@/types';

interface AuthState {
  currentUser: Profile | null;
  settings: UserSettings | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'avatar_color'>>) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
}

async function bootstrapUser(): Promise<{
  profile: Profile | null;
  settings: UserSettings | null;
}> {
  // Cria as 3 linhas iniciais (idempotente). Erros sao logados mas nao quebram.
  let profile: Profile | null = null;
  let settings: UserSettings | null = null;

  try {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? '';
    const name = email ? email.split('@')[0] : '';
    profile = await profileApi.ensureExists(name, email);
  } catch (e) {
    console.warn('[auth] bootstrap profile', e);
  }
  try {
    settings = await settingsApi.ensureExists();
  } catch (e) {
    console.warn('[auth] bootstrap settings', e);
  }
  try {
    await kanbanApi.ensureDefaults();
  } catch (e) {
    console.warn('[auth] bootstrap kanban', e);
  }

  return { profile, settings };
}

async function syncAuthCacheFromSession(): Promise<{ jwt: string | null; userId: string | null }> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token ?? null;
  const userId = data.session?.user.id ?? null;
  setAuthCache(jwt, userId);
  return { jwt, userId };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  settings: null,
  initialized: false,
  loading: false,
  error: null,

  init: async () => {
    try {
      const { userId } = await syncAuthCacheFromSession();
      if (userId) {
        const { profile, settings } = await bootstrapUser();
        set({ currentUser: profile, settings });
      }
    } catch (e) {
      console.error('[auth.init]', e);
    } finally {
      set({ initialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message || 'Erro de login';
        const friendly = msg === 'Invalid login credentials' ? 'Email ou senha incorretos.' : msg;
        set({ error: friendly, loading: false });
        throw new Error(friendly);
      }

      // sincroniza JWT na nossa lib/db
      setAuthCache(data.session?.access_token ?? null, data.user?.id ?? null);

      const { profile, settings } = await bootstrapUser();
      set({ currentUser: profile, settings });
    } catch (e) {
      console.error('[auth.signIn]', e);
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    setAuthCache(null, null);
    set({ currentUser: null, settings: null });
  },

  refreshProfile: async () => {
    const profile = await profileApi.getMe();
    set({ currentUser: profile });
  },

  refreshSettings: async () => {
    const settings = await settingsApi.getMe();
    set({ settings });
  },

  updateProfile: async (patch) => {
    const updated = await profileApi.updateMe(patch);
    set({ currentUser: updated });
  },

  updateSettings: async (patch) => {
    const merged = { ...(get().settings ?? {}), ...patch } as Partial<UserSettings>;
    const updated = await settingsApi.upsert(merged);
    set({ settings: updated });
  },
}));

export function needsOnboarding(settings: UserSettings | null | undefined): boolean {
  if (!settings) return true;
  if (!settings.gemini_api_key || settings.gemini_api_key.length < 10) return true;
  return false;
}
