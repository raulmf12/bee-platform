// Perfil de comunicação: composição atual (quem fala · frente · público · posicionamento ·
// expressão), histórico de versões e entrada para Recalibrar (Guia §6).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { identityApi, profileSummary, type ProfileView } from '@/lib/identityApi';
import { useAuthStore } from '@/store/authStore';
import type { ProfileVersion } from '@/types';

const VSTATUS: Record<ProfileVersion['status'], string> = { active: 'ativa', reviewed: 'revisada', draft: 'rascunho', superseded: 'substituída' };

export function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [p, setP] = useState<ProfileView | null | undefined>(undefined);
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const brands = await identityApi.brands();
      for (const b of brands) {
        const found = (await identityApi.profiles(b.id)).find((x) => x.id === id);
        if (found) { setP(found); break; }
      }
      setP((cur) => cur ?? null);
      setVersions(await identityApi.versions(id));
    })().catch(() => setP(null));
  }, [id]);

  async function recalibrate() {
    if (!p || !currentUser) return;
    setBusy(true);
    try {
      const s = await identityApi.createSession(currentUser.id, { brandId: p.brand_id, mode: 'recalibrate', targetProfileIds: [p.id], title: `Recalibrar ${p.name}` });
      navigate(`/identidade/sessoes/${s.id}`);
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  }

  if (p === undefined) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!p) return <div className="p-8"><Link to="/identidade" className="text-sm text-accent">← Minha identidade</Link><p className="mt-4">Perfil não encontrado.</p></div>;
  const row = (label: string, v?: string | null) => (v ? <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm">{v}</p></div> : null);
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8" data-testid="profile-detail">
      <Link to={`/identidade?marca=${p.brand_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Minha identidade</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-muted-foreground">{profileSummary(p)} · {p.status === 'active' ? 'ativo' : 'rascunho'} · versão {p.version}</p>
        </div>
        <Button variant="accent" onClick={recalibrate} disabled={busy} data-testid="detail-recalibrate">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recalibrar</Button>
      </div>
      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
        {row('Quem fala', p.emitter ? `${p.emitter.name} (${p.emitter.kind === 'person' ? 'voz autoral' : 'institucional'})` : null)}
        {row('Frente', p.front?.name)}
        {row('Público prioritário', p.audience ? `${p.audience.name}${p.audience.status === 'hypothesis' ? ' — hipótese' : ''}` : 'a definir')}
        {row('Ofertas no conteúdo', p.cta_policy === 'never' ? 'nunca' : p.cta_policy === 'soft' ? 'menção leve' : 'só quando a intenção pedir')}
        {row('Posicionamento', p.positioning)}
        {row('Expressão', p.expression)}
        {row('Lugar de fala', p.emitter?.speaking_rules)}
        {row('Falta decidir', p.needs_recalibration)}
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Versões</h2>
        <div className="divide-y rounded-2xl border bg-card" data-testid="profile-versions">
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" data-testid="profile-version">
              <span><b>v{v.version}</b> · {VSTATUS[v.status]}</span>
              <span className="text-xs text-muted-foreground">{v.reason ?? ''} · {new Date(v.activated_at ?? v.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Peças agendadas e conteúdos já criados guardam a versão com que nasceram.</p>
      </section>
    </div>
  );
}
