// Bloco de proposta da Hive (tela 5 "O que a Hive entendeu", 6 Perfis e 7 Editorias):
// origem de cada item (declarado/evidência/hipótese/legado), diferenças, edição direta,
// aceitar o bloco ou pedir ajuste. Edição e conversa usam o MESMO estado (session.proposals).
import { useState } from 'react';
import { Check, Loader2, Pencil, Plus, RefreshCw, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { editItem, nameOf, type Draft } from '@/lib/identity/draft';
import type { BlockProposal, Origin, ProposalItem, SetupBlock } from '@/types';

export const BLOCK_LABELS: Record<SetupBlock, { title: string; hint: string }> = {
  brand: { title: 'Marca e núcleo', hint: 'A natureza da contribuição que todas as frentes compartilham. O Genesis segue na edição detalhada.' },
  emitters: { title: 'Quem fala', hint: 'Pessoas e voz institucional, com autoria e lugar de fala.' },
  fronts: { title: 'Frentes de atuação', hint: 'Linhas duradouras de trabalho — não são canais nem campanhas.' },
  audiences: { title: 'Públicos', hint: 'Pessoas, papéis e situações. O estado do interlocutor é uma lente à parte.' },
  profiles: { title: 'Perfis de comunicação', hint: 'Quem fala · frente · público prioritário · posicionamento · expressão.' },
  editorials: { title: 'Editorias', hint: 'Territórios com propósito, perguntas, material e exemplo — para revisão.' },
};
export const ORIGIN_LABELS: Record<Origin, { label: string; cls: string }> = {
  declared: { label: 'Declarado', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  evidence: { label: 'Evidência', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  hypothesis: { label: 'Hipótese', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  legacy: { label: 'Mantido', cls: 'bg-secondary text-muted-foreground' },
};
const ACTION_LABELS = { keep: 'mantido', update: 'alterado', create: 'novo', archive: 'arquivar' } as const;

type Field = { key: string; label: string; type: 'text' | 'textarea' | 'list' | 'select' | 'bool' | 'ref'; options?: Array<[string, string]>; ref?: keyof Draft; optional?: boolean };
const F: Record<Exclude<SetupBlock, 'brand'>, Field[]> = {
  emitters: [
    { key: 'name', label: 'Nome', type: 'text' }, { key: 'kind', label: 'Tipo', type: 'select', options: [['person', 'Pessoa (voz autoral)'], ['institutional', 'Voz institucional']] },
    { key: 'voice', label: 'Voz', type: 'textarea' }, { key: 'authority', label: 'Autoridade (só fatos confirmados)', type: 'textarea' },
    { key: 'speaking_rules', label: 'Lugar de fala', type: 'textarea' }, { key: 'first_person', label: 'Pode falar na 1ª pessoa do singular', type: 'bool' },
    { key: 'facts_status', label: 'Fatos', type: 'select', options: [['to_confirm', 'A confirmar'], ['confirmed', 'Confirmados']] },
  ],
  fronts: [
    { key: 'name', label: 'Nome', type: 'text' }, { key: 'description', label: 'O que a frente faz', type: 'textarea' },
    { key: 'territories', label: 'Territórios (um por linha)', type: 'list' }, { key: 'offers', label: 'Ofertas (slugs, um por linha)', type: 'list' },
  ],
  audiences: [
    { key: 'name', label: 'Nome', type: 'text' }, { key: 'front_ref', label: 'Frente', type: 'ref', ref: 'fronts', optional: true },
    { key: 'definition', label: 'Quem são (pessoas, papéis, situação)', type: 'textarea' }, { key: 'situations', label: 'Situações (uma por linha)', type: 'list' },
    { key: 'needs', label: 'Necessidades (uma por linha)', type: 'list' }, { key: 'language_notes', label: 'Como falam disso', type: 'textarea' },
    { key: 'status', label: 'Situação', type: 'select', options: [['hypothesis', 'Hipótese a validar'], ['active', 'Definido']] },
  ],
  profiles: [
    { key: 'name', label: 'Nome', type: 'text' }, { key: 'emitter_ref', label: 'Quem fala', type: 'ref', ref: 'emitters' },
    { key: 'front_ref', label: 'Frente', type: 'ref', ref: 'fronts' }, { key: 'primary_audience_ref', label: 'Público prioritário', type: 'ref', ref: 'audiences', optional: true },
    { key: 'positioning', label: 'Posicionamento', type: 'textarea' }, { key: 'expression', label: 'Expressão', type: 'textarea' },
    { key: 'cta_policy', label: 'Ofertas no conteúdo', type: 'select', options: [['by_intent', 'Só quando a intenção pedir'], ['soft', 'Menção leve'], ['never', 'Nunca']] },
    { key: 'status', label: 'Estado ao ativar', type: 'select', options: [['active', 'Ativo para produção'], ['draft', 'Rascunho']] },
    { key: 'needs_recalibration', label: 'O que ainda falta decidir', type: 'textarea', optional: true },
  ],
  editorials: [
    { key: 'name', label: 'Nome', type: 'text' }, { key: 'objetivo', label: 'Propósito', type: 'textarea' }, { key: 'territorio', label: 'Território', type: 'text' },
    { key: 'front_ref', label: 'Frente (vazio = todas)', type: 'ref', ref: 'fronts', optional: true }, { key: 'perguntas', label: 'Perguntas que responde (uma por linha)', type: 'list' },
    { key: 'material', label: 'Material-fonte', type: 'textarea' }, { key: 'exemplo', label: 'Exemplo de pauta', type: 'textarea' },
  ],
};
const TITLE_FIELD: Record<Exclude<SetupBlock, 'brand'>, string> = { emitters: 'name', fronts: 'name', audiences: 'name', profiles: 'name', editorials: 'name' };

export function BlockCard({ block, proposal, draft, busy, onGenerate, onChange, onAccept, onAdjust, onSkip }: {
  block: SetupBlock; proposal?: BlockProposal; draft: Draft; busy: boolean;
  onGenerate: () => void; onChange: (p: BlockProposal, note: string) => void; onAccept: () => void; onAdjust: (text: string) => void; onSkip?: () => void;
}) {
  const [editing, setEditing] = useState<number | 'essence' | null>(null);
  const [adjust, setAdjust] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const L = BLOCK_LABELS[block];
  const accepted = proposal?.status === 'accepted';

  return (
    <section className={`space-y-3 rounded-2xl border p-4 ${accepted ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-card'}`} data-testid={`block-${block}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold">{L.title}
            {accepted && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400" data-testid="block-accepted"><Check className="mr-0.5 inline h-3 w-3" />Bloco aceito</span>}
            {proposal?.status === 'skipped' && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">Mantido como está</span>}
          </p>
          <p className="text-xs text-muted-foreground">{L.hint}</p>
        </div>
        {!proposal && (
          <div className="flex gap-2">
            {onSkip && <Button size="sm" variant="ghost" onClick={onSkip} disabled={busy}>Manter como está</Button>}
            <Button size="sm" variant="accent" onClick={onGenerate} disabled={busy} data-testid={`propose-${block}`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Ver proposta da Hive
            </Button>
          </div>
        )}
      </div>

      {proposal && proposal.status !== 'skipped' && (
        <>
          {proposal.summary && <p className="text-sm">{proposal.summary}</p>}

          {block === 'brand' ? (
            <div className="space-y-2 rounded-xl border bg-background p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Natureza da contribuição</p>
                {proposal.origin && <OriginTag o={proposal.origin} />}</div>
              {editing === 'essence' ? (
                <EssenceEditor value={proposal.essence ?? ''} onSave={(v) => { onChange({ ...proposal, essence: v, origin: 'declared', status: 'proposed' }, 'essência editada'); setEditing(null); }} onCancel={() => setEditing(null)} />
              ) : (
                <p data-testid="brand-essence">{proposal.essence} <button type="button" className="ml-1 text-xs text-accent" onClick={() => setEditing('essence')}><Pencil className="inline h-3 w-3" /> editar</button></p>
              )}
              {(proposal.genesis_notes ?? []).length > 0 && (
                <ul className="space-y-1 text-xs">{proposal.genesis_notes!.map((n, i) => <li key={i} className="flex gap-2"><OriginTag o={n.origin} /> <span>{n.text}</span></li>)}</ul>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {(proposal.items ?? []).map((it, i) => (
                <div key={it.ref + i} className={`rounded-xl border bg-background p-3 text-sm ${it.action === 'archive' ? 'opacity-60' : ''}`} data-testid="proposal-item" data-action={it.action}>
                  {editing === i ? (
                    <ItemEditor block={block as Exclude<SetupBlock, 'brand'>} item={it} draft={draft}
                      onSave={(patch) => { const items = [...proposal.items!]; items[i] = editItem(it, patch); onChange({ ...proposal, items, status: 'proposed' }, `item editado: ${String(it.name ?? it.ref)}`); setEditing(null); }}
                      onCancel={() => setEditing(null)} />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{String(it[TITLE_FIELD[block as Exclude<SetupBlock, 'brand'>]] ?? '—')}
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">{ACTION_LABELS[it.action]}</span></p>
                        <div className="flex items-center gap-1.5">
                          <OriginTag o={it.origin} />
                          <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setEditing(i)} aria-label="Editar item" data-testid="item-edit"><Pencil className="h-3.5 w-3.5" /></button>
                          {it.action === 'create'
                            ? <button type="button" className="rounded p-1 text-muted-foreground hover:text-rose-600" aria-label="Remover item" onClick={() => onChange({ ...proposal, items: proposal.items!.filter((_, j) => j !== i), status: 'proposed' }, 'item removido')}><Trash2 className="h-3.5 w-3.5" /></button>
                            : block !== 'emitters' && <button type="button" className="rounded p-1 text-muted-foreground hover:text-rose-600" aria-label={it.action === 'archive' ? 'Manter item' : 'Arquivar item'}
                                onClick={() => { const items = [...proposal.items!]; items[i] = { ...it, action: it.action === 'archive' ? 'keep' : 'archive', origin: 'declared' }; onChange({ ...proposal, items, status: 'proposed' }, 'arquivar/manter'); }}>
                                {it.action === 'archive' ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}</button>}
                        </div>
                      </div>
                      <ItemSummary block={block as Exclude<SetupBlock, 'brand'>} item={it} draft={draft} />
                      {(it.changes ?? []).length > 0 && it.action !== 'keep' && <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{it.changes!.map((c, j) => <li key={j}>{c}</li>)}</ul>}
                      {it.why && <p className="mt-1 text-xs italic text-muted-foreground">{it.why}</p>}
                    </>
                  )}
                </div>
              ))}
              {block !== 'emitters' && (
                <Button size="sm" variant="ghost" onClick={() => {
                  const ref = `new:${block}-${Math.random().toString(36).slice(2, 7)}`;
                  const items = [...(proposal.items ?? []), { ref, action: 'create', origin: 'declared', name: '' } as ProposalItem];
                  onChange({ ...proposal, items, status: 'proposed' }, 'item acrescentado'); setEditing(items.length - 1);
                }} data-testid={`add-${block}`}><Plus className="h-3.5 w-3.5" /> Acrescentar</Button>
              )}
            </div>
          )}

          {(proposal.hypotheses ?? []).length > 0 && (
            <div className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300" data-testid="block-hypotheses">
              <p className="font-semibold">Ainda é hipótese:</p>
              <ul className="list-disc pl-4">{proposal.hypotheses!.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!accepted && <Button size="sm" variant="accent" onClick={onAccept} disabled={busy} data-testid={`accept-${block}`}><Check className="h-3.5 w-3.5" /> Aceitar bloco</Button>}
            {accepted && <Button size="sm" variant="outline" onClick={() => onChange({ ...proposal, status: 'proposed' }, 'reaberto')} disabled={busy}>Reabrir</Button>}
            <Button size="sm" variant="outline" onClick={() => setShowAdjust((v) => !v)} disabled={busy} data-testid={`adjust-${block}`}><RefreshCw className="h-3.5 w-3.5" /> Pedir ajuste</Button>
          </div>
          {showAdjust && (
            <div className="flex gap-2">
              <Input aria-label={`Ajuste do bloco ${L.title}`} value={adjust} onChange={(e) => setAdjust(e.target.value)} placeholder="O que a Hive deve mudar neste bloco?" />
              <Button size="sm" variant="accent" disabled={busy || !adjust.trim()} onClick={() => { onAdjust(adjust.trim()); setAdjust(''); setShowAdjust(false); }} data-testid={`adjust-send-${block}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refazer proposta'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function OriginTag({ o }: { o: Origin }) {
  const x = ORIGIN_LABELS[o] ?? ORIGIN_LABELS.hypothesis;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${x.cls}`} data-testid="origin-tag">{x.label}</span>;
}

function ItemSummary({ block, item, draft }: { block: Exclude<SetupBlock, 'brand'>; item: ProposalItem; draft: Draft }) {
  const s = (k: string) => (item[k] == null ? '' : String(item[k]));
  const list = (k: string) => (Array.isArray(item[k]) ? (item[k] as string[]) : []);
  const line = (label: string, v: string) => (v ? <p className="text-xs"><span className="text-muted-foreground">{label}:</span> {v}</p> : null);
  if (block === 'emitters') return <div className="space-y-0.5">{line('Tipo', s('kind') === 'institutional' ? 'voz institucional' : 'pessoa')}{line('Voz', s('voice').slice(0, 220))}{line('Lugar de fala', s('speaking_rules'))}{line('Autoridade', s('authority'))}</div>;
  if (block === 'fronts') return <div className="space-y-0.5">{line('O que faz', s('description'))}{line('Territórios', list('territories').join(' · '))}{line('Ofertas', list('offers').join(', '))}</div>;
  if (block === 'audiences') return <div className="space-y-0.5">{line('Frente', item.front_ref ? nameOf(draft, 'fronts', s('front_ref')) : '')}{line('Quem são', s('definition'))}{line('Situações', list('situations').join(' · '))}{line('Situação', s('status') === 'active' ? 'definido' : s('status') ? 'hipótese a validar' : '')}</div>;
  if (block === 'profiles') return (
    <div className="space-y-0.5">
      <p className="text-xs" data-testid="profile-composition">{[nameOf(draft, 'emitters', s('emitter_ref')), nameOf(draft, 'fronts', s('front_ref')), item.primary_audience_ref ? nameOf(draft, 'audiences', s('primary_audience_ref')) : 'público a definir'].join(' · ')}</p>
      {line('Posicionamento', s('positioning'))}{line('Expressão', s('expression'))}{line('Falta decidir', s('needs_recalibration'))}
      {line('Ao ativar', s('status') === 'draft' ? 'fica em rascunho' : s('status') === 'active' ? 'ativo para produção' : '')}
    </div>
  );
  return <div className="space-y-0.5">{line('Propósito', s('objetivo'))}{line('Território', s('territorio'))}{line('Frente', item.front_ref ? nameOf(draft, 'fronts', s('front_ref')) : 'todas')}{line('Perguntas', list('perguntas').join(' · '))}{line('Exemplo', s('exemplo'))}</div>;
}

function ItemEditor({ block, item, draft, onSave, onCancel }: { block: Exclude<SetupBlock, 'brand'>; item: ProposalItem; draft: Draft; onSave: (patch: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({ ...item }));
  return (
    <div className="space-y-2" data-testid="item-editor">
      {F[block].map((f) => (
        <label key={f.key} className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{f.label}</span>
          {f.type === 'text' && <Input aria-label={f.label} value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
          {f.type === 'textarea' && <Textarea aria-label={f.label} rows={2} value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
          {f.type === 'list' && <Textarea aria-label={f.label} rows={3} value={(Array.isArray(v[f.key]) ? (v[f.key] as string[]) : []).join('\n')} onChange={(e) => setV({ ...v, [f.key]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />}
          {f.type === 'bool' && <input type="checkbox" aria-label={f.label} checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />}
          {f.type === 'select' && (
            <select aria-label={f.label} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
              <option value="">—</option>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          {f.type === 'ref' && (
            <select aria-label={f.label} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value || (f.optional ? null : v[f.key]) })}>
              {f.optional && <option value="">—</option>}
              {draft[f.ref!].map((x) => <option key={x.id} value={x.id}>{x.name}{x.draft ? ' (nova)' : ''}</option>)}
            </select>
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="accent" onClick={() => onSave(Object.fromEntries(F[block].filter((f) => v[f.key] !== undefined && (v[f.key] !== null || f.type === 'ref')).map((f) => [f.key, v[f.key]])))} disabled={!String(v.name ?? '').trim()} data-testid="item-save">Salvar</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function EssenceEditor({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="space-y-2">
      <Textarea aria-label="Natureza da contribuição" rows={3} value={v} onChange={(e) => setV(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" variant="accent" onClick={() => onSave(v.trim())} disabled={!v.trim()}>Salvar</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button></div>
    </div>
  );
}
