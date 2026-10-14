// PLANO DE PEÇAS de um conteúdo-mãe aprovado (Conteúdos sequenciais §5, §7.2): cards por
// desdobramento com conta, canal, formato, abordagem e propósito. A Hive recomenda sob pedido;
// o autor aceita, acrescenta ou remove. Cada item tem ID próprio (retomada sem duplicar).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Instagram, Layers, Linkedin, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ARCHITECTURE_LABELS, FORMAT_LABELS, capabilities, planApi } from '@/lib/sequence/service';
import { useAuthStore } from '@/store/authStore';
import type { Content, FormatCapability, PiecePlan, SocialAccount, UserPost } from '@/types';

type Suggestion = Pick<PiecePlan, 'account_id' | 'platform' | 'format' | 'approach' | 'purpose' | 'architecture'>;
const STATUS = { planned: 'planejada', produced: 'produzida', removed: 'removida' } as const;

export function PiecePlanPanel({ content, plans, pieces, accounts, onChanged }: {
  content: Content; plans: PiecePlan[]; pieces: UserPost[]; accounts: SocialAccount[]; onChanged: (produce: boolean) => Promise<void> | void;
}) {
  const { currentUser } = useAuthStore();
  const [caps, setCaps] = useState<FormatCapability[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [form, setForm] = useState<{ account_id: string; format: string; approach: string }>({ account_id: accounts[0]?.id ?? '', format: 'carousel', approach: '' });
  useEffect(() => { capabilities().then(setCaps).catch(() => setCaps([])); }, []);
  const acc = (id?: string | null) => accounts.find((a) => a.id === id);
  const live = plans.filter((p) => p.status !== 'removed');
  const formatsFor = (platform?: string) => caps.filter((c) => c.platform === platform).map((c) => c.format);

  async function add(s: Suggestion, origin: 'hive' | 'user') {
    if (!currentUser) return;
    await planApi.add(currentUser.id, content, { ...s, origin });
  }
  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    try { return await fn(); } catch (e) { toast.error((e as Error).message.slice(0, 200)); return undefined; } finally { setBusy(null); }
  }
  const pending = live.filter((p) => p.status === 'planned' && !p.post_id);

  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3" data-testid="piece-plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => setOpen((v) => !v)} data-testid="plan-toggle">
          <Layers className="h-3.5 w-3.5" /> Plano de peças · {live.length} desdobramento{live.length === 1 ? '' : 's'}{pending.length ? ` · ${pending.length} a produzir` : ''}
        </button>
        <div className="flex gap-1.5">
          {pending.length > 0 && <Button size="sm" variant="accent" disabled={!!busy} onClick={() => run('produce', async () => { await onChanged(true); })} data-testid="plan-produce">Produzir planejadas</Button>}
          {!open && <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Planejar</Button>}
        </div>
      </div>
      {open && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {live.map((p) => {
              const piece = pieces.find((x) => x.id === p.post_id);
              return (
                <div key={p.id} className="space-y-1 rounded-lg border bg-background p-2.5 text-xs" data-testid="plan-item" data-format={p.format}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold">{p.platform === 'linkedin' ? <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" /> : <Instagram className="h-3.5 w-3.5 text-[#E1306C]" />}
                      {FORMAT_LABELS[p.format]} · {acc(p.account_id)?.label ?? 'conta'}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">{STATUS[p.status]}{piece && ['approved', 'scheduled', 'published'].includes(piece.status) ? ' · aprovada' : ''}</span>
                      <button type="button" aria-label="Remover do plano" className="text-muted-foreground hover:text-rose-600" disabled={!!busy}
                        onClick={() => run(`rm-${p.id}`, async () => { await planApi.remove(p, piece); await onChanged(false); })}><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </div>
                  {p.approach && <p>{p.approach}{p.architecture ? ` · ${ARCHITECTURE_LABELS[p.architecture] ?? p.architecture}` : ''}</p>}
                  {p.purpose && <p className="text-muted-foreground">{p.purpose}</p>}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('suggest', async () => setSuggestions(await planApi.recommend(content.id)))} data-testid="plan-suggest">
              {busy === 'suggest' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Sugestões da Hive
            </Button>
          </div>
          {suggestions && (
            <div className="space-y-1.5" data-testid="plan-suggestions">
              {!suggestions.length && <p className="text-xs text-muted-foreground">A Hive não vê outra peça com ganho real para este conteúdo.</p>}
              {suggestions.map((s, i) => (
                <div key={i} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-accent/5 p-2 text-xs" data-testid="plan-suggestion">
                  <div className="min-w-0"><p className="font-semibold">{FORMAT_LABELS[s.format]} · {s.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {acc(s.account_id)?.label}{s.approach ? ` — ${s.approach}` : ''}</p>
                    {s.purpose && <p className="text-muted-foreground">{s.purpose}</p>}</div>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`add-${i}`, async () => { await add(s, 'hive'); setSuggestions((x) => (x ?? []).filter((_, j) => j !== i)); await onChanged(false); })} data-testid="plan-accept">Adicionar</Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 rounded-lg border bg-background p-2.5 text-xs sm:grid-cols-[1fr_1fr_2fr_auto]" data-testid="plan-form">
            <select aria-label="Conta da peça" className="h-8 rounded-md border bg-background px-2" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {a.label}</option>)}
            </select>
            <select aria-label="Formato da peça" className="h-8 rounded-md border bg-background px-2" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
              {formatsFor(acc(form.account_id)?.platform).map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
            <Input aria-label="Abordagem da peça" className="h-8 text-xs" value={form.approach} onChange={(e) => setForm({ ...form, approach: e.target.value })} placeholder="Abordagem (ex.: a dinâmica organizacional)" />
            <Button size="sm" variant="outline" disabled={!!busy || !form.account_id || !formatsFor(acc(form.account_id)?.platform).includes(form.format as never)}
              onClick={() => run('add', async () => {
                const a = acc(form.account_id)!;
                await add({ account_id: a.id, platform: a.platform as 'linkedin' | 'instagram', format: form.format as PiecePlan['format'], approach: form.approach.trim() || null, purpose: null, architecture: null }, 'user');
                setForm({ ...form, approach: '' }); await onChanged(false);
              })} data-testid="plan-add"><Plus className="h-3.5 w-3.5" /> Acrescentar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
