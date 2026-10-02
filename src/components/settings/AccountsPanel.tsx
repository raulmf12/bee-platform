// Contas sociais (multi-conta) — docs/PLANO-CAMPANHAS.md §3.1 / D2.
// Cada peça publica pela SUA conta (user_posts.account_id). Ex.: Instagram ·
// Marcos, LinkedIn · Marcos, Instagram · Bee Consulting.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Instagram, Linkedin, Loader2, Plus, Star, Trash2, Download, CheckCircle2, RefreshCw, Scale } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { accountApi } from '@/lib/campaignApi';
import { edge } from '@/lib/edge';
import { importInstagramHistory, type ImportProgress } from '@/lib/instagramImport';
import { getMetaConnection, saveMetaConnection, syncMetaAds, type MetaConnectionStatus } from '@/lib/metaAds';
import { useAuthStore } from '@/store/authStore';
import type { SocialAccount } from '@/types';

// Insights entra no escopo pra coletar alcance/salvamentos (D3). Contas já
// conectadas antes disso seguem publicando; só as métricas ficam limitadas.
// ads_read: tráfego pago (BMs, contas de anúncio, campanhas e desempenho) — guardado pra uso futuro.
const IG_SCOPE = 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management,ads_read';
const FB_APP_ID = (import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined) || '2082883022288225';
export const IG_ACCOUNT_STATE_KEY = 'ig_account_oauth_state';
const IG_ACCOUNT_LABEL_KEY = 'ig_account_label';

type IgChoice = { instagram_business_account_id: string; username: string; page_name: string };

export function AccountsPanel() {
  const { settings, currentUser } = useAuthStore();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Importação do histórico do Instagram em andamento (por conta).
  const [importing, setImporting] = useState<Record<string, ImportProgress>>({});
  // Tráfego pago (Meta Ads): só o status (os dados ficam no banco pra uso futuro).
  const [meta, setMeta] = useState<MetaConnectionStatus | null>(null);
  const [metaSync, setMetaSync] = useState<{ queue_left: number } | null>(null);

  // LinkedIn (token colado + URN)
  const [liOpen, setLiOpen] = useState(false);
  const [liLabel, setLiLabel] = useState('');
  const [liToken, setLiToken] = useState('');
  const [liUrn, setLiUrn] = useState('');
  const [liTesting, setLiTesting] = useState(false);

  // Instagram (OAuth do Facebook)
  const [igOpen, setIgOpen] = useState(false);
  const [igLabel, setIgLabel] = useState('');

  const load = useCallback(async () => {
    try {
      setAccounts(await accountApi.list());
    } catch (e) {
      toast.error(`Falha ao carregar contas: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const loadMeta = useCallback(async () => { setMeta(await getMetaConnection().catch(() => null)); }, []);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  const runMetaSync = useCallback(async () => {
    setMetaSync({ queue_left: 0 });
    try {
      const r = await syncMetaAds((p) => setMetaSync({ queue_left: p.queue_left }));
      if (r?.status === 'no_ads_permission') toast.info('Tráfego pago: as BMs vieram, mas os anúncios precisam da permissão ads_read no app da Meta (depois reconecte).', { duration: 12000 });
      else if (r?.error) toast.error(`Tráfego pago: ${r.error.slice(0, 160)}`);
      else if (r && !r.done) toast.info('Tráfego pago: o histórico continua sendo trazido em segundo plano.');
    } catch (e) {
      toast.error(`Tráfego pago: ${(e as Error).message.slice(0, 160)}`);
    } finally { setMetaSync(null); await loadMeta(); }
  }, [loadMeta]);

  // Traz TODO o histórico da conta pra base (peças + métricas + retrato da conta).
  const runImport = useCallback(async (a: Pick<SocialAccount, 'id' | 'label'>) => {
    setImporting((m) => ({ ...m, [a.id]: { processed: 0, total: null, inserted: 0, updated: 0, insights: true, errors: [], done: false } }));
    try {
      const r = await importInstagramHistory(a.id, (p) => setImporting((m) => ({ ...m, [a.id]: p })));
      toast.success(`"${a.label}": ${r.processed} posts lidos · ${r.inserted} novos na base${r.updated ? ` · ${r.updated} já existentes atualizados` : ''}.`);
      if (!r.insights) toast.info(`"${a.label}" veio sem alcance/salvos: reconecte a conta e aceite a permissão de métricas (Insights).`);
      if (r.errors.length) toast.warning(`${r.errors.length} post(s) não importaram — tente "Atualizar histórico" de novo.`);
    } catch (e) {
      toast.error(`Falha ao importar "${a.label}": ${(e as Error).message.slice(0, 200)}`);
    } finally {
      setImporting((m) => { const n = { ...m }; delete n[a.id]; return n; });
      await load();
    }
  }, [load]);

  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/configuracoes` : '';

  // Salva (ou atualiza) UMA conta do Instagram encontrada no login.
  const saveIg = useCallback(async (choice: IgChoice, token: string, expiresAt: string, label: string) => {
    const existing = (await accountApi.list()).find(
      (a) => a.platform === 'instagram' && a.instagram_business_account_id === choice.instagram_business_account_id,
    );
    const fields = {
      instagram_access_token: token,
      instagram_business_account_id: choice.instagram_business_account_id,
      instagram_token_expires_at: expiresAt,
      handle: choice.username ? `@${choice.username}` : choice.page_name,
      scopes: IG_SCOPE.split(','),
      status: 'connected' as const,
    };
    // Reconectar a conta "via Integrações" a transforma numa conta com token
    // próprio (com a permissão de métricas). Peças antigas sem conta seguem
    // publicando por Integrações, como antes.
    return existing
      ? accountApi.update(existing.id, { ...fields, metadata: { ...(existing.metadata ?? {}), source: 'own' } })
      : accountApi.create({ platform: 'instagram', label, ...fields });
  }, []);

  // Retorno do OAuth (?code&state) iniciado por ESTE painel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code'); const state = params.get('state');
    const saved = sessionStorage.getItem(IG_ACCOUNT_STATE_KEY);
    if (!code || !state || state !== saved) return;
    const typed = sessionStorage.getItem(IG_ACCOUNT_LABEL_KEY) || '';
    sessionStorage.removeItem(IG_ACCOUNT_STATE_KEY);
    sessionStorage.removeItem(IG_ACCOUNT_LABEL_KEY);
    (async () => {
      setBusy(true);
      try {
        const res = await edge.connectInstagram({ code, redirect_uri: redirectUri });
        const found = res.accounts ?? [];
        if (found.length === 0) throw new Error('Nenhum perfil do Instagram Business vinculado a esse login.');
        // TODAS as contas que esse login administra entram de uma vez (o mesmo
        // token publica em qualquer uma). Nome = @username do Instagram.
        const saved = [];
        for (const c of found) {
          const label = c.username ? `@${c.username}` : (typed || c.page_name || 'Instagram');
          saved.push(await saveIg(c, res.access_token, res.expires_at, label));
        }
        toast.success(`${saved.length === 1 ? 'Conta conectada' : `${saved.length} contas conectadas`}: ${found.map((c) => `@${c.username || c.page_name}`).join(', ')} — trazendo o histórico…`);
        if (found.length === 1) toast.info('Só 1 conta do Instagram foi liberada nesse login. Para trazer outra, conecte de novo e, no Facebook, em "Editar acesso", marque também a outra conta e a Página dela.', { duration: 12000 });
        await load();
        // Mesmo login = mesmo token: guarda a conexão do tráfego pago (BMs, anúncios).
        await saveMetaConnection(res.access_token, res.expires_at, IG_SCOPE.split(',')).catch((e) => console.error('[meta-ads]', e));
        await loadMeta();
        for (const a of saved) await runImport(a);
        await runMetaSync();
      } catch (e) {
        toast.error(`Falha ao conectar: ${(e as Error).message.slice(0, 200)}`);
      } finally {
        setBusy(false);
        window.history.replaceState({}, '', '/configuracoes');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startIgOAuth() {
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem(IG_ACCOUNT_STATE_KEY, state);
    sessionStorage.setItem(IG_ACCOUNT_LABEL_KEY, igLabel.trim());
    window.location.href =
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FB_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&scope=${encodeURIComponent(IG_SCOPE)}` +
      // O Facebook lembra quais contas foram liberadas e pula a tela; isto força
      // a tela de novo, pra poder marcar outras contas do Instagram.
      '&auth_type=rerequest';
  }

  async function testLinkedIn() {
    if (!liToken.trim()) { toast.error('Cole o token primeiro.'); return; }
    setLiTesting(true);
    try {
      const data = await edge.testLinkedIn({ token: liToken.trim() });
      toast.success(`LinkedIn OK · ${data.name ?? data.email ?? data.sub}`);
      if (!liUrn && data.suggested_urn) setLiUrn(data.suggested_urn);
    } catch (e) {
      toast.error(`Token não validou: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setLiTesting(false);
    }
  }

  async function saveLinkedIn() {
    if (!liLabel.trim()) { toast.error('Dê um nome pra conta.'); return; }
    setBusy(true);
    try {
      await accountApi.create({
        platform: 'linkedin', label: liLabel.trim(),
        linkedin_token: liToken.trim() || null, linkedin_author_urn: liUrn.trim() || null,
        status: 'connected',
      });
      toast.success(`Conta LinkedIn · ${liLabel.trim()} adicionada`);
      setLiOpen(false); setLiLabel(''); setLiToken(''); setLiUrn('');
      await load();
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setBusy(false);
    }
  }

  // Cria as contas a partir das credenciais que já estão em Integrações. Elas NÃO
  // copiam o token: publicam com o de Integrações (fonte única, renovada sozinha).
  async function importFromIntegrations() {
    const owner = (currentUser?.name ?? '').split(' ')[0] || 'Principal';
    let created = 0;
    setBusy(true);
    try {
      const current = await accountApi.list();
      const viaIntegrations = (platform: 'linkedin' | 'instagram') => current.some((a) => a.platform === platform && a.metadata?.source === 'integrations');
      if (settings?.linkedin_token && !viaIntegrations('linkedin') && !current.some((a) => a.platform === 'linkedin' && a.linkedin_author_urn === settings.linkedin_author_urn)) {
        await accountApi.create({ platform: 'linkedin', label: owner, linkedin_author_urn: settings.linkedin_author_urn ?? null, status: 'connected', metadata: { source: 'integrations' } });
        created++;
      }
      if (settings?.instagram_access_token && !viaIntegrations('instagram') && !current.some((a) => a.platform === 'instagram' && a.instagram_business_account_id === settings.instagram_business_account_id)) {
        await accountApi.create({ platform: 'instagram', label: owner, instagram_business_account_id: settings.instagram_business_account_id ?? null, status: 'connected', metadata: { source: 'integrations' } });
        created++;
      }
      toast.success(created ? `${created} conta(s) importada(s) das integrações.` : 'Nada novo pra importar.');
      await load();
    } catch (e) {
      toast.error(`Falha ao importar: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(a: SocialAccount) {
    await accountApi.setDefault(a);
    toast.success(`"${a.label}" agora é a conta padrão do ${a.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}.`);
    await load();
  }

  async function remove(a: SocialAccount) {
    if (!confirm(`Remover a conta "${a.label}"? Peças ligadas a ela ficam sem conta até você escolher outra.`)) return;
    await accountApi.remove(a.id);
    toast.success('Conta removida.');
    await load();
  }

  const hasIntegrationCreds = Boolean(settings?.linkedin_token || settings?.instagram_access_token);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contas conectadas</CardTitle>
        <CardDescription>
          Cada peça é publicada por uma conta. Campanhas escolhem em quais contas atuar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando contas…</div>
        ) : accounts.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="accounts-empty">
            Nenhuma conta ainda.{hasIntegrationCreds ? ' Você pode importar as que já estão em Integrações.' : ''}
          </p>
        ) : (
          <ul className="divide-y rounded-md border" data-testid="accounts-list">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="account-row">
                <div className="flex min-w-0 items-center gap-3">
                  {a.platform === 'linkedin'
                    ? <Linkedin className="h-5 w-5 shrink-0 text-[#0A66C2]" />
                    : <Instagram className="h-5 w-5 shrink-0 text-[#E1306C]" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {a.label}
                    </p>
                    {a.platform === 'instagram' && <ImportLine a={a} progress={importing[a.id]} />}
                    <p className="truncate text-xs text-muted-foreground">
                      {a.metadata?.source === 'integrations' ? 'via Integrações' : (a.handle ?? (a.platform === 'linkedin' ? (a.linkedin_author_urn ?? 'sem URN') : (a.instagram_business_account_id ?? 'sem perfil')))}
                      {a.platform === 'instagram' && (a.metadata?.source === 'integrations' ? settings?.instagram_token_expires_at : a.instagram_token_expires_at)
                        ? ` · token até ${new Date((a.metadata?.source === 'integrations' ? settings?.instagram_token_expires_at : a.instagram_token_expires_at)!).toLocaleDateString('pt-BR')}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.is_default && <Badge variant="accent" className="gap-1"><Star className="h-3 w-3" /> Padrão</Badge>}
                  <Badge variant={a.status === 'connected' ? 'secondary' : 'destructive'}>
                    {a.status === 'connected' ? 'Conectada' : a.status === 'expired' ? 'Expirada' : 'Desconectada'}
                  </Badge>
                  {!a.is_default && (
                    <Button size="sm" variant="outline" onClick={() => makeDefault(a)}>Tornar padrão</Button>
                  )}
                  {a.platform === 'instagram' && (
                    <Button size="sm" variant="outline" disabled={!!importing[a.id]} onClick={() => void runImport(a)} data-testid="import-history">
                      {importing[a.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {(a.metadata as { ig?: { imported_at?: string } })?.ig?.imported_at ? 'Atualizar histórico' : 'Importar histórico'}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label={`Remover ${a.label}`} onClick={() => remove(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {accounts.filter((a) => a.platform === 'instagram').length >= 2 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
            <span>Você tem {accounts.filter((a) => a.platform === 'instagram').length} contas do Instagram. Compare o desempenho delas lado a lado.</span>
            <Button asChild size="sm" variant="accent"><Link to="/desempenho/contas" data-testid="open-compare"><Scale className="h-3.5 w-3.5" /> Comparar contas</Link></Button>
          </div>
        )}

        {(meta || metaSync) && <MetaAdsLine meta={meta} syncing={metaSync} onSync={() => void runMetaSync()} />}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLiOpen(true)} disabled={busy}>
            <Plus className="h-4 w-4" /> Adicionar conta do LinkedIn
          </Button>
          <Button variant="outline" onClick={() => setIgOpen(true)} disabled={busy}>
            <Plus className="h-4 w-4" /> Conectar conta do Instagram
          </Button>
          {hasIntegrationCreds && (
            <Button variant="ghost" onClick={importFromIntegrations} disabled={busy}>
              <Download className="h-4 w-4" /> Importar das integrações atuais
            </Button>
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
        </div>
      </CardContent>

      {/* LinkedIn */}
      <Dialog open={liOpen} onOpenChange={setLiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conta do LinkedIn</DialogTitle>
            <DialogDescription>Token gerado no LinkedIn Developer (scope w_member_social) + URN do autor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="li-label">Nome da conta</Label>
              <Input id="li-label" value={liLabel} onChange={(e) => setLiLabel(e.target.value)} placeholder="Ex.: Marcos" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="li-token">Token de acesso</Label>
              <Input id="li-token" type="password" value={liToken} onChange={(e) => setLiToken(e.target.value)} placeholder="AQX..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="li-urn">URN do autor</Label>
              <Input id="li-urn" value={liUrn} onChange={(e) => setLiUrn(e.target.value)} placeholder="urn:li:person:..." />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={testLinkedIn} disabled={liTesting}>
                {liTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Testar token
              </Button>
              <Button variant="accent" onClick={saveLinkedIn} disabled={busy}>Salvar conta</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Instagram */}
      <Dialog open={igOpen} onOpenChange={setIgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar conta do Instagram</DialogTitle>
            <DialogDescription>
              Entre com o Facebook que administra os perfis Business. Todas as contas do Instagram desse login são conectadas de uma vez, e o histórico de cada uma vem junto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ig-label">Nome da conta (opcional)</Label>
              <Input id="ig-label" value={igLabel} onChange={(e) => setIgLabel(e.target.value)} placeholder="Ex.: Bee Consulting" />
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="accent" onClick={startIgOAuth}><Instagram className="h-4 w-4" /> Continuar com o Facebook</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Situação da importação de uma conta do Instagram (progresso ou último retrato).
function ImportLine({ a, progress }: { a: SocialAccount; progress?: ImportProgress }) {
  const ig = (a.metadata as { ig?: { imported_at?: string; insights_ok?: boolean; profile?: { followers_count?: number; media_count?: number } } })?.ig;
  if (progress) {
    const pct = progress.total ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : null;
    return (
      <div className="mt-1 w-56 space-y-1" data-testid="import-progress">
        <p className="text-xs text-accent">Importando histórico… {progress.processed}{progress.total ? ` de ${progress.total}` : ''} posts</p>
        <div className="h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-accent transition-all" style={{ width: `${pct ?? 15}%` }} /></div>
      </div>
    );
  }
  if (!ig?.imported_at) return <p className="text-xs text-amber-600">Histórico ainda não importado.</p>;
  return (
    <p className="text-xs text-muted-foreground" data-testid="import-status">
      {ig.profile?.followers_count != null ? `${ig.profile.followers_count.toLocaleString('pt-BR')} seguidores · ` : ''}
      {ig.profile?.media_count ?? '—'} posts · histórico de {new Date(ig.imported_at).toLocaleDateString('pt-BR')}
      {ig.insights_ok === false && <span className="text-amber-600"> · sem alcance (reconecte e aceite Insights)</span>}
    </p>
  );
}

// Tráfego pago (Meta Ads): uma linha de status — os dados ficam guardados pra uso futuro.
function MetaAdsLine({ meta, syncing, onSync }: { meta: MetaConnectionStatus | null; syncing: { queue_left: number } | null; onSync: () => void }) {
  const s = meta?.sync_state?.summary ?? {};
  const pending = (meta?.sync_state?.queue ?? []).length;
  const spend = Object.entries(s.spend ?? {}).map(([cur, v]) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: cur || 'BRL' })).join(' + ');
  const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '');
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm" data-testid="meta-ads-line">
      <div className="min-w-0">
        <p className="font-medium">Tráfego pago (Meta Ads)</p>
        <p className="text-xs text-muted-foreground" data-testid="meta-ads-summary">
          {s.businesses ?? 0} BMs · {s.ad_accounts ?? 0} contas de anúncio · {s.campaigns ?? 0} campanhas · {s.ads ?? 0} anúncios
          {s.date_min && s.date_max ? ` · dados de ${fmt(s.date_min)} a ${fmt(s.date_max)}` : ''}{spend ? ` · investido: ${spend}` : ''}
        </p>
        {syncing ? <p className="text-xs text-accent">Sincronizando…{syncing.queue_left ? ` ${syncing.queue_left} meses de histórico na fila` : ''}</p>
          : meta?.status === 'no_ads_permission' ? <p className="text-xs text-amber-600">Anúncios sem permissão: cadastre ads_read no app da Meta e reconecte.</p>
          : meta?.status === 'expired' ? <p className="text-xs text-amber-600">Conexão do Facebook expirou: reconecte.</p>
          : meta?.sync_state?.last_error ? <p className="text-xs text-amber-600">{meta.sync_state.last_error}</p>
          : pending ? <p className="text-xs text-muted-foreground">Histórico em andamento ({pending} meses na fila) — continua sozinho a cada 30 min.</p>
          : meta?.last_synced_at ? <p className="text-xs text-muted-foreground">Atualizado em {new Date(meta.last_synced_at).toLocaleString('pt-BR')}.</p> : null}
      </div>
      <Button size="sm" variant="outline" disabled={!!syncing} onClick={onSync} data-testid="meta-ads-sync">
        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sincronizar agora
      </Button>
    </div>
  );
}
