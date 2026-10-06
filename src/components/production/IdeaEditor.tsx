import { useState } from 'react';
import { Instagram, Linkedin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ACJ_META } from '@/lib/acj/library';
import { ACJ_IDS, FUNCTION_LABELS, STRATEGIC_FUNCTIONS, type AcjId, type BeeEditorial, type IdeaChannel, type SocialAccount, type StrategicFunction } from '@/types';

export interface IdeaDraft { title: string; summary: string; strategic_function: StrategicFunction; editorial_slug: string; channels: IdeaChannel[]; acj_primary?: AcjId | null; acj_secondary?: AcjId | null }

// Edição inline de uma ideia (ou criação de uma nova, origin 'user').
export function IdeaEditor({ initial, editorials, accounts, onSave, onCancel, saveLabel = 'Salvar ideia', busy }: {
  initial: IdeaDraft; editorials: BeeEditorial[]; accounts: SocialAccount[];
  onSave: (d: IdeaDraft) => void | Promise<void>; onCancel: () => void; saveLabel?: string; busy?: boolean;
}) {
  const [d, setD] = useState<IdeaDraft>(initial);
  const has = (a: SocialAccount) => d.channels.some((c) => c.account_id === a.id);
  const toggle = (a: SocialAccount) => setD({
    ...d,
    channels: has(a) ? d.channels.filter((c) => c.account_id !== a.id) : [...d.channels, { account_id: a.id, platform: a.platform }],
  });
  return (
    <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-4" data-testid="idea-editor">
      <div className="space-y-1">
        <Label htmlFor="idea-title">Título da ideia</Label>
        <Input id="idea-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Ex.: Por que bons líderes repetem velhos padrões?" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="idea-summary">Direção do pensamento</Label>
        <Textarea id="idea-summary" rows={2} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="idea-fn">Função estratégica</Label>
          <select id="idea-fn" value={d.strategic_function} onChange={(e) => setD({ ...d, strategic_function: e.target.value as StrategicFunction })}
            className="w-full rounded-md border border-input bg-background p-2 text-sm">
            {STRATEGIC_FUNCTIONS.map((f) => <option key={f} value={f}>{FUNCTION_LABELS[f]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="idea-ed">Editorial</Label>
          <select id="idea-ed" value={d.editorial_slug} onChange={(e) => setD({ ...d, editorial_slug: e.target.value })}
            className="w-full rounded-md border border-input bg-background p-2 text-sm">
            {editorials.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="idea-acj">Movimento relacional (ACJ primária)</Label>
          <select id="idea-acj" value={d.acj_primary ?? ''} onChange={(e) => {
            const v = (e.target.value || null) as AcjId | null;
            setD({ ...d, acj_primary: v, acj_secondary: d.acj_secondary === v ? null : d.acj_secondary });
          }} className="w-full rounded-md border border-input bg-background p-2 text-sm">
            <option value="">— Sem ACJ (a Hive atribui ao desenvolver)</option>
            {ACJ_IDS.map((id) => <option key={id} value={id}>{id} {ACJ_META[id].name} — {ACJ_META[id].short}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="idea-acj2">ACJ secundária (opcional)</Label>
          <select id="idea-acj2" value={d.acj_secondary ?? ''} disabled={!d.acj_primary} onChange={(e) => setD({ ...d, acj_secondary: (e.target.value || null) as AcjId | null })}
            className="w-full rounded-md border border-input bg-background p-2 text-sm disabled:opacity-50">
            <option value="">— Nenhuma</option>
            {ACJ_IDS.filter((id) => id !== d.acj_primary).map((id) => <option key={id} value={id}>{id} {ACJ_META[id].name}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Onde vai ganhar forma</p>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button key={a.id} type="button" onClick={() => toggle(a)} aria-pressed={has(a)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${has(a) ? 'border-accent bg-accent/15' : 'hover:bg-accent/5'}`}>
              {a.platform === 'linkedin' ? <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" /> : <Instagram className="h-3.5 w-3.5 text-[#E1306C]" />}
              {a.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="accent" size="sm" disabled={busy || !d.title.trim() || d.channels.length === 0} onClick={() => onSave({ ...d, title: d.title.trim(), summary: d.summary.trim() })}>{saveLabel}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
