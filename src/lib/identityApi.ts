// Identidade e contextos: perfis de comunicação, emissores, frentes, públicos e snapshots.
import { db } from '@/lib/db';
import type { Audience, BusinessFront, CommunicationProfile, ContextSnapshot, Emitter } from '@/types';

export interface ProfileView extends CommunicationProfile { emitter?: Emitter; front?: BusinessFront; audience?: Audience | null }

export const identityApi = {
  async profiles(): Promise<ProfileView[]> {
    const [profiles, emitters, fronts, audiences] = await Promise.all([
      db.select<CommunicationProfile>('communication_profiles', { status: 'neq.archived', order: 'is_default.desc,name.asc' }),
      db.select<Emitter>('emitters', {}), db.select<BusinessFront>('business_fronts', {}), db.select<Audience>('audiences', {}),
    ]);
    return profiles.map((p) => ({
      ...p, emitter: emitters.find((e) => e.id === p.emitter_id), front: fronts.find((f) => f.id === p.front_id),
      audience: audiences.find((a) => a.id === p.primary_audience_id) ?? null,
    }));
  },
  async snapshot(id: string): Promise<ContextSnapshot | null> {
    return db.selectOne<ContextSnapshot>('context_snapshots', { id: `eq.${id}`, select: 'id,profile_id,profile_version,summary,fallback,interlocutor_state,created_at' });
  },
};

// "Quem fala · Frente · Público" de um perfil.
export const profileSummary = (p?: ProfileView | null) =>
  p ? [p.emitter?.name, p.front?.name, p.audience?.name ?? 'público a definir'].filter(Boolean).join(' · ') : '';
