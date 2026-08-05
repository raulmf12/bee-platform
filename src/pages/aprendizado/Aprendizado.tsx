// Dashboard de eficácia da IA — /aprendizado.
//
// A campanha libera POR CONJUNTO (editoria × plataforma × alvo), não tudo de
// uma vez. E a medição é POR FACETA (texto / legenda / imagem): a IA pode
// escrever ótimo e falhar na imagem, então cada faceta é medida no seu eixo.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, Image as ImageIcon, Lightbulb, Loader2, LockOpen, PencilLine, Type as TypeIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiApi, severidadeFaceta } from '@/lib/api';
import type { AiFacet, AiFacetStat, AiGate, AiLearning, AiReview, AiSegment } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const AVATAR_LABEL: Record<string, string> = {
  identificado: 'identificado',
  incomodado: 'incomodado',
  ambos: 'ambos os públicos',
};
const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', instagram: 'Instagram' };

function editorialLabel(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const segmentos = [...gate.segmentos].sort((a, b) => Number(b.destravada) - Number(a.destravada));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header>
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold">Aprendizado</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A campanha libera por conjunto — cada editoria, plataforma e público no seu ritmo. Cada
          post que você aprova sem editar prova que a IA acertou ali. Aos {gate.meta}% em todas as
          facetas, aquele conjunto destrava sozinho.
        </p>
      </header>

      {/* Resumo global */}
      <Card className={cn(gate.destravados > 0 ? 'border-emerald-500/50' : 'border-accent/40')}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-bold">{gate.destravados}</span>
              <span className="text-sm text-muted-foreground">
                de {gate.total_segmentos} conjunto(s) liberado(s)
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {gate.destravados === 0
                ? 'Nenhum conjunto liberou ainda. Aprovar sem editar é o que faz um deles abrir.'
                : gate.em_risco
                  ? '⚠️ Um conjunto liberado está escorregando — veja abaixo.'
                  : 'A campanha já gera sozinha nos conjuntos liberados.'}
            </p>
          </div>
          {gate.destravados > 0 && (
            <Button asChild variant="accent" size="sm">
              <Link to="/linhas">Abrir campanha</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Conjuntos (segmentos) */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold">Conjuntos em medição</h2>
          <p className="text-xs text-muted-foreground">
            Cada linha é um (editoria × plataforma × público). Libera com {gate.min_amostra} posts e
            cada faceta ≥ {gate.meta}%.
          </p>
        </div>
        {segmentos.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Nenhum conjunto tem medição ainda. Gere um post individual e aprove.
          </div>
        ) : (
          <div className="space-y-2">
            {segmentos.map((s) => (
              <SegmentRow key={`${s.editorial_slug}-${s.platform}-${s.target_avatar}`} s={s} meta={gate.meta} min={gate.min_amostra} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Aprendizados (faceted) */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-accent" />
              <h2 className="font-display text-base font-semibold">O que a IA está aprendendo</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Regras destiladas das suas correções, por faceta. As ativas entram no prompt — desligue
              a que não fizer sentido.
            </p>

            {learnings.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nada ainda. As lições aparecem quando você reescreve um post e aprova.
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
                        <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', l.ativo ? 'left-3.5' : 'left-0.5')} />
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <FacetBadge facet={l.facet} />
                      <Badge variant="secondary" className="text-[9px]">{l.categoria}</Badge>
                      {l.evidencias > 1 && (
                        <Badge variant="outline" className="text-[9px]" title="Correções que reforçaram esta regra">
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

        {/* Correções recentes (por faceta) */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-accent" />
              <h2 className="font-display text-base font-semibold">Correções recentes</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              O que a IA escreveu × o que você deixou. Reescrita vira lição; ajuste cosmético não.
            </p>

            {corrigidos.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nenhuma correção ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {corrigidos.slice(0, 8).map((r) => {
                  const sevTexto = severidadeFaceta('texto', r);
                  return (
                    <li key={r.id} className="rounded-md border border-border p-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          A IA escreveu
                        </p>
                        {sevTexto && sevTexto !== 'intacto' && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[9px]',
                              sevTexto === 'ajuste'
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                            )}
                          >
                            {sevTexto}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs leading-snug text-muted-foreground line-through">
                        {r.quote_original.slice(0, 130)}
                      </p>
                      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Você deixou
                      </p>
                      <p className="text-xs leading-snug">{r.quote_final.replace(/\s+/g, ' ').slice(0, 130)}</p>
                      {typeof r.quote_drift_pct === 'number' && (
                        <p className="mt-1 text-[9px] text-muted-foreground">
                          {r.quote_drift_pct}% do texto mudou ·{' '}
                          {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            {ativas.length} lição(ões) ativa(s) moldando cada geração · {gate.amostra_total} post(s)
            medido(s) no total
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Ver o kanban</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SegmentRow({ s, meta, min }: { s: AiSegment; meta: number; min: number }) {
  const estado = s.destravada ? (s.em_risco ? 'risco' : 'firme') : 'travado';
  return (
    <Card className={cn(
      estado === 'firme' ? 'border-emerald-500/40' : estado === 'risco' ? 'border-amber-500/40' : 'border-border',
    )}>
      <CardContent className="space-y-2.5 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {s.destravada && <LockOpen className={cn('h-3.5 w-3.5', estado === 'risco' ? 'text-amber-600' : 'text-emerald-600')} />}
            <span className="text-sm font-semibold">{editorialLabel(s.editorial_slug)}</span>
            <Badge variant="secondary" className="text-[9px]">{PLATFORM_LABEL[s.platform] ?? s.platform}</Badge>
            <Badge variant="secondary" className="text-[9px]">{AVATAR_LABEL[s.target_avatar] ?? s.target_avatar}</Badge>
          </div>
          <span className={cn(
            'text-[10px] font-semibold uppercase tracking-wider',
            estado === 'firme' ? 'text-emerald-600' : estado === 'risco' ? 'text-amber-600' : 'text-muted-foreground',
          )}>
            {estado === 'firme' ? 'liberado' : estado === 'risco' ? 'liberado · escorregando' : `${s.amostra}/${min} medidos`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <FacetBar facet="texto" stat={s.texto} meta={meta} />
          <FacetBar facet="legenda" stat={s.legenda} meta={meta} />
          <FacetBar facet="imagem" stat={s.imagem} meta={meta} />
        </div>
      </CardContent>
    </Card>
  );
}

const FACET_META: Record<AiFacet, { label: string; icon: typeof TypeIcon }> = {
  texto: { label: 'Texto', icon: TypeIcon },
  legenda: { label: 'Legenda', icon: PencilLine },
  imagem: { label: 'Imagem', icon: ImageIcon },
};

function FacetBar({ facet, stat, meta }: { facet: AiFacet; stat: AiFacetStat; meta: number }) {
  const { label, icon: Icon } = FACET_META[facet];
  const na = stat.acuracia === null;
  const passa = stat.passa === true;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </span>
        <span className={cn('text-[10px] font-semibold', na ? 'text-muted-foreground/50' : passa ? 'text-emerald-600' : 'text-amber-600')}>
          {na ? '—' : `${stat.acuracia}%`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        {!na && (
          <div
            className={cn('h-full rounded-full', passa ? 'bg-emerald-500' : 'bg-amber-500')}
            style={{ width: `${Math.min(100, (stat.acuracia! / meta) * 100)}%` }}
          />
        )}
      </div>
      <p className="text-[8px] text-muted-foreground/70">
        {na ? 'sem imagem de IA ainda' : `${stat.amostra} medido(s)`}
      </p>
    </div>
  );
}

function FacetBadge({ facet }: { facet: AiFacet }) {
  const { label } = FACET_META[facet];
  const color = facet === 'texto' ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
    : facet === 'legenda' ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
    : 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300';
  return <Badge variant="secondary" className={cn('text-[9px]', color)}>{label}</Badge>;
}
