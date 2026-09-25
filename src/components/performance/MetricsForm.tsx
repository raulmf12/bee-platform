// Registro manual de resultados (LinkedIn não tem API de leitura de métricas).
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { metricsApi } from '@/lib/campaignApi';
import type { PostMetrics, UserPost } from '@/types';

const FIELDS: Array<{ key: 'impressions' | 'likes' | 'comments' | 'shares'; label: string }> = [
  { key: 'impressions', label: 'Impressões' },
  { key: 'likes', label: 'Reações' },
  { key: 'comments', label: 'Comentários' },
  { key: 'shares', label: 'Compartilhamentos' },
];

export function MetricsForm({ post, current, onSaved, onCancel }: {
  post: UserPost; current?: PostMetrics | null; onSaved: (m: PostMetrics) => void; onCancel: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, current?.[f.key] != null ? String(current[f.key]) : ''])));
  const [saving, setSaving] = useState(false);
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s))));
  const valid = FIELDS.some((f) => num(v[f.key]) != null) && FIELDS.every((f) => v[f.key].trim() === '' || Number.isFinite(Number(v[f.key])));

  async function save() {
    setSaving(true);
    try {
      const m = await metricsApi.upsertManual(post.id, post.account_id ?? null, Object.fromEntries(FIELDS.map((f) => [f.key, num(v[f.key])])));
      toast.success('Resultados registrados.');
      onSaved(m);
    } catch (e) {
      toast.error((e as Error).message.slice(0, 160));
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3" data-testid="metrics-form">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-xs">
            <span className="text-muted-foreground">{f.label}</span>
            <Input type="number" min={0} inputMode="numeric" aria-label={f.label} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className="h-8" />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="accent" disabled={!valid || saving} onClick={save}>{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar resultados</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
