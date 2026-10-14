// Sessão de "Minha identidade" (Guia §4, telas 2–10): O que mudou → Conversa guiada →
// Materiais → O que a Hive entendeu → Perfis → Editorias → Calibração → Ativar → Pronto.
// Tudo fica salvo na sessão (retomável). A configuração ativa só muda ao ATIVAR.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, HelpCircle, Link2, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BLOCK_LABELS, BlockCard } from '@/components/identity/BlockCard';
import { blocksFor, identityApi, type IdentityState } from '@/lib/identityApi';
import { affectedProfiles, draftOf } from '@/lib/identity/draft';
import { campaignApi } from '@/lib/campaignApi';
import { edge } from '@/lib/edge';
import { MODE_LABELS, STEP_LABELS } from './IdentityHome';
import type { BlockProposal, Calibration, Campaign, SetupBlock, SetupQuestion, SetupSession, SetupSource, SetupStep, SetupTarget } from '@/types';

const TARGETS: Array<{ id: SetupTarget; label: string; hint: string }> = [
  { id: 'publico', label: 'Público', hint: 'Quem você quer alcançar e em que situação.' },
  { id: 'frente', label: 'Frente de atuação', hint: 'Linhas de trabalho e o que muda entre elas.' },
  { id: 'posicionamento', label: 'Posicionamento', hint: 'Como quer ser percebido e o que te diferencia.' },
  { id: 'oferta', label: 'Oferta', hint: 'Produtos e quando aparecem no conteúdo.' },
  { id: 'voz_visual', label: 'Voz e expressão', hint: 'Jeito de escrever, lugar de fala, expressão.' },
  { id: 'identidade', label: 'Identidade da marca', hint: 'O núcleo: natureza da contribuição e quem fala. Afeta todos os perfis.' },
];
const RECAL_TARGETS: SetupTarget[] = ['publico', 'posicionamento', 'voz_visual', 'oferta'];

function stepsFor(s: SetupSession): SetupStep[] {
  const all: SetupStep[] = ['targets', 'conversation', 'materials', 'understanding', 'profiles', 'editorials', 'calibration', 'activate', 'done'];
  let out = s.mode === 'setup' || s.mode === 'add_front' ? all.filter((x) => x !== 'targets') : all;
  if (!blocksFor(s.mode, s.targets).some((b) => b !== 'profiles')) out = out.filter((x) => x !== 'understanding');
  if (s.mode === 'recalibrate') out = out.filter((x) => x !== 'editorials');
  return out;
}

export function SetupSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<SetupSession | null | undefined>(undefined);
  const [st, setSt] = useState<IdentityState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Gravações em FILA, sempre sobre o estado mais recente (aceitar um bloco e pedir o próximo
  // em seguida não pode sobrescrever o aceite com um estado antigo).
  const sRef = useRef<SetupSession | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const reload = useCallback(async () => {
    if (!id) return;
    const sess = await identityApi.session(id);
    sRef.current = sess; setS(sess);
    if (sess) setSt(await identityApi.state(sess.brand_id));
  }, [id]);
  useEffect(() => { reload().catch(() => setS(null)); }, [reload]);

  const update = useCallback((fn: (cur: SetupSession) => Partial<SetupSession>): Promise<SetupSession | null> => {
    const run = queue.current.catch(() => {}).then(async () => {
      const cur = sRef.current;
      if (!cur) return null;
      const n = await identityApi.saveSession(cur.id, fn(cur));
      sRef.current = n; setS(n);
      return n;
    });
    queue.current = run;
    return run;
  }, []);
  const save = useCallback((patch: Partial<SetupSession>) => update(() => patch), [update]);
  const draft = useMemo(() => (s && st ? draftOf(st, s) : null), [s, st]);

  if (s === undefined || (s && !st)) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!s || !st || !draft) return <div className="p-8"><Link to="/identidade" className="text-sm text-accent">← Minha identidade</Link><p className="mt-4">Sessão não encontrada.</p></div>;

  const steps = stepsFor(s);
  const step: SetupStep = s.status === 'done' ? 'done' : (steps.includes(s.step) ? s.step : steps[0]);
  const idx = steps.indexOf(step);
  const go = (to: SetupStep) => save({ step: to, ...(to === 'calibration' ? { status: 'calibrating' as const } : {}) }).catch((e) => toast.error((e as Error).message));
  const next = () => go(steps[Math.min(idx + 1, steps.length - 1)]);
  const targetNames = s.target_profile_ids.map((pid) => st.profiles.find((p) => p.id === pid)?.name).filter(Boolean).join(', ');

  // ---------- operações de bloco (mesmo estado para conversa e edição direta) ----------
  const log = (cur: SetupSession, block: SetupBlock, action: string, note?: string) => [...(cur.reviews ?? []), { block, action, at: new Date().toISOString(), ...(note ? { note } : {}) }];
  const setBlock = (block: SetupBlock, fn: (p: BlockProposal | undefined) => BlockProposal, action: string, note?: string, extra: Partial<SetupSession> = {}) =>
    update((cur) => ({ proposals: { ...cur.proposals, [block]: fn(cur.proposals[block]) }, reviews: log(cur, block, action, note), ...extra }));
  const blockOps = (block: SetupBlock) => ({
    onGenerate: async () => {
      setBusy(block);
      try { const p = await identityApi.propose(s.id, block); await setBlock(block, () => p, 'propose', undefined, { status: 'ready_for_review' }); } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setBusy(null); }
    },
    onChange: (p: BlockProposal, note: string) => setBlock(block, () => p, 'edit', note).catch((e) => toast.error((e as Error).message)),
    onAccept: () => setBlock(block, (p) => ({ ...p!, status: 'accepted' }), 'accept'),
    onAdjust: async (text: string) => {
      setBusy(block);
      try {
        await setBlock(block, (p) => ({ ...p!, adjust_request: text }), 'adjust', text);
        const p = await identityApi.propose(s.id, block);
        await setBlock(block, () => p, 'propose');
      } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setBusy(null); }
    },
    onSkip: () => setBlock(block, () => ({ status: 'skipped' }), 'skip'),
  });
  const settled = (b: SetupBlock) => ['accepted', 'skipped'].includes(s.proposals[b]?.status ?? '');

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8" data-testid="setup-session" data-step={step}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/identidade?marca=${s.brand_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="save-exit"><ArrowLeft className="h-4 w-4" /> Salvar e sair</Link>
        <p className="text-xs text-muted-foreground">Tudo fica salvo — você pode sair e continuar depois.</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{MODE_LABELS[s.mode]}{targetNames ? ` · ${targetNames}` : ''}</p>
        <h1 className="font-display text-2xl font-bold">{STEP_LABELS[step]}</h1>
      </div>
      <ol className="flex flex-wrap gap-1.5 text-xs" data-testid="setup-stepper">
        {steps.map((x, i) => (
          <li key={x}>
            <button type="button" disabled={i > idx || s.status === 'done'} onClick={() => go(x)}
              className={`rounded-full border px-2.5 py-1 ${x === step ? 'border-accent bg-accent/15 font-semibold' : i < idx ? 'bg-secondary' : 'opacity-50'}`}>
              {i + 1}. {STEP_LABELS[x]}
            </button>
          </li>
        ))}
      </ol>

      {step === 'targets' && <TargetsStep s={s} onSave={async (targets) => { await save({ targets, step: steps[idx + 1] }); }} />}
      {step === 'conversation' && <ConversationStep s={s} save={save} onNext={next} />}
      {step === 'materials' && <MaterialsStep s={s} save={save} onNext={next} />}
      {step === 'understanding' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">A Hive propõe por bloco a partir do que já existe e do que você contou. Edite, aceite ou peça ajuste — nada é ativado ainda.</p>
          {blocksFor(s.mode, s.targets).filter((b) => b !== 'profiles').map((b) => (
            <BlockCard key={b} block={b} proposal={s.proposals[b]} draft={draft} busy={busy === b} {...blockOps(b)} />
          ))}
          <NextBar disabled={!blocksFor(s.mode, s.targets).filter((b) => b !== 'profiles').every(settled)} label="Continuar para os perfis" onNext={next}
            hint="Aceite (ou mantenha como está) cada bloco para continuar." />
        </div>
      )}
      {step === 'profiles' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Cada perfil combina quem fala, a frente e o público prioritário. {s.mode === 'recalibrate' ? 'Só o perfil recalibrado muda; os outros continuam como estão.' : 'Canal não define frente: a mesma conta pode publicar peças de perfis diferentes.'}</p>
          <BlockCard block="profiles" proposal={s.proposals.profiles} draft={draft} busy={busy === 'profiles'} {...blockOps('profiles')} />
          <NextBar disabled={!settled('profiles')} label={steps.includes('editorials') ? 'Continuar para as editorias' : 'Continuar para a calibração'} onNext={next} hint="Aceite o bloco de perfis para continuar." />
        </div>
      )}
      {step === 'editorials' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Territórios propostos a partir dos perfis. As editorias atuais não são apagadas nem novas são aprovadas sem você.</p>
          <BlockCard block="editorials" proposal={s.proposals.editorials} draft={draft} busy={busy === 'editorials'} {...blockOps('editorials')} />
          <NextBar disabled={!settled('editorials')} label="Continuar para a calibração" onNext={next} hint="Aceite as editorias ou mantenha as atuais." />
        </div>
      )}
      {step === 'calibration' && <CalibrationStep s={s} st={st} draft={draft} save={save} onNext={next} onBackToProfiles={() => go('profiles')} />}
      {step === 'activate' && <ActivateStep s={s} st={st} onDone={reload} />}
      {step === 'done' && <DoneStep s={s} />}
    </div>
  );
}

function NextBar({ disabled, label, onNext, hint }: { disabled: boolean; label: string; onNext: () => void; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {disabled && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Button variant="accent" disabled={disabled} onClick={onNext} data-testid="step-next">{label} <ArrowRight className="h-4 w-4" /></Button>
    </div>
  );
}

// ---------------- 2. O que mudou? ----------------
function TargetsStep({ s, onSave }: { s: SetupSession; onSave: (t: SetupTarget[]) => Promise<void> }) {
  const [sel, setSel] = useState<SetupTarget[]>(s.targets ?? []);
  const options = s.mode === 'recalibrate' ? TARGETS.filter((t) => RECAL_TARGETS.includes(t.id)) : TARGETS;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Escolha o que mudou (pode ser mais de um). O resto da configuração fica preservado.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((t) => {
          const on = sel.includes(t.id);
          return (
            <button key={t.id} type="button" aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x !== t.id) : [...sel, t.id])} data-testid={`target-${t.id}`}
              className={`rounded-xl border p-3 text-left ${on ? 'border-accent bg-accent/10' : 'bg-card'}`}>
              <p className="flex items-center gap-2 font-semibold">{on && <Check className="h-4 w-4 text-accent" />}{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </button>
          );
        })}
      </div>
      <NextBar disabled={!sel.length} label="Continuar" onNext={() => void onSave(sel)} hint="Escolha ao menos um alvo." />
    </div>
  );
}

// ---------------- 3. Conversa guiada ----------------
function ConversationStep({ s, save, onNext }: { s: SetupSession; save: (p: Partial<SetupSession>) => Promise<SetupSession | null>; onNext: () => void }) {
  const [q, setQ] = useState<SetupQuestion | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const ask = useCallback(async () => {
    setLoading(true);
    try { const r = await identityApi.nextQuestion(s.id); setQ(r.question); setDone(r.done || !r.question); } catch (e) { toast.error((e as Error).message.slice(0, 160)); setDone(true); } finally { setLoading(false); }
  }, [s.id]);
  useEffect(() => { void ask(); }, [ask]);

  async function reply(text: string) {
    if (!q) return;
    await save({ answers: [...(s.answers ?? []), { question_id: q.id, question: q.text, answer: text, at: new Date().toISOString(), classification: 'declared' }] });
    setAnswer(''); setQ(null);
    await ask();
  }

  return (
    <div className="space-y-4">
      {(s.answers ?? []).length > 0 && (
        <div className="space-y-2" data-testid="answers">
          {s.answers.map((a, i) => (
            <div key={a.question_id + i} className="rounded-xl border bg-card p-3 text-sm" data-testid="answer">
              <p className="text-xs text-muted-foreground">{a.question}</p>
              {editing === i ? (
                <div className="mt-1 space-y-2">
                  <Textarea aria-label="Editar resposta" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="accent" onClick={async () => { const answers = [...s.answers]; answers[i] = { ...a, answer: editText.trim(), at: new Date().toISOString() }; await save({ answers }); setEditing(null); }}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-line">{a.answer} <button type="button" className="ml-1 text-xs text-accent" onClick={() => { setEditing(i); setEditText(a.answer); }} aria-label="Editar resposta"><Pencil className="inline h-3 w-3" /> editar</button></p>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A Hive está pensando na próxima pergunta…</p>
        : q ? (
          <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="question">
            <p className="font-display text-lg font-semibold" data-testid="question-text">{q.text}</p>
            {q.why && <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {q.why}</p>}
            <Textarea aria-label="Sua resposta" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Responda do seu jeito — pode ser curto." />
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" disabled={!answer.trim()} onClick={() => void reply(answer.trim())} data-testid="answer-send">Responder</Button>
              <Button variant="ghost" onClick={() => void reply('(preferiu não responder agora)')} data-testid="answer-skip">Pular</Button>
            </div>
          </div>
        ) : done && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm" data-testid="conversation-done">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> A Hive já tem o suficiente para propor. O que faltar fica marcado como hipótese.
          </p>
        )}
      <NextBar disabled={!(s.answers ?? []).length && !done} label={done ? 'Continuar' : 'Já dá para propor'} onNext={onNext} hint="Responda ao menos uma pergunta." />
    </div>
  );
}

// ---------------- 4. Materiais ----------------
function MaterialsStep({ s, save, onNext }: { s: SetupSession; save: (p: Partial<SetupSession>) => Promise<SetupSession | null>; onNext: () => void }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [role, setRole] = useState<SetupSource['role']>('current_reference');
  async function add() {
    const src: SetupSource = { id: crypto.randomUUID(), kind: content.trim() ? 'text' : 'link', title: title.trim() || url.trim() || 'Material', url: url.trim() || undefined, content: content.trim() || undefined, role, at: new Date().toISOString() };
    await save({ sources: [...(s.sources ?? []), src] });
    setTitle(''); setUrl(''); setContent('');
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Opcional. Textos, links ou casos que representam bem o que você quer — e o que é só histórico. Sem material, a Hive não inventa: marca como hipótese.</p>
      {(s.sources ?? []).length > 0 && (
        <div className="space-y-2" data-testid="sources">
          {s.sources.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl border bg-card p-3 text-sm" data-testid="source">
              <div className="min-w-0">
                <p className="font-medium">{m.title} <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${m.role === 'historical' ? 'bg-secondary' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>{m.role === 'historical' ? 'histórico' : 'referência atual'}</span></p>
                {m.url && <p className="truncate text-xs text-muted-foreground"><Link2 className="mr-1 inline h-3 w-3" />{m.url}</p>}
                {m.content && <p className="line-clamp-2 text-xs text-muted-foreground">{m.content}</p>}
              </div>
              <button type="button" aria-label="Remover material" className="text-muted-foreground hover:text-rose-600" onClick={() => save({ sources: s.sources.filter((x) => x.id !== m.id) })}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <Input aria-label="Título do material" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ex.: post sobre liderança e sistemas)" />
        <Input aria-label="Link" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (opcional)" />
        <Textarea aria-label="Texto do material" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Cole o texto (opcional)" />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(['current_reference', 'historical'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={`rounded-full border px-3 py-1 ${role === r ? 'border-accent bg-accent/15' : ''}`}>{r === 'historical' ? 'É histórico' : 'Referência atual desejada'}</button>
          ))}
          <Button size="sm" variant="outline" className="ml-auto" disabled={!url.trim() && !content.trim()} onClick={() => void add()} data-testid="source-add"><Plus className="h-3.5 w-3.5" /> Acrescentar</Button>
        </div>
      </div>
      <NextBar disabled={false} label="Continuar para as propostas" onNext={onNext} />
    </div>
  );
}

// ---------------- 8. Calibração ----------------
function CalibrationStep({ s, st, draft, save, onNext, onBackToProfiles }: {
  s: SetupSession; st: IdentityState; draft: ReturnType<typeof draftOf>; save: (p: Partial<SetupSession>) => Promise<SetupSession | null>; onNext: () => void; onBackToProfiles: () => void;
}) {
  const profiles = draft.profiles.filter((p) => s.mode !== 'recalibrate' || s.target_profile_ids.includes(p.id) || p.draft);
  const [profileRef, setProfileRef] = useState(profiles[0]?.id ?? '');
  const [editorial, setEditorial] = useState(st.editorials[0]?.slug ?? '');
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const skipped = (s.reviews ?? []).some((r) => r.action === 'calibration_skipped');
  const withFeedback = (s.calibrations ?? []).filter((c) => c.feedback);

  async function sample() {
    setBusy(true);
    try {
      const r = await edge.generateContent({ editorial_slug: editorial, target_platform: 'linkedin', variations: 1, briefing: theme.trim() ? `Tema da amostra: ${theme.trim()}` : undefined, calibration: { session_id: s.id, profile_ref: profileRef } });
      const v = r.variations?.[0] ?? r;
      const cal: Calibration = { id: crypto.randomUUID(), profile_ref: profileRef, profile_name: draft.profiles.find((p) => p.id === profileRef)?.name ?? '', editorial_slug: editorial, theme: theme.trim(),
        sample: { quote: String(v.quote ?? ''), caption: String(v.caption ?? '') }, at: new Date().toISOString() };
      await save({ calibrations: [...(s.calibrations ?? []), cal], status: 'calibrating' });
      setTheme('');
    } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setBusy(false); }
  }
  const saveFeedback = (c: Calibration, fb: NonNullable<Calibration['feedback']>) => save({ calibrations: s.calibrations.map((x) => (x.id === c.id ? { ...x, feedback: fb } : x)) });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Amostras geradas com o perfil EM RASCUNHO (nada é publicado nem ativado). Diga se o pensamento, a linguagem, o público e o lugar de fala soaram certos.</p>
      {st.editorials.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Sem editorias ativas para gerar amostras. Ative as editorias primeiro ou dispense a calibração.</p>
      ) : (
        <div className="grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr]">
          <label className="space-y-1 text-xs"><span className="text-muted-foreground">Perfil</span>
            <select aria-label="Perfil da amostra" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={profileRef} onChange={(e) => setProfileRef(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.draft ? ' (novo)' : p.changed ? ' (revisado)' : ''}</option>)}
            </select></label>
          <label className="space-y-1 text-xs"><span className="text-muted-foreground">Editoria</span>
            <select aria-label="Editoria da amostra" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={editorial} onChange={(e) => setEditorial(e.target.value)}>
              {st.editorials.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}
            </select></label>
          <Input aria-label="Tema da amostra" className="sm:col-span-2" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Tema (opcional): ex.: o que trava uma transformação que todos dizem querer" />
          <div className="sm:col-span-2"><Button variant="accent" disabled={busy || !profileRef || !editorial} onClick={() => void sample()} data-testid="calibrate-generate">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando amostra…</> : <><Sparkles className="h-4 w-4" /> Gerar amostra</>}</Button></div>
        </div>
      )}
      {(s.calibrations ?? []).map((c) => <CalibrationCard key={c.id} c={c} onSave={(fb) => saveFeedback(c, fb)} />)}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBackToProfiles}><ArrowLeft className="h-4 w-4" /> Revisar perfis</Button>
        <div className="flex flex-wrap items-center gap-2">
          {!withFeedback.length && !skipped && (
            <Button variant="outline" onClick={() => save({ reviews: [...(s.reviews ?? []), { block: 'profiles', action: 'calibration_skipped', at: new Date().toISOString() }] })} data-testid="calibration-skip">Dispensar calibração</Button>
          )}
          <Button variant="accent" disabled={!withFeedback.length && !skipped} onClick={onNext} data-testid="step-next">Continuar para ativação <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function CalibrationCard({ c, onSave }: { c: Calibration; onSave: (fb: NonNullable<Calibration['feedback']>) => Promise<unknown> }) {
  const [fb, setFb] = useState<NonNullable<Calibration['feedback']>>(c.feedback ?? {});
  const [open, setOpen] = useState(!c.feedback);
  const F: Array<[keyof typeof fb, string]> = [['pensamento', 'Pensamento'], ['linguagem', 'Linguagem'], ['publico', 'Público'], ['lugar_de_fala', 'Lugar de fala']];
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4" data-testid="calibration">
      <p className="text-xs text-muted-foreground">{c.profile_name} · {c.editorial_slug}{c.theme ? ` · ${c.theme}` : ''}</p>
      <p className="font-display text-base font-semibold" data-testid="calibration-quote">{c.sample.quote}</p>
      <p className="line-clamp-6 whitespace-pre-line text-sm text-muted-foreground">{c.sample.caption}</p>
      {open ? (
        <div className="space-y-2 border-t pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {F.map(([k, l]) => <Input key={k} aria-label={`Feedback: ${l}`} value={String(fb[k] ?? '')} onChange={(e) => setFb({ ...fb, [k]: e.target.value })} placeholder={`${l}: soou certo? o que mudar?`} />)}
          </div>
          <Textarea aria-label="Lição para este perfil" rows={2} value={fb.lesson ?? ''} onChange={(e) => setFb({ ...fb, lesson: e.target.value })} placeholder="Lição (opcional): o que a Hive deve lembrar ao escrever por este perfil" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!fb.learn} onChange={(e) => setFb({ ...fb, learn: e.target.checked })} aria-label="Guardar como aprendizado deste perfil" /> Guardar como aprendizado deste perfil (vale só aqui, não vira regra geral)</label>
          <Button size="sm" variant="accent" onClick={async () => { await onSave(fb); setOpen(false); }} data-testid="calibration-feedback-save">Registrar feedback</Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400" data-testid="calibration-feedback-done"><Check className="h-3.5 w-3.5" /> Feedback registrado{c.feedback?.learn ? ' · vira aprendizado do perfil ao ativar' : ''}
          <button type="button" className="text-accent" onClick={() => setOpen(true)}>editar</button></p>
      )}
    </div>
  );
}

// ---------------- 9. Ativar ----------------
function ActivateStep({ s, st, onDone }: { s: SetupSession; st: IdentityState; onDone: () => Promise<void> }) {
  const [adoption, setAdoption] = useState<'future' | 'all'>('future');
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => { campaignApi.list().then(setCampaigns).catch(() => setCampaigns([])); }, []);
  const affected = affectedProfiles(st, s);
  const ids = new Set(affected.map((a) => a.id));
  const camps = campaigns.filter((c) => c.profile_id && ids.has(c.profile_id) && ['draft', 'active', 'paused'].includes(c.status));
  const blocks = (['brand', 'emitters', 'fronts', 'audiences', 'profiles', 'editorials'] as SetupBlock[]).filter((b) => s.proposals[b]);
  const count = (b: SetupBlock, a: string) => (s.proposals[b]?.items ?? []).filter((i) => i.action === a).length;
  const notAccepted = blocks.filter((b) => s.proposals[b]?.status === 'proposed');
  const learn = (s.calibrations ?? []).filter((c) => c.feedback?.learn && c.feedback.lesson).length;

  async function activate() {
    setBusy(true);
    try { await identityApi.activate(s.id, adoption); toast.success('Versão ativada.'); await onDone(); }
    catch (e) { toast.error((e as Error).message.replace(/^.*?"message":"([^"]+)".*$/, '$1').slice(0, 220)); setBusy(false); }
  }

  return (
    <div className="space-y-4" data-testid="activate-step">
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">O que muda</p>
        <ul className="space-y-1 text-sm" data-testid="activate-summary">
          {blocks.map((b) => (
            <li key={b}><b>{BLOCK_LABELS[b].title}:</b> {s.proposals[b]!.status === 'skipped' ? 'mantido como está' : s.proposals[b]!.status === 'proposed' ? 'proposta NÃO aceita (não será aplicada)'
              : b === 'brand' ? 'natureza da contribuição revisada' : `${count(b, 'create')} novo(s), ${count(b, 'update')} alterado(s), ${count(b, 'keep')} mantido(s)${count(b, 'archive') ? `, ${count(b, 'archive')} arquivado(s)` : ''}`}</li>
          ))}
          {learn > 0 && <li><b>Aprendizado:</b> {learn} lição(ões) da calibração, com escopo do perfil.</li>}
        </ul>
        {notAccepted.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Blocos com proposta não aceita ficam como estão.</p>}
      </section>
      <section className="space-y-2 rounded-2xl border bg-card p-4" data-testid="activate-impact">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Impacto</p>
        {affected.length ? <ul className="list-disc space-y-0.5 pl-4 text-sm">{affected.map((a) => <li key={a.id}>{a.name} — {a.why}{a.created ? '' : ' → nova versão'}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum perfil muda de versão.</p>}
        {s.mode === 'recalibrate' && <p className="text-sm">Os outros perfis continuam na versão atual (o que for compartilhado é copiado para o perfil recalibrado).</p>}
        <p className="text-sm">{camps.length ? `${camps.length} campanha(s) em andamento usam esses perfis: ${camps.map((c) => c.name).join(', ')}.` : 'Nenhuma campanha em andamento usa esses perfis.'}</p>
        <p className="text-sm text-muted-foreground">Peças agendadas e conteúdos já criados não mudam: guardam a versão com que nasceram.</p>
      </section>
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alcance da adoção</p>
        {([['future', 'Só novas criações', 'Campanhas em andamento continuam com a versão atual até você mudar.'], ['all', 'Novas criações e campanhas em andamento', 'Os próximos conteúdos das campanhas em andamento já usam a nova versão.']] as const).map(([v, l, h]) => (
          <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${adoption === v ? 'border-accent bg-accent/5' : ''}`}>
            <input type="radio" name="adoption" checked={adoption === v} onChange={() => setAdoption(v)} aria-label={l} />
            <span><span className="block text-sm font-semibold">{l}</span><span className="text-xs text-muted-foreground">{h}</span></span>
          </label>
        ))}
      </section>
      <div className="flex justify-end">
        <Button variant="accent" size="lg" disabled={busy} onClick={() => void activate()} data-testid="activate">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Ativar versão</Button>
      </div>
    </div>
  );
}

// ---------------- 10. Pronto para produzir ----------------
function DoneStep({ s }: { s: SetupSession }) {
  const r = s.result;
  return (
    <div className="space-y-4" data-testid="setup-done">
      <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" />
        <div><p className="font-display text-xl font-semibold">Pronto para produzir</p>
          <p className="text-sm text-muted-foreground">Ativado em {new Date(s.activated_at ?? s.updated_at).toLocaleString('pt-BR')} · {r?.adoption === 'all' ? 'novas criações e campanhas em andamento' : 'só novas criações'}{r?.pinned_campaigns ? ` · ${r.pinned_campaigns} campanha(s) mantidas na versão anterior` : ''}</p></div>
      </div>
      {r && (
        <section className="space-y-2 rounded-2xl border bg-card p-4" data-testid="done-versions">
          {r.versions.length ? r.versions.map((v) => (
            <div key={v.profile_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{v.name} <span className="text-xs text-muted-foreground">{v.created ? `criado (v${v.to})` : `v${v.from} → v${v.to}`}</span></span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" asChild><Link to={`/criar/conteudo?profile=${v.profile_id}`}>Criar conteúdo</Link></Button>
                <Button size="sm" variant="ghost" asChild><Link to={`/campanhas/nova?profile=${v.profile_id}`}>Nova campanha</Link></Button>
              </span>
            </div>
          )) : <p className="text-sm text-muted-foreground">Nenhum perfil mudou de versão.</p>}
          {r.editorials.length > 0 && <p className="text-sm">Editorias: {r.editorials.map((e) => `${e.name} (${e.action === 'create' ? 'nova, em teste' : e.action === 'archive' ? 'arquivada' : 'revisada'})`).join(', ')}.</p>}
          {r.learnings > 0 && <p className="text-sm">{r.learnings} lição(ões) guardadas com escopo de perfil.</p>}
        </section>
      )}
      <Button variant="outline" asChild><Link to={`/identidade?marca=${s.brand_id}`}>Voltar para Minha identidade</Link></Button>
    </div>
  );
}
