// Matriz visual da Hive dentro da aba Templates: as manifestações M01..M08 e,
// pras congeladas (M01, M02), as variações renderizadas pelo compositor real.
// "Abrir prévia" leva ao laboratório /hive/preview; a M02 puxa foto real do
// Marcos da biblioteca (/hive/marcos) — sem foto, mostra o layout com placeholder.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { loadHiveDesign } from '@/lib/hive/loadDesign';
import { composeM01 } from '@/lib/hive/composeM01';
import { composeM02, type M02Asset } from '@/lib/hive/composeM02';
import { composeM03 } from '@/lib/hive/composeM03';
import { composeM04, type EventBrief } from '@/lib/hive/composeM04';
import { listMarcosPhotos } from '@/lib/hive/assetLib';
import { renderFabricToDataUrl } from '@/lib/templates/renderPost';

interface Manifestacao { id: string; nome: string; operacao: string | null; ativo: boolean; ordem: number }

const SAMPLES: Record<string, { text: string; hl?: string; sub?: string }> = {
  'M01-A': { text: 'O que permanece quando tudo o mais se cala.' },
  'M01-B': { text: 'Não é o que você controla. É o que você percebe.', hl: 'percebe' },
  'M01-C': { text: 'Toda estrutura revela o que a pressa esconde.', hl: 'revela' },
  'M01-D': { text: 'O silêncio também é uma direção.', hl: 'direção' },
  'M01-E': { text: 'O tempo constrói o que a pressa promete.', hl: 'constrói' },
  'M02-A': { text: 'Liderar melhor não é fazer mais. É ver mais.', hl: 'ver mais.', sub: 'O que você enxerga define o que você cria.' },
  'M02-B': { text: 'Liderança não é ter todas as respostas. É fazer as perguntas certas.', hl: 'perguntas certas.', sub: 'Diálogo verdadeiro gera transformação real.' },
  'M02-C': { text: 'Estratégia é escolher o que não fazer para ter liberdade no que fazer.', hl: 'liberdade', sub: 'Foco não é restrição. É o caminho da ampliação.' },
  'M02-D': { text: 'Voltar ao essencial antes de qualquer decisão. O caminho começa quando o ruído diminui.' },
  'M03-A': { text: 'Tudo está conectado. Nada existe isolado.', hl: 'conectado.' },
  'M03-B': { text: 'Para compreender o todo, precisamos ver as camadas.', hl: 'camadas.' },
  'M03-C': { text: 'Toda transformação passa por três movimentos.', hl: 'transformação' },
  'M03-D': { text: 'As 6 dimensões sistêmicas da Bee.', hl: '6 dimensões' },
};

// O M04 é convite (dados reais do evento) — a matriz mostra com um exemplo.
const M04_SAMPLE: EventBrief = {
  kicker: 'MASTERCLASS', title: 'Liderar uma oitava acima.', highlight: 'oitava',
  subtitle: 'Uma nova consciência para liderar no mundo que está emergindo.',
  idea: 'O mundo mudou. A forma de liderar, não.', idea_highlight: 'não.',
  idea_support: 'Enquanto tentamos liderar com as mesmas respostas, os problemas só mudam de lugar.',
  date: '24 OUT', location: 'Rio Preto', time: '20H', format: 'Online — Ao vivo',
  author: 'Marcos Piccini', cta: 'INSCREVA-SE AGORA', vagas_limitadas: true,
};

export function HiveMatrix() {
  const [manis, setManis] = useState<Manifestacao[]>([]);
  const [frozen, setFrozen] = useState<Array<{ id: string; nome: string; mani: string }>>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: mData }, design, marcos] = await Promise.all([
          supabase.from('design_manifestacoes').select('id,nome,operacao,ativo,ordem').order('ordem', { ascending: true }),
          loadHiveDesign(),
          listMarcosPhotos().catch(() => []),
        ]);
        setManis((mData ?? []) as Manifestacao[]);
        setFrozen(design.variacoes.map((v) => ({ id: v.id, nome: v.nome, mani: v.manifestacao_id ?? 'M01' })));

        // Uma foto real do Marcos (se houver) pra ilustrar as variações M02.
        const mAsset: M02Asset | null = marcos[0]
          ? { url: marcos[0].url, espaco_texto: (marcos[0].semantic?.espaco_texto as string) ?? 'baixo', origin: 'real' }
          : null;

        const out: Record<string, string> = {};
        await Promise.all(
          design.variacoes.map(async (recipe) => {
            const s = SAMPLES[recipe.id] ?? { text: 'Uma ideia. Muito silêncio.' };
            const allowHl = Boolean(recipe.limites?.destaque_permitido) && s.hl;
            const highlight = allowHl ? { target: s.hl! } : null;
            // no preview da matriz, cada variação usa o espaço sugerido pela prancha
            // (mesmo sem foto — senão tudo cai no rodapé). Texto escuro (Campo) só
            // quando há foto clara; sem foto (fundo navy) força texto claro.
            const zoneByVar: Record<string, string> = { 'M02-A': 'esquerda', 'M02-B': 'baixo', 'M02-C': 'topo', 'M02-D': 'baixo' };
            const corByVar: Record<string, string> = { 'M02-C': 'escuro' };
            const varAsset = recipe.manifestacao_id === 'M02'
              ? { url: mAsset?.url ?? '', width: mAsset?.width, height: mAsset?.height, espaco_texto: zoneByVar[recipe.id] ?? 'baixo', texto_cor: mAsset ? (corByVar[recipe.id] ?? 'claro') : 'claro' }
              : null;
            const slide = recipe.manifestacao_id === 'M04'
              ? composeM04({ recipe, colors: design.colors, spiralUrl: design.spiralUrl, canvas: { w: 1080, h: 1350 }, event: M04_SAMPLE, asset: recipe.id === 'M04-C' ? null : mAsset })
              : recipe.manifestacao_id === 'M03'
              ? composeM03({ recipe, colors: design.colors, spiralUrl: design.spiralUrl, text: s.text, highlight, canvas: { w: 1080, h: 1350 }, diagram: null })
              : recipe.manifestacao_id === 'M02'
              ? composeM02({ recipe, colors: design.colors, spiralUrl: design.spiralUrl, text: s.text, subtitle: s.sub ?? null, highlight, canvas: { w: 1080, h: 1350 }, asset: varAsset })
              : composeM01({ recipe, colors: design.colors, spiralUrl: design.spiralUrl, assets: design.assets, text: s.text, highlight, canvas: { w: 1080, h: 1350 } });
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

  const frozenManis = Array.from(new Set(frozen.map((v) => v.mani)));

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
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/hive/convite">Gerar convite (M04)</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hive/marcos">Fotos do Marcos (M02)</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hive/assets">Biblioteca de imagens</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hive/preview">Abrir prévia</Link></Button>
        </div>
      </header>

      {loading && (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}

      {/* Manifestações congeladas (M01, M02): variações renderizadas */}
      {!loading && frozenManis.map((mid) => {
        const mani = manis.find((m) => m.id === mid);
        const vars = frozen.filter((v) => v.mani === mid);
        return (
          <div key={mid} className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge className="bg-accent text-accent-foreground">{mid}</Badge>
              <span className="font-semibold">{mani?.nome ?? mid}</span>
              <Badge variant="secondary" className="text-[10px]">v1.0 · congelada</Badge>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
              {vars.map((v) => (
                <div key={v.id} className="space-y-1.5">
                  <div className="overflow-hidden rounded-md border border-border bg-muted/30" style={{ aspectRatio: '4 / 5' }}>
                    {thumbs[v.id]
                      ? <img src={thumbs[v.id]} alt={v.id} className="h-full w-full object-contain" />
                      : <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">—</div>}
                  </div>
                  <p className="text-xs"><b>{v.id.replace(/^M0\d-/, '')}</b> · {v.nome}</p>
                </div>
              ))}
            </div>
            {mid === 'M02' && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                A M02 usa <b>foto real do Marcos primeiro</b> (suba em “Fotos do Marcos”); Campo e Diário podem gerar a cena quando não houver foto. Presença e Em Relação exigem foto real — não se fabrica o rosto.
              </p>
            )}
            {mid === 'M04' && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                O M04 é convite pra um evento <b>real</b> — dados (data, hora, CTA…) vêm de você, não da IA. Monte em <Link to="/hive/convite" className="underline">Gerar convite</Link>. Fora da decisão automática do motor.
              </p>
            )}
          </div>
        );
      })}

      {/* Manifestações ainda em construção */}
      {!loading && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {manis.filter((m) => !frozenManis.includes(m.id)).map((m) => (
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
      )}
    </section>
  );
}
