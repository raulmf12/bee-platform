// CRIAR → UM CONTEÚDO: uma ideia pontual, fora de campanha. Imagem + texto segue a
// mesma esteira da Produção (a Hive desenvolve, você valida, as peças nascem e vão
// pra agenda). Vídeo mantém o fluxo próprio (D13).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ImageIcon, Loader2, Video } from 'lucide-react';
import { WizardShell, ChoiceCard } from '@/components/campaign/WizardShell';
import { IdeaEditor, type IdeaDraft } from '@/components/production/IdeaEditor';
import { accountApi } from '@/lib/campaignApi';
import { beeApi } from '@/lib/api';
import { startAvulso } from '@/lib/campaign/avulso';
import type { BeeEditorial, SocialAccount } from '@/types';

export function OneContent() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'image' | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([accountApi.list(), beeApi.editorials()])
      .then(([a, e]) => { setAccounts(a); setEditorials(e.filter((x) => x.is_active !== false)); })
      .catch(() => setAccounts([]));
  }, []);

  async function start(d: IdeaDraft) {
    setSaving(true);
    try {
      const r = await startAvulso(d, accounts ?? []);
      navigate(`/producao?campaign=${r.campaign.id}&cycle=${r.cycle.id}`);
    } catch (e) {
      toast.error(`Não consegui criar o conteúdo: ${(e as Error).message.slice(0, 140)}`);
      setSaving(false);
    }
  }

  if (!kind) {
    return (
      <WizardShell eyebrow="Um conteúdo" title="Que tipo de conteúdo?" subtitle="Uma ideia pontual, fora de campanha." onBack={() => navigate('/criar')}>
        <div className="grid gap-3">
          <ChoiceCard testId="one-image" onClick={() => setKind('image')} icon={<ImageIcon className="h-5 w-5" />}
            title="Imagem e texto" description="A Hive desenvolve o pensamento, você valida e ela produz as peças para LinkedIn e Instagram." />
          <ChoiceCard testId="one-video" onClick={() => navigate('/podcasts/novo')} icon={<Video className="h-5 w-5" />}
            title="Vídeo" description="Vídeo pronto ou roteiro — o fluxo de vídeos de sempre." />
        </div>
      </WizardShell>
    );
  }

  const first = editorials[0]?.slug ?? '';
  const defaults = (accounts ?? []).filter((a) => a.is_default);
  return (
    <WizardShell eyebrow="Um conteúdo" title="Qual é a ideia?" subtitle="Conte o pensamento que você quer desenvolver. A Hive transforma em conteúdo na sua voz." onBack={() => setKind(null)}>
      {!accounts ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Conecte uma conta em Configurações › Contas para escolher onde publicar.</p>
      ) : (
        <IdeaEditor
          key={first}
          initial={{ title: '', summary: '', strategic_function: 'posicionamento', editorial_slug: first, channels: (defaults.length ? defaults : accounts).map((a) => ({ account_id: a.id, platform: a.platform })) }}
          editorials={editorials} accounts={accounts}
          saveLabel={saving ? 'Criando…' : 'Desenvolver com a Hive'} busy={saving}
          onSave={start} onCancel={() => navigate('/criar')}
        />
      )}
    </WizardShell>
  );
}
