// Jornada relacional (ACJ) — Resultados por ACJ + Registro Vivo de Aprendizagens.
// dado → observação → hipótese → teste → aprendizagem → princípio consolidado.
// Nada aqui altera as ACJs: aprendizagem provisória fica no registro até validação humana.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BookOpenCheck, Loader2, MessageSquareText, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AcjChip } from '@/components/acj/AcjChip';
import { edge } from '@/lib/edge';
import { campaignApi } from '@/lib/campaignApi';
import { acjLearningApi, acjResultsApi } from '@/lib/acj/api';
import {
  ACJ_META, CAUSE_LABELS, CHANGE_CLASS_LABELS, CONFIDENCE_LABELS, EVIDENCE_LABELS, LEARNING_STATUS_LABELS, LEARNING_TRANSITIONS, acjColor,
} from '@/lib/acj/library';
import { useAuthStore } from '@/store/authStore';
import {
  ACJ_IDS, type AcjChangeClass, type AcjConfidence, type AcjId, type AcjLearningDecision, type AcjLearningEntry, type AcjLearningEvidence,
  type AcjLearningStatus, type AcjPieceResult, type AcjSignalReading, type Campaign, type PostComment,
} from '@/types';

type Tab = 'resultados' | 'registro';
const avg = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

export function RegistroVivo() {
  const [tab, setTab] = useState<Tab>('resultados');
  const [seed, setSeed] = useState<Partial<AcjLearningEntry> | null>(null);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Jornada relacional (ACJ)</h1>
        <p className="text-sm text-muted-foreground">O que cada movimento produziu e o que a Hive está aprendendo — sem transformar sinais isolados em princípios.</p>
      </div>
      <div className="flex gap-2" role="tablist">
        {(['resultados', 'registro'] as const).map((t) => (
          <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'accent' : 'outline'} size="sm" onClick={() => setTab(t)}>
            {t === 'resultados' ? 'Resultados por ACJ' : 'Registro Vivo'}
          </Button>
        ))}
      </div>
      {tab === 'resultados'
        ? <Results onOpenEntry={(e) => { setSeed(e); setTab('registro'); }} />
        : <Register seed={seed} onSeedUsed={() => setSeed(null)} />}
    </div>
  );
}

// =============================== RESULTADOS ===============================
function Results({ onOpenEntry }: { onOpenEntry: (e: Partial<AcjLearningEntry>) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [rows, setRows] = useState<AcjPieceResult[] | null>(null);
  const [readings, setReadings] = useState<Record<string, AcjSignalReading>>({});
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    campaignApi.list().then((c) => { setCampaigns(c); setCampaignId((id) => id || c.find((x) => x.status === 'active')?.id || c[0]?.id || ''); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!campaignId) { setRows([]); return; }
    setRows(null);
    acjResultsApi.byCampaign(campaignId).then(async (r) => {
      setRows(r);
      const rs = await acjResultsApi.readings(r.map((x) => x.post_id));
      const latest: Record<string, AcjSignalReading> = {};
      for (const x of rs) if (!latest[x.post_id]) latest[x.post_id] = x;
      setReadings(latest);
    }).catch(() => setRows([]));
  }, [campaignId]);

  const published = (rows ?? []).filter((r) => r.status === 'published');
  const byAcj = useMemo(() => ACJ_IDS.map((id) => {
    const list = published.filter((r) => r.acj_primary === id);
    return { id, n: list.length, reach: avg(list.map((r) => r.reach)), saves: avg(list.map((r) => r.saves)), comments: list.reduce((a, r) => a + (r.audience_comments ?? 0), 0),
      strong: list.filter((r) => readings[r.post_id]?.movement_evidence === 'strong').length };
  }), [published, readings]);
  const legacy = published.filter((r) => !r.acj_primary).length;

  async function openComments(postId: string) {
    if (openPost === postId) { setOpenPost(null); return; }
    setOpenPost(postId);
    setComments(await acjResultsApi.comments(postId).catch(() => []));
  }
  async function read(r: AcjPieceResult) {
    setBusy(r.post_id);
    try {
      const { reading } = await edge.acjReadSignals({ post_id: r.post_id });
      const saved = await acjResultsApi.saveReading(reading);
      setReadings((m) => ({ ...m, [r.post_id]: saved }));
    } catch (e) { toast.error((e as Error).message.slice(0, 160)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5" data-testid="acj-results">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="acj-campaign">Campanha</Label>
        <select id="acj-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm">
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {rows === null ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="acj-results-summary">
            {byAcj.map((x) => (
              <div key={x.id} className="rounded-2xl border bg-card p-4" style={{ borderTopColor: acjColor(x.id), borderTopWidth: 3 }} data-testid={`acj-result-${x.id}`}>
                <p className="text-xs font-semibold">{x.id} {ACJ_META[x.id].name}</p>
                <p className="font-display text-2xl font-bold">{x.n}</p>
                <p className="text-xs text-muted-foreground">peça{x.n === 1 ? '' : 's'} publicada{x.n === 1 ? '' : 's'}</p>
                <p className="mt-2 text-xs text-muted-foreground">Alcance médio {x.reach ?? '—'} · salvamentos {x.saves ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{x.comments} comentário(s) da audiência · {x.strong} com sinal forte</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Alcance e curtidas não comprovam um movimento por si só: a leitura dos comentários separa arquitetura, conteúdo, execução, distribuição e contexto.
            {legacy ? ` ${legacy} peça(s) publicada(s) antes da ACJ ficam como legado (sem reclassificação).` : ''}
          </p>
          <ul className="divide-y rounded-2xl border bg-card" data-testid="acj-results-list">
            {published.filter((r) => r.acj_primary).map((r) => {
              const rd = readings[r.post_id];
              return (
                <li key={r.post_id} className="space-y-2 p-4" data-testid="acj-result-row">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <AcjChip id={r.acj_primary} size="xs" />
                    <span className="text-muted-foreground">{r.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {r.published_at?.slice(0, 10)}</span>
                    <span className="text-muted-foreground">alcance {r.reach ?? '—'} · curtidas {r.likes ?? '—'} · salvamentos {r.saves ?? '—'}</span>
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openComments(r.post_id)}><MessageSquareText className="h-3.5 w-3.5" /> {r.audience_comments} comentário(s)</Button>
                      <Button size="sm" variant="outline" onClick={() => read(r)} disabled={busy === r.post_id} data-testid="acj-read-signals">
                        {busy === r.post_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Ler sinais
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onOpenEntry({
                        title: `Observação em peça ${r.acj_primary}`, acj_ids: [r.acj_primary!], object_type: 'piece', post_id: r.post_id, campaign_id: r.campaign_id, cycle_id: r.cycle_id, content_id: r.content_id,
                        observed_fact: rd?.summary ?? '', sources: ['audience'], probable_causes: (rd?.probable_causes ?? []) as AcjLearningEntry['probable_causes'],
                      })}><BookOpenCheck className="h-3.5 w-3.5" /> Abrir registro</Button>
                    </span>
                  </div>
                  {rd && (
                    <div className="rounded-lg bg-secondary/50 p-3 text-sm" data-testid="acj-reading">
                      <p className="font-medium">{rd.movement_evidence ? EVIDENCE_LABELS[rd.movement_evidence] : ''}{rd.probable_causes.length ? <span className="font-normal text-muted-foreground"> · causas prováveis: {rd.probable_causes.map((c) => CAUSE_LABELS[c as keyof typeof CAUSE_LABELS] ?? c).join(', ')}</span> : null}</p>
                      {rd.summary && <p>{rd.summary}</p>}
                      {rd.signals.length > 0 && <ul className="mt-1 list-disc pl-4 text-muted-foreground">{rd.signals.map((s, i) => <li key={i}>{s.type}{s.excerpt ? `: “${s.excerpt}”` : ''}</li>)}</ul>}
                      {rd.limitations && <p className="mt-1 text-xs text-muted-foreground">Limitações: {rd.limitations}</p>}
                    </div>
                  )}
                  {openPost === r.post_id && (
                    <ul className="space-y-1 text-sm" data-testid="acj-comments">
                      {comments.length === 0 && <li className="text-muted-foreground">Nenhum comentário importado. (Comentários do Instagram exigem reconectar a conta com a permissão de comentários.)</li>}
                      {comments.map((c) => <li key={c.id} className={c.is_own ? 'pl-4 text-muted-foreground' : ''}>{c.is_own ? '↳ você: ' : ''}{c.text}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
            {published.filter((r) => r.acj_primary).length === 0 && <li className="p-4 text-sm text-muted-foreground">Ainda não há peças publicadas com ACJ nesta campanha.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

// =============================== REGISTRO VIVO ===============================
const EMPTY = { title: '', observed_fact: '', context: '', acj_ids: [] as AcjId[], sources: ['marcos'] as string[] };

function Register({ seed, onSeedUsed }: { seed: Partial<AcjLearningEntry> | null; onSeedUsed: () => void }) {
  const { currentUser } = useAuthStore();
  const [entries, setEntries] = useState<AcjLearningEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<AcjLearningEntry> | null>(null);
  const load = useCallback(async () => setEntries(await acjLearningApi.list()), []);
  useEffect(() => { void load().catch(() => setEntries([])); }, [load]);
  useEffect(() => { if (seed) { setDraft({ ...EMPTY, ...seed }); setSelected(null); onSeedUsed(); } }, [seed, onSeedUsed]);

  async function create() {
    if (!draft?.title?.trim() || !draft.observed_fact?.trim()) { toast.error('Título e fato observado são obrigatórios.'); return; }
    try {
      const e = await acjLearningApi.create({ ...draft, title: draft.title.trim(), observed_fact: draft.observed_fact.trim() } as AcjLearningEntry);
      setDraft(null); await load(); setSelected(e.id);
      toast.success(`Registro ${e.code} aberto.`);
    } catch (err) { toast.error((err as Error).message.slice(0, 180)); }
  }

  const current = entries?.find((e) => e.id === selected) ?? null;
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]" data-testid="acj-register">
      <div className="space-y-3">
        <Button variant="accent" size="sm" onClick={() => { setDraft({ ...EMPTY }); setSelected(null); }}><Plus className="h-4 w-4" /> Nova observação</Button>
        {entries === null ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : (
          <ul className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { setSelected(e.id); setDraft(null); }} data-testid="acj-entry"
                  className={`w-full rounded-xl border p-3 text-left text-sm ${selected === e.id ? 'border-accent bg-accent/5' : 'hover:bg-accent/5'}`}>
                  <p className="text-xs font-semibold text-muted-foreground">{e.code} · {LEARNING_STATUS_LABELS[e.status]}</p>
                  <p className="font-medium">{e.title}</p>
                </button>
              </li>
            ))}
            {entries.length === 0 && <li className="text-sm text-muted-foreground">Nenhum registro ainda. Uma observação vira hipótese só quando houver base.</li>}
          </ul>
        )}
      </div>
      <div>
        {draft && (
          <div className="space-y-3 rounded-2xl border bg-card p-5" data-testid="acj-entry-form">
            <p className="font-display text-lg font-semibold">Nova observação</p>
            <div className="space-y-1"><Label htmlFor="e-title">Título provisório (sem antecipar conclusão)</Label>
              <Input id="e-title" value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="e-fact">Fato observado (sem atribuição causal)</Label>
              <Textarea id="e-fact" rows={3} value={draft.observed_fact ?? ''} onChange={(e) => setDraft({ ...draft, observed_fact: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="e-ctx">Contexto (público, fase, canal, período, distribuição, fatores externos)</Label>
              <Textarea id="e-ctx" rows={2} value={draft.context ?? ''} onChange={(e) => setDraft({ ...draft, context: e.target.value })} /></div>
            <div className="flex flex-wrap gap-2">
              {ACJ_IDS.map((id) => {
                const on = draft.acj_ids?.includes(id);
                return <button key={id} type="button" aria-pressed={on} onClick={() => setDraft({ ...draft, acj_ids: on ? draft.acj_ids!.filter((x) => x !== id) : [...(draft.acj_ids ?? []), id] })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-accent bg-accent/15' : ''}`}>{id} {ACJ_META[id].name}</button>;
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['marcos', 'audience', 'journey'] as const).map((s) => {
                const on = draft.sources?.includes(s);
                return <button key={s} type="button" aria-pressed={on} onClick={() => setDraft({ ...draft, sources: on ? draft.sources!.filter((x) => x !== s) : [...(draft.sources ?? []), s] })}
                  className={`rounded-full border px-2.5 py-0.5 ${on ? 'border-accent bg-accent/15' : ''}`}>{s === 'marcos' ? 'Feedback do Marcos' : s === 'audience' ? 'Resposta da audiência' : 'Resultado da jornada'}</button>;
              })}
            </div>
            <div className="flex gap-2"><Button variant="accent" onClick={create}>Abrir registro</Button><Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button></div>
          </div>
        )}
        {current && !draft && <EntryDetail key={current.id} entry={current} userId={currentUser?.id ?? null} onChange={(e) => setEntries((l) => (l ?? []).map((x) => (x.id === e.id ? e : x)))} />}
        {!current && !draft && <p className="text-sm text-muted-foreground">Selecione um registro ou abra uma nova observação.</p>}
      </div>
    </div>
  );
}

function EntryDetail({ entry, userId, onChange }: { entry: AcjLearningEntry; userId: string | null; onChange: (e: AcjLearningEntry) => void }) {
  const [e, setE] = useState(entry);
  const [evidence, setEvidence] = useState<AcjLearningEvidence[]>([]);
  const [decisions, setDecisions] = useState<AcjLearningDecision[]>([]);
  const [ev, setEv] = useState({ source: 'audience' as AcjLearningEvidence['source'], description: '', limitations: '' });
  const [reopen, setReopen] = useState('');
  const [affected, setAffected] = useState(entry.affected_document ?? '');
  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([acjLearningApi.evidence(entry.id), acjLearningApi.decisions(entry.id)]);
    setEvidence(a); setDecisions(b);
  }, [entry.id]);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);

  async function save(patch: Partial<AcjLearningEntry>, msg?: string) {
    try {
      const u = await acjLearningApi.update(e.id, patch);
      setE(u); onChange(u); await refresh();
      if (msg) toast.success(msg);
    } catch (err) { toast.error((err as Error).message.replace(/^.*?:\s*/, '').slice(0, 200)); }
  }
  function move(to: AcjLearningStatus) {
    const closed = ['rejected', 'inconclusive'].includes(e.status);
    if (closed && !reopen.trim()) { toast.error('Reabrir exige justificativa e nova evidência.'); return; }
    if (to === 'consolidated' && !affected.trim()) { toast.error('Informe o documento afetado (nova versão).'); return; }
    // Validar/consolidar = decisão humana registrada (quem e quando).
    const human = to === 'validated' || to === 'consolidated' ? { approved_by: userId, approved_at: new Date().toISOString() } : {};
    void save({ status: to, ...human, ...(closed ? { reopen_reason: reopen.trim() } : {}), ...(to === 'consolidated' ? { affected_document: affected.trim(), promotion_status: 'promoted' as const } : {}) }, `Status: ${LEARNING_STATUS_LABELS[to]}.`);
  }
  async function addEvidence() {
    if (!ev.description.trim()) return;
    try {
      await acjLearningApi.addEvidence({ entry_id: e.id, source: ev.source, post_id: e.post_id, content_id: e.content_id, description: ev.description.trim(), data: {}, limitations: ev.limitations.trim() || null });
      setEv({ ...ev, description: '', limitations: '' }); await refresh();
    } catch (err) { toast.error((err as Error).message.slice(0, 160)); }
  }

  const field = (k: 'candidate_pattern' | 'hypothesis' | 'alternatives' | 'next_action', label: string) => (
    <div className="space-y-1"><Label htmlFor={`f-${k}`}>{label}</Label>
      <Textarea id={`f-${k}`} rows={2} defaultValue={e[k] ?? ''} onBlur={(x) => x.target.value !== (e[k] ?? '') && save({ [k]: x.target.value } as Partial<AcjLearningEntry>)} /></div>
  );
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5" data-testid="acj-entry-detail">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" data-testid="acj-entry-code">{e.code}</Badge>
        <Badge variant={e.status === 'validated' || e.status === 'consolidated' ? 'accent' : 'secondary'} data-testid="acj-entry-status">{LEARNING_STATUS_LABELS[e.status]}</Badge>
        {e.acj_ids.map((id) => <AcjChip key={id} id={id} size="xs" />)}
      </div>
      <p className="font-display text-lg font-semibold">{e.title}</p>
      <p className="text-sm"><span className="text-muted-foreground">Fato observado:</span> {e.observed_fact}</p>
      {e.context && <p className="text-sm"><span className="text-muted-foreground">Contexto:</span> {e.context}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {field('candidate_pattern', 'Padrão candidato')}
        {field('hypothesis', 'Hipótese (testável)')}
        {field('alternatives', 'Explicações alternativas')}
        {field('next_action', 'Próxima ação')}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="f-conf">Confiança</Label>
          <select id="f-conf" value={e.confidence} onChange={(x) => save({ confidence: x.target.value as AcjConfidence })} className="w-full rounded-md border border-input bg-background p-2 text-sm">
            {Object.entries(CONFIDENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="space-y-1"><Label htmlFor="f-class">Tipo de implicação</Label>
          <select id="f-class" value={e.change_class ?? ''} onChange={(x) => save({ change_class: (x.target.value || null) as AcjChangeClass | null })} className="w-full rounded-md border border-input bg-background p-2 text-sm">
            <option value="">— a decidir</option>
            {Object.entries(CHANGE_CLASS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="space-y-1"><p className="text-sm font-medium">Causas prováveis</p>
          <div className="flex flex-wrap gap-1">{(Object.keys(CAUSE_LABELS) as Array<keyof typeof CAUSE_LABELS>).map((c) => {
            const on = e.probable_causes.includes(c);
            return <button key={c} type="button" aria-pressed={on} onClick={() => save({ probable_causes: on ? e.probable_causes.filter((x) => x !== c) : [...e.probable_causes, c] })}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-accent bg-accent/15' : ''}`}>{CAUSE_LABELS[c]}</button>;
          })}</div></div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-semibold">Evidências</p>
        <ul className="space-y-1 text-sm">{evidence.map((x) => <li key={x.id}>• <b>{x.source === 'marcos' ? 'Marcos' : x.source === 'audience' ? 'Audiência' : x.source === 'journey' ? 'Jornada' : 'Sistema'}:</b> {x.description}{x.limitations ? <span className="text-muted-foreground"> (limitação: {x.limitations})</span> : null}</li>)}</ul>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Fonte da evidência" value={ev.source} onChange={(x) => setEv({ ...ev, source: x.target.value as AcjLearningEvidence['source'] })} className="rounded-md border border-input bg-background p-2 text-sm">
            <option value="marcos">Marcos</option><option value="audience">Audiência</option><option value="journey">Jornada</option>
          </select>
          <Input aria-label="Evidência" className="min-w-[220px] flex-1" value={ev.description} onChange={(x) => setEv({ ...ev, description: x.target.value })} placeholder="O que foi observado (com origem rastreável)" />
          <Input aria-label="Limitação" className="w-56" value={ev.limitations} onChange={(x) => setEv({ ...ev, limitations: x.target.value })} placeholder="Limitação (opcional)" />
          <Button size="sm" variant="outline" onClick={addEvidence}>Adicionar</Button>
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-semibold">Mover para</p>
        {['rejected', 'inconclusive'].includes(e.status) && <Input aria-label="Justificativa para reabrir" value={reopen} onChange={(x) => setReopen(x.target.value)} placeholder="Justificativa e nova evidência para reabrir" />}
        {e.status === 'validated' && <Input aria-label="Documento afetado" value={affected} onChange={(x) => setAffected(x.target.value)} placeholder="Documento afetado e nova versão (ex.: ACJ-02 v0.2)" />}
        <div className="flex flex-wrap gap-2">
          {LEARNING_TRANSITIONS[e.status].map((to) => (
            <Button key={to} size="sm" variant={to === 'validated' || to === 'consolidated' ? 'accent' : 'outline'} onClick={() => move(to)} data-testid={`acj-move-${to}`}>{LEARNING_STATUS_LABELS[to]}</Button>
          ))}
          {LEARNING_TRANSITIONS[e.status].length === 0 && <p className="text-sm text-muted-foreground">Registro encerrado e preservado.</p>}
        </div>
        {(e.status === 'provisional') && <p className="text-xs text-muted-foreground">Validar é uma decisão humana: fica registrado quem aprovou e quando. Mudanças na arquitetura só entram como nova versão do documento.</p>}
      </div>

      <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground" data-testid="acj-entry-history">
        <p className="font-semibold uppercase">Histórico</p>
        {decisions.map((d) => <p key={d.id}>{new Date(d.created_at).toLocaleString('pt-BR')} — {d.from_status ? `${LEARNING_STATUS_LABELS[d.from_status as AcjLearningStatus] ?? d.from_status} → ` : ''}{LEARNING_STATUS_LABELS[d.to_status as AcjLearningStatus] ?? d.to_status}{d.note ? ` · ${d.note}` : ''}</p>)}
      </div>
    </div>
  );
}
