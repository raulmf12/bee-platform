// Contas sociais (multi-conta) — docs/PLANO-CAMPANHAS.md §3.1 / D2.
// Cada peça publica pela SUA conta (user_posts.account_id). Ex.: Instagram ·
// Marcos, LinkedIn · Marcos, Instagram · Bee Consulting.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Instagram, Linkedin, Loader2, Plus, Star, Trash2, Download, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { accountApi } from '@/lib/campaignApi';
import { edge } from '@/lib/edge';
import { useAuthStore } from '@/store/authStore';
import type { SocialAccount } from '@/types';

// Insights entra no escopo pra coletar alcance/salvamentos (D3). Contas já
// conectadas antes disso seguem publicando; só as métricas ficam limitadas.
const IG_SCOPE = 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management';
const FB_APP_ID = (import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined) || '2082883022288225';
export const IG_ACCOUNT_STATE_KEY = 'ig_account_oauth_state';
const IG_ACCOUNT_LABEL_KEY = 'ig_account_label';

type IgChoice = { instagram_business_account_id: string; username: string; page_name: string };

export function AccountsPanel() {
  const { settings, currentUser } = useAuthStore();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // LinkedIn (token colado + URN)
  const [liOpen, setLiOpen] = useState(false);
  const [liLabel, setLiLabel] = useState('');
  const [liToken, setLiToken] = useState('');
  const [liUrn, setLiUrn] = useState('');
  const [liTesting, setLiTesting] = useState(false);

  // Instagram (OAuth do Facebook)
  const [igOpen, setIgOpen] = useState(false);
  const [igLabel, setIgLabel] = useState('');
  const [igChoices, setIgChoices] = useState<IgChoice[]>([]);
  const [igPending, setIgPending] = useState<{ access_token: string; expires_at: string; label: string } | null>(null);

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

  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/configuracoes` : '';

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
    if (existing) await accountApi.update(existing.id, fields);
    else await accountApi.create({ platform: 'instagram', label, ...fields });
    toast.success(`Instagram conectado · ${fields.handle}`);
    setIgChoices([]); setIgPending(null);
    await load();
  }, [load]);

  // Retorno do OAuth (?code&state) iniciado por ESTE painel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code'); const state = params.get('state');
    const saved = sessionStorage.getItem(IG_ACCOUNT_STATE_KEY);
    if (!code || !state || state !== saved) return;
    const label = sessionStorage.getItem(IG_ACCOUNT_LABEL_KEY) || 'Instagram';
    sessionStorage.removeItem(IG_ACCOUNT_STATE_KEY);
    sessionStorage.removeItem(IG_ACCOUNT_LABEL_KEY);
    (async () => {
      setBusy(true);
      try {
        const res = await edge.connectInstagram({ code, redirect_uri: redirectUri });
        const found = res.accounts ?? [];
        if (found.length === 0) throw new Error('Nenhum perfil do Instagram Business vinculado a esse login.');
        if (found.length === 1) await saveIg(found[0], res.access_token, res.expires_at, label);
        else {
          setIgChoices(found);
          setIgPending({ access_token: res.access_token, expires_at: res.expires_at, label });
          toast.success(`${found.length} perfis encontrados — escolha qual vira "${label}".`);
        }
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
    if (!igLabel.trim()) { toast.error('Dê um nome pra conta (ex.: Bee Consulting).'); return; }
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem(IG_ACCOUNT_STATE_KEY, state);
    sessionStorage.setItem(IG_ACCOUNT_LABEL_KEY, igLabel.trim());
    window.location.href =
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FB_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&scope=${encodeURIComponent(IG_SCOPE)}`;
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
                  <Button size="icon" variant="ghost" aria-label={`Remover ${a.label}`} onClick={() => remove(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {igChoices.length > 1 && igPending && (
          <div className="space-y-2 rounded-md border border-accent/40 bg-accent/5 p-3">
            <p className="text-sm font-medium">Qual perfil vira "{igPending.label}"?</p>
            <div className="flex flex-wrap gap-2">
              {igChoices.map((c) => (
                <Button key={c.instagram_business_account_id} size="sm" variant="outline"
                  onClick={() => saveIg(c, igPending.access_token, igPending.expires_at, igPending.label)}>
                  @{c.username || c.page_name}
                </Button>
              ))}
            </div>
          </div>
        )}

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
              Você vai entrar com o Facebook que administra o perfil Business. Já pedimos acesso às métricas (Insights).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ig-label">Nome da conta</Label>
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
