// Rascunho da sessão no cliente: a configuração atual com as propostas sobrepostas (mesma regra
// do servidor em _shared/identity-draft.ts) — para nomear refs, montar os seletores e calcular o impacto.
import type { IdentityState } from '@/lib/identityApi';
import type { BlockProposal, ProposalItem, SetupBlock, SetupSession } from '@/types';

export interface DraftEntity { id: string; name: string; draft?: boolean; changed?: boolean; [k: string]: unknown }
export interface Draft { emitters: DraftEntity[]; fronts: DraftEntity[]; audiences: DraftEntity[]; profiles: DraftEntity[]; editorials: DraftEntity[] }

const live = (p?: BlockProposal) => !!p && p.status !== 'skipped';

export function draftOf(st: IdentityState, s: SetupSession): Draft {
  const base: Draft = {
    emitters: st.emitters.map((e) => ({ ...e })), fronts: st.fronts.map((f) => ({ ...f })), audiences: st.audiences.map((a) => ({ ...a })),
    profiles: st.profiles.map((p) => ({ ...p })), editorials: st.editorials.map((e) => ({ ...e })),
  } as unknown as Draft;
  for (const block of ['emitters', 'fronts', 'audiences', 'profiles', 'editorials'] as const) {
    const p = s.proposals[block];
    if (!live(p)) continue;
    for (const it of p!.items ?? []) {
      const fields: Record<string, unknown> = { ...it };
      if (block === 'profiles') Object.assign(fields, { emitter_id: it.emitter_ref, front_id: it.front_ref, primary_audience_id: it.primary_audience_ref });
      if (block === 'audiences' || block === 'editorials') fields.front_id = it.front_ref;
      if (it.action === 'create') base[block].push({ ...fields, id: it.ref, name: String(it.name ?? 'Novo'), draft: true });
      else if (it.action === 'update') base[block] = base[block].map((r) => (r.id === it.ref ? { ...r, ...stripUndef(fields), id: r.id, changed: true } : r));
      else if (it.action === 'archive') base[block] = base[block].filter((r) => r.id !== it.ref);
    }
  }
  return base;
}
const stripUndef = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && v !== null && !['ref', 'action', 'origin', 'why', 'changes'].includes(k)));

export const nameOf = (d: Draft, kind: keyof Draft, ref?: string | null) => (ref ? d[kind].find((x) => x.id === ref)?.name ?? '—' : '—');

// Perfis afetados pela ativação (para o resumo de impacto da tela 9).
export function affectedProfiles(st: IdentityState, s: SetupSession): Array<{ id: string; name: string; why: string; created?: boolean }> {
  const acc = (b: SetupBlock) => (s.proposals[b]?.status === 'accepted' ? s.proposals[b]!.items ?? [] : []);
  const changed = (b: SetupBlock) => new Set(acc(b).filter((i) => i.action === 'update').map((i) => i.ref));
  const recal = s.mode === 'recalibrate';
  const targets = new Set(s.target_profile_ids);
  const out = new Map<string, { id: string; name: string; why: string; created?: boolean }>();
  for (const it of acc('profiles')) {
    if (it.action === 'create') out.set(it.ref, { id: it.ref, name: String(it.name), why: 'perfil novo', created: true });
    else if (it.action === 'update' && (!recal || targets.has(it.ref))) out.set(it.ref, { id: it.ref, name: st.profiles.find((p) => p.id === it.ref)?.name ?? '', why: 'perfil revisado' });
  }
  const ce = changed('emitters'), cf = changed('fronts'), ca = changed('audiences');
  for (const p of st.profiles) {
    if (out.has(p.id)) continue;
    const hitA = ca.has(p.primary_audience_id ?? '') || p.secondary_audience_ids.some((x) => ca.has(x));
    const hit = ce.has(p.emitter_id) ? 'emissor revisado' : cf.has(p.front_id) ? 'frente revisada' : hitA ? 'público revisado' : null;
    if (!hit) continue;
    if (recal && !targets.has(p.id)) continue;            // recalibração: os outros perfis não mudam (cópia do compartilhado)
    out.set(p.id, { id: p.id, name: p.name, why: hit });
  }
  return [...out.values()];
}

// Item editado à mão: vira "update" declarado (ou continua "create").
export function editItem(it: ProposalItem, patch: Record<string, unknown>): ProposalItem {
  return { ...it, ...patch, action: it.action === 'create' ? 'create' : it.action === 'archive' ? 'archive' : 'update', origin: 'declared' };
}
