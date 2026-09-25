// TELA 02 — CRIAR: "O que você quer criar agora?"
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, PenLine, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WizardShell, ChoiceCard } from '@/components/campaign/WizardShell';
import { HiveNote } from '@/components/campaign/HiveNote';
import { recommendNextMove, type NextMove } from '@/lib/campaign/recommend';

export function CreateHub() {
  const navigate = useNavigate();
  const [move, setMove] = useState<NextMove | null>(null);
  const [loading, setLoading] = useState(false);

  async function askHive() {
    setLoading(true);
    try { setMove(await recommendNextMove()); } finally { setLoading(false); }
  }

  return (
    <WizardShell title="O que você quer criar agora?" onBack={() => navigate(-1)}>
      <div className="grid gap-3">
        <ChoiceCard testId="create-campaign" onClick={() => navigate('/campanhas/nova')} icon={<Layers className="h-5 w-5" />}
          title="Campanha de conteúdos" description="Uma estratégia que a Hive transforma em ciclos de ideias, conteúdos e peças." />
        <ChoiceCard testId="create-content" onClick={() => navigate('/criar/conteudo')} icon={<PenLine className="h-5 w-5" />}
          title="Um conteúdo" description="Uma ideia pontual, fora de campanha." />
        <ChoiceCard testId="create-recommend" onClick={askHive} icon={loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          title="Hive, recomende" description="Deixar a Hive analisar seu momento e sugerir o melhor próximo movimento." />
      </div>
      {move && (
        <HiveNote title="Hive recomenda" action={(
          <Button size="sm" variant="accent" onClick={() => navigate(move.to)}>{move.cta} <ArrowRight className="h-3.5 w-3.5" /></Button>
        )}>
          <p className="font-semibold" data-testid="next-move-title">{move.title}</p>
          <p className="text-muted-foreground">{move.body}</p>
        </HiveNote>
      )}
    </WizardShell>
  );
}
