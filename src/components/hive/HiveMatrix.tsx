// Matriz visual da Hive dentro da aba Templates: as manifestações M01..M08 e,
// pro M01 (congelado), as 5 variações renderizadas pelo compositor real.
// Read-only por ora (curadoria/edição vem depois); "Abrir prévia" leva ao
// laboratório /hive/preview.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { loadM01Design } from '@/lib/hive/loadDesign';
import { composeM01 } from '@/lib/hive/composeM01';
import { renderFabricToDataUrl } from '@/lib/templates/renderPost';

interface Manifestacao { id: string; nome: string; operacao: string | null; ativo: boolean; ordem: number }

const SAMPLES: Record<string, { text: string; hl?: string }> = {
  'M01-A': { text: 'O que permanece quando tudo o mais se cala.' },
  'M01-B': { text: 'Não é o que você controla. É o que você percebe.', hl: 'percebe' },
  'M01-C': { text: 'Toda estrutura revela o que a pressa esconde.', hl: 'revela' },
  'M01-D': { text: 'O silêncio também é uma direção.', hl: 'direção' },
  'M01-E': { text: 'O tempo constrói o que a pressa promete.', hl: 'constrói' },
};

export function HiveMatrix() {
  const [manis, setManis] = useState<Manifestacao[]>([]);
  const [variacoes, setVariacoes] = useState<Array<{ id: string; nome: string }>>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: mData }, design] = await Promise.all([
          supabase.from('design_manifestacoes').select('id,nome,operacao,ativo,ordem').order('ordem', { ascending: true }),
          loadM01Design(),
        ]);
        setManis((mData ?? []) as Manifestacao[]);
        setVariacoes(design.variacoes.map((v) => ({ id: v.id, nome: v.nome })));

        const out: Record<string, string> = {};
        await Promise.all(
          design.variacoes.map(async (recipe) => {
            const s = SAMPLES[recipe.id] ?? { text: 'Uma ideia. Muito silêncio.' };
            const allowHl = Boolean(recipe.limites?.destaque_permitido) && s.hl;
            const slide = composeM01({
              recipe, colors: design.colors, spiralUrl: design.spiralUrl,
              text: s.text, highlight: allowHl ? { target: s.hl! } : null,
              canvas: { w: 1080, h: 1350 },
            });
            const url = await renderFabricToDataUrl(slide, { width: 1080, height: 1350, multiplier: 0.24 });
            if (url) out[recipe.id] = url;
          }),
        );
        setThumbs(out);
      } catch (e) {
        console.error('[HiveMatrix]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/40 p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Sparkles className="h-5 w-5 text-accent" /> Matrizes visuais (Hive)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A mesma ideia, muitas formas de se manifestar. A Hive escolhe a matriz e a variação; a montagem é em camadas editáveis.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/hive/preview">Abrir prévia / calibrar</Link>
        </Button>
      </header>

      {/* M01 — congelado: mostra as 5 variações renderizadas */}
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Badge className="bg-accent text-accent-foreground">M01</Badge>
          <span className="font-semibold">Frase Essencial</span>
          <Badge variant="secondary" className="text-[10px]">v1.0 · congelada</Badge>
        </div>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            {variacoes.map((v) => (
              <div key={v.id} className="space-y-1.5">
                <div className="overflow-hidden rounded-md border border-border bg-muted/30" style={{ aspectRatio: '4 / 5' }}>
                  {thumbs[v.id]
                    ? <img src={thumbs[v.id]} alt={v.id} className="h-full w-full object-contain" />
                    : <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">—</div>}
                </div>
                <p className="text-xs"><b>{v.id.replace('M01-', '')}</b> · {v.nome}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* M02..M08 — em construção */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {manis.filter((m) => m.id !== 'M01').map((m) => (
          <div key={m.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{m.id}</Badge>
              <span className="text-sm font-semibold">{m.nome}</span>
            </div>
            {m.operacao && <p className="mt-1 text-xs text-muted-foreground">{m.operacao}</p>}
            <Badge variant="secondary" className="mt-2 text-[10px]">em construção</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
