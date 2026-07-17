// Dashboard de eficácia da IA — /aprendizado.
//
// Responde a uma pergunta só: a IA já escreve como você, a ponto de poder
// escrever sozinha? A campanha de conteúdo destrava aqui.
//
// A régua: aprovar um post sem tocar no texto = a IA acertou. Qualquer edição
// conta como erro. Mexer no canvas não conta — só quote e caption.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, CheckCircle2, Lightbulb, Loader2, Lock, LockOpen, PencilLine, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiApi } from '@/lib/api';
import type { AiGate, AiLearning, AiReview } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function Aprendizado() {
  const [gate, setGate] = useState<AiGate | null>(null);
  const [learnings, setLearnings] = useState<AiLearning[]>([]);
  const [reviews, setReviews] = useState<AiReview[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [g, l, r] = await Promise.all([
        aiApi.gate(),
        aiApi.listLearnings(),
        aiApi.listReviews(30),
      ]);
      setGate(g);
      setLearnings(l);
      setReviews(r);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar o aprendizado');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function toggle(l: AiLearning) {
    try {
      await aiApi.toggleLearning(l.id, !l.ativo);
      setLearnings((cur) => cur.map((x) => (x.id === l.id ? { ...x, ativo: !x.ativo } : x)));
      toast.success(!l.ativo ? 'Lição religada' : 'Lição desligada — sai do próximo prompt');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao alterar');
    }
  }

  if (loading || !gate) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const corrigidos = reviews.filter((r) => r.changed);
  const ativas = learnings.filter((l) => l.ativo);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header>
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold">Aprendizado</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Quanto a IA já escreve como você. Cada post que você aprova sem editar prova que ela
          acertou; cada correção vira uma lição. Aos {gate.meta}%, a campanha de conteúdo destrava
          sozinha.
        </p>
      </header>

      <GateCard gate={gate} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-accent" />
              <h2 className="font-display text-base font-semibold">O que a IA está aprendendo</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Regras destiladas das suas correções. As ativas entram no prompt da próxima geração —
              desligue a que não fizer sentido.
            </p>

            {learnings.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nada ainda. As lições aparecem quando você corrige um post e aprova.
              </p>
            ) : (
              <ul className="space-y-2">
                {learnings.map((l) => (
                  <li
                    key={l.id}
                    className={cn(
                      'rounded-md border p-2.5 transition-colors',
                      l.ativo ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-xs leading-snug', !l.ativo && 'text-muted-foreground line-through')}>
                        {l.texto}
                      </p>
                      <button
                        onClick={() => void toggle(l)}
                        title={l.ativo ? 'Desligar (sai do prompt)' : 'Religar'}
                        className={cn(
                          'relative h-4 w-7 shrink-0 rounded-full transition-colors',
                          l.ativo ? 'bg-accent' : 'bg-muted-foreground/30',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
                            l.ativo ? 'left-3.5' : 'left-0.5',
                          )}
                        />
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[9px]">{l.categoria}</Badge>
                      {l.evidencias > 1 && (
                        <Badge variant="outline" className="text-[9px]" title="Quantas correções suas reforçaram esta mesma regra">
                          reforçada {l.evidencias}x
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-accent" />
              <h2 className="font-display text-base font-semibold">Correções recentes</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              O que a IA escreveu × o que você deixou. É daqui que saem as lições.
            </p>

            {corrigidos.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nenhuma correção ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {corrigidos.slice(0, 8).map((r) => (
                  <li key={r.id} className="rounded-md border border-border p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      A IA escreveu
                    </p>
                    <p className="text-xs leading-snug text-muted-foreground line-through">
                      {r.quote_original.slice(0, 130)}
                    </p>
                    <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Você deixou
                    </p>
                    <p className="text-xs leading-snug">{r.quote_final.replace(/\s+/g, ' ').slice(0, 130)}</p>
                    {typeof r.drift_pct === 'number' && (
                      <p className="mt-1 text-[9px] text-muted-foreground">
                        {r.drift_pct}% do texto mudou ·{' '}
                        {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            {ativas.length} lição(ões) ativa(s) moldando cada geração ·{' '}
            {gate.total_revisados} post(s) já medido(s) no total
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Ver o kanban</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GateCard({ gate }: { gate: AiGate }) {
  const pct = Math.min(100, (gate.acuracia / gate.meta) * 100);
  const faltaAmostra = Math.max(0, gate.min_amostra - gate.amostra);
  const faltaGeracoes = Math.max(0, gate.min_geracoes - gate.geracoes);

  // Por que ainda não destravou — a razao mais bloqueante primeiro.
  const bloqueio = faltaAmostra > 0
    ? `Faltam ${faltaAmostra} post(s) medido(s) — a régua precisa de ${gate.min_amostra} pra significar algo.`
    : faltaGeracoes > 0
      ? `Faltam ${faltaGeracoes} geração(ões) distinta(s). As 5 variações de uma mesma geração não são tentativas independentes.`
      : gate.acuracia < gate.meta
        ? `A IA está em ${gate.acuracia}% e precisa de ${gate.meta}%. Nos últimos ${gate.amostra} posts, ${gate.alterados} precisaram de correção.`
        : '';

  return (
    <Card className={cn(gate.destravada ? 'border-emerald-500/50' : 'border-accent/40')}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {gate.destravada ? (
                <LockOpen className="h-4 w-4 text-emerald-600" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {gate.destravada ? 'Campanha destravada' : 'Campanha travada'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-5xl font-bold">{gate.acuracia}%</span>
              <span className="text-sm text-muted-foreground">de {gate.meta}% necessários</span>
            </div>
          </div>

          <div className="flex gap-4 text-center">
            <Stat icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} label="intactos" value={gate.intactos} />
            <Stat icon={<PencilLine className="h-3.5 w-3.5 text-amber-600" />} label="corrigidos" value={gate.alterados} />
            <Stat icon={<Target className="h-3.5 w-3.5 text-muted-foreground" />} label="gerações" value={gate.geracoes} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                gate.destravada ? 'bg-emerald-500' : 'bg-accent',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Janela: últimos {gate.amostra} de {gate.min_amostra} posts medidos
          </p>
        </div>

        {gate.destravada ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="text-xs">
              🎉 A IA provou que escreve na sua voz. A <strong>Campanha de conteúdo</strong> está
              liberada — ela pode gerar sozinha agora.
            </p>
            <Button asChild variant="accent" size="sm">
              <Link to="/linhas">Abrir campanha</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs leading-snug">{bloqueio}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Gere um post individual, corrija o que precisar e aprove. Aprovar sem editar é o que
              faz o número subir.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="text-xl font-bold leading-none">{value}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
