// MINHA IDENTIDADE — tela 1 (Visão atual) + entradas do percurso (Guia de implementação §3–§4):
// Configurar · Revisar identidade e frentes · Adicionar frente · Recalibrar perfil · Continuar configuração.
// Mostra o que já existe (herdado) e o que falta revisar, sem perguntar o que a Hive já sabe.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, BookOpen, BrainCircuit, Loader2, Plus, RefreshCw, ScrollText, Sparkles, UserRound, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateWorkspaceCard } from '@/components/identity/CreateWorkspaceCard';
import { identityApi, profileSummary, type IdentityState } from '@/lib/identityApi';
import { useAuthStore } from '@/store/authStore';
import type { Brand, SetupMode, SetupSession } from '@/types';

export const MODE_LABELS: Record<SetupMode, string> = {
  setup: 'Configuração inicial', review: 'Revisão da identidade e frentes', add_front: 'Nova frente de atuação', recalibrate: 'Recalibração de perfil',
};
export const STEP_LABELS: Record<string, string> = {
  overview: 'Visão atual', targets: 'O que mudou', conversation: 'Conversa guiada', materials: 'Materiais', understanding: 'O que a Hive entendeu',
  profiles: 'Perfis', editorials: 'Editorias', calibration: 'Calibração', activate: 'Ativar', done: 'Pronto',
};

export function IdentityHome() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [params, setParams] = useSearchParams();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [st, setSt] = useState<IdentityState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const brandId = params.get('marca') ?? brands?.[0]?.id ?? null;

  useEffect(() => { identityApi.brands().then(setBrands).catch(() => setBrands([])); }, []);
  useEffect(() => {
    if (!brandId) return;
    setSt(null);
    identityApi.state(brandId).then(setSt).catch((e) => toast.error((e as Error).message));
  }, [brandId]);

  async function start(mode: SetupMode, extra: { targetProfileIds?: string[]; title?: string } = {}) {
    if (!currentUser || !brandId) return;
    setBusy(mode);
    try {
      const s = await identityApi.createSession(currentUser.id, { brandId, mode, ...extra, title: extra.title ?? MODE_LABELS[mode] });
      navigate(`/identidade/sessoes/${s.id}`);
    } catch (e) { toast.error((e as Error).message.slice(0, 200)); setBusy(null); }
  }

  if (!brands) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  // Cliente novo (sem espaço de trabalho): cria a própria marca e abre a configuração inicial neutra.
  if (!brands.length) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <CreateWorkspaceCard onCreated={(id) => { identityApi.resetCache(); navigate(`/identidade/configurar?modo=setup&marca=${id}`); }} />
      </div>
    );
  }

  const open = (st?.sessions ?? []).filter((s) => s.status !== 'done');
  const done = (st?.sessions ?? []).filter((s) => s.status === 'done').slice(0, 5);
  const empty = st && !st.profiles.length && !st.emitters.length;
  const pending = st ? [
    ...st.profiles.filter((p) => p.needs_recalibration).map((p) => ({ k: p.id, text: `${p.name}: ${p.needs_recalibration}` })),
    ...st.audiences.filter((a) => a.status === 'hypothesis').map((a) => ({ k: a.id, text: `Público "${a.name}" ainda é hipótese.` })),
    ...st.emitters.filter((e) => e.facts_status !== 'confirmed').map((e) => ({ k: e.id, text: `Autoridade de ${e.name}: fatos a confirmar.` })),
  ] : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8" data-testid="identity-home">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Minha identidade</h1>
          <p className="text-sm text-muted-foreground">Quem fala, em quais frentes, para quem — e como a Hive deve escrever em cada caso.</p>
        </div>
        {brands.length > 1 && (
          <select aria-label="Marca" className="h-9 rounded-md border bg-background px-2 text-sm" value={brandId ?? ''} onChange={(e) => setParams({ marca: e.target.value })} data-testid="brand-select">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {!st ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> : (
        <>
          {/* ---------- entradas ---------- */}
          <div className="grid gap-3 md:grid-cols-3">
            {empty ? (
              <EntryCard testId="entry-setup" icon={<Sparkles className="h-5 w-5" />} title="Configurar minha identidade" busy={busy === 'setup'}
                text="A Hive conduz a conversa, propõe e você decide. Nada é preenchido por padrão." onClick={() => start('setup')} />
            ) : (
              <>
                <EntryCard testId="entry-review" icon={<RefreshCw className="h-5 w-5" />} title="Revisar identidade e frentes de atuação" busy={busy === 'review'}
                  text="Parte da configuração atual: você diz o que mudou e só isso é revisto." onClick={() => start('review')} />
                <EntryCard testId="entry-add-front" icon={<Plus className="h-5 w-5" />} title="Adicionar frente de atuação" busy={busy === 'add_front'}
                  text="Uma nova linha de trabalho que reaproveita o núcleo da marca e configura as diferenças." onClick={() => start('add_front')} />
              </>
            )}
            {open[0] && (
              <EntryCard testId="entry-continue" icon={<ArrowRight className="h-5 w-5" />} title="Continuar configuração" accent
                text={`${open[0].title ?? MODE_LABELS[open[0].mode]} · parou em ${STEP_LABELS[open[0].step] ?? open[0].step}`} onClick={() => navigate(`/identidade/sessoes/${open[0].id}`)} />
            )}
          </div>

          {open.length > 1 && <SessionList title="Outras sessões em andamento" sessions={open.slice(1)} />}

          {!empty && (
            <>
              {/* ---------- tela 1: visão atual ---------- */}
              <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-2 rounded-2xl border bg-card p-5" data-testid="current-brand">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marca</p>
                  <p className="font-display text-xl font-semibold">{st.brand.name}</p>
                  <p className="text-sm">{st.brand.essence ?? <span className="text-muted-foreground">Natureza da contribuição ainda não definida.</span>}</p>
                </div>
                <div className="space-y-2 rounded-2xl border bg-card p-5" data-testid="current-genesis">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alma · Mente · Expressão</p>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">herdado</span>
                  </div>
                  {st.genesis ? (
                    <div className="space-y-1 text-sm">
                      {st.genesis.pergunta_fundadora && <p><span className="text-muted-foreground">Pergunta fundadora:</span> {st.genesis.pergunta_fundadora}</p>}
                      {st.genesis.frase_organizadora && <p><span className="text-muted-foreground">Frase organizadora:</span> {st.genesis.frase_organizadora}</p>}
                      {st.genesis.voz_como_escreve && <p className="line-clamp-2"><span className="text-muted-foreground">Voz:</span> {st.genesis.voz_como_escreve}</p>}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Genesis não configurado.</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="ghost" asChild><Link to="/genesis"><BrainCircuit className="h-3.5 w-3.5" /> Edição detalhada do Genesis</Link></Button>
                    <Button size="sm" variant="ghost" asChild><Link to="/diretrizes"><ScrollText className="h-3.5 w-3.5" /> Diretrizes</Link></Button>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold">Perfis de comunicação</h2>
                <div className="grid gap-3 md:grid-cols-2" data-testid="current-profiles">
                  {st.profiles.map((p) => (
                    <div key={p.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4" data-testid="profile-card">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/identidade/perfis/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-secondary'}`}>
                          {p.status === 'active' ? 'ativo' : 'rascunho'} · v{p.version}{p.is_default ? ' · padrão' : ''}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{profileSummary(p)}</p>
                      {p.needs_recalibration && <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.needs_recalibration}</p>}
                      <div className="mt-auto flex gap-2 pt-1">
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => start('recalibrate', { targetProfileIds: [p.id], title: `Recalibrar ${p.name}` })} data-testid="profile-recalibrate">
                          {busy === 'recalibrate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalibrar
                        </Button>
                        <Button size="sm" variant="ghost" asChild><Link to={`/identidade/perfis/${p.id}`}>Ver perfil</Link></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 rounded-2xl border bg-card p-4" data-testid="current-emitters">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quem fala</p>
                  {st.emitters.map((e) => (
                    <p key={e.id} className="flex items-center gap-2 text-sm">{e.kind === 'person' ? <UserRound className="h-4 w-4 text-muted-foreground" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
                      {e.name} <span className="text-xs text-muted-foreground">{e.kind === 'person' ? 'voz autoral' : 'institucional'}{e.facts_status !== 'confirmed' ? ' · fatos a confirmar' : ''}</span></p>
                  ))}
                </div>
                <div className="space-y-2 rounded-2xl border bg-card p-4" data-testid="current-fronts">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frentes de atuação</p>
                  {st.fronts.map((f) => <div key={f.id} className="text-sm"><p className="font-medium">{f.name}</p>{f.territories.length > 0 && <p className="text-xs text-muted-foreground">{f.territories.join(' · ')}</p>}</div>)}
                </div>
                <div className="space-y-2 rounded-2xl border bg-card p-4" data-testid="current-audiences">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Públicos</p>
                  {st.audiences.map((a) => <p key={a.id} className="text-sm">{a.name} <span className="text-xs text-muted-foreground">{a.status === 'hypothesis' ? 'hipótese' : 'definido'}</span></p>)}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 rounded-2xl border bg-card p-4" data-testid="current-sources">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fontes e métodos</p>
                  <p className="flex items-center gap-2 text-sm"><BookOpen className="h-4 w-4 text-muted-foreground" /> {st.editorials.length} editorias ativas · {st.directives} diretrizes · {st.knowledge} documentos de conhecimento</p>
                  <Button size="sm" variant="ghost" asChild><Link to="/editoriais">Ver editorias</Link></Button>
                </div>
                <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4" data-testid="pending-review">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">O que falta revisar</p>
                  {pending.length ? <ul className="list-disc space-y-1 pl-4 text-sm">{pending.map((x) => <li key={x.k}>{x.text}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nada pendente.</p>}
                </div>
              </section>

              {done.length > 0 && <SessionList title="Ativações recentes" sessions={done} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function EntryCard({ icon, title, text, onClick, busy, accent, testId }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; busy?: boolean; accent?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} data-testid={testId}
      className={`flex flex-col gap-2 rounded-2xl border p-5 text-left transition hover:border-accent ${accent ? 'border-accent bg-accent/5' : 'bg-card'}`}>
      <span className="text-accent">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}</span>
      <span className="font-display text-base font-semibold">{title}</span>
      <span className="text-sm text-muted-foreground">{text}</span>
    </button>
  );
}

function SessionList({ title, sessions }: { title: string; sessions: SetupSession[] }) {
  return (
    <section className="space-y-2" data-testid="session-list">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="divide-y rounded-2xl border bg-card">
        {sessions.map((s) => (
          <Link key={s.id} to={`/identidade/sessoes/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-secondary/50">
            <span>{s.title ?? MODE_LABELS[s.mode]}</span>
            <span className="text-xs text-muted-foreground">{s.status === 'done' ? `ativada em ${new Date(s.activated_at ?? s.updated_at).toLocaleDateString('pt-BR')}` : `${STEP_LABELS[s.step] ?? s.step} · ${new Date(s.updated_at).toLocaleDateString('pt-BR')}`}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// /identidade/configurar?modo=setup|review|add_front|recalibrate&perfil=<id>: inicia a sessão e abre o percurso.
export function IdentityConfigure() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [params] = useSearchParams();
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      const mode = (params.get('modo') ?? 'review') as SetupMode;
      const profile = params.get('perfil');
      const brandId = params.get('marca') ?? (await identityApi.defaultBrandId());
      if (!brandId) { navigate('/identidade', { replace: true }); return; }
      const s = await identityApi.createSession(currentUser.id, { brandId, mode, targetProfileIds: profile ? [profile] : [], title: MODE_LABELS[mode] });
      navigate(`/identidade/sessoes/${s.id}`, { replace: true });
    })().catch((e) => { toast.error((e as Error).message); navigate('/identidade', { replace: true }); });
  }, [currentUser, navigate, params]);
  return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
}
