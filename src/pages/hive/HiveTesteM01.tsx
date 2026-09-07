// ⚠️ PÁGINA DE TESTE TEMPORÁRIA — refino de DESIGN do M01. APAGAR depois.
// Rota: /hive/teste-m01. Puxa conteúdos JÁ APROVADOS e deixa iterar as 5
// variações do M01 (A Essencial, B Tensão, C Editorial, D Campo, E Matéria).
// Foco nos FUNDOS DE IA (D/E): gerar/regenerar o fundo, ver o POSICIONAMENTO
// automático do texto (zona de espaço negativo + cor de contraste) e a peça.
// O fundo de IA fica em memória (não polui a biblioteca) — só o fluxo real salva.
// Pra remover: apague este arquivo + a import/rota em App.tsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Shuffle, ImageIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CanvasStudio } from '@/components/editor/canvas-studio/CanvasStudio';
import { loadHiveDesign, type DesignData } from '@/lib/hive/loadDesign';
import { composeM01, pickM01BgUrl, type DesignAsset } from '@/lib/hive/composeM01';
import { analyzeTextZone, clearZoneCache, type ZoneChoice } from '@/lib/hive/imageZone';
import { imageDims } from '@/lib/hive/assetLib';
import { edge } from '@/lib/edge';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Content { quote: string; highlight: string; codigo?: string }

// Prompts do fundo de IA — os MESMOS do fluxo real (ensureM01Asset).
const BG_PROMPT: Record<'photo' | 'texture', string> = {
  photo: 'Fotografia atmosférica e contemplativa com profundidade real, névoa suave, cores dessaturadas e muito espaço negativo (floresta ao amanhecer, horizonte, caminho na neblina, vale entre montanhas). Sem texto, sem logo, sem pessoas olhando para a câmera. Vertical.',
  texture: 'Textura orgânica sutil e elegante (sombra de folhas em parede clara, fibra de papel, superfície mineral), baixo contraste, luz suave, fundo predominantemente claro/creme. Sem texto, sem logo.',
};

// Palpite de destaque (a "virada"): últimas ~2 palavras da frase. Editável.
function guessHighlight(q: string): string {
  const clean = q.trim().replace(/["“”]/g, '');
  const sents = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const last = (sents[sents.length - 1] || clean).replace(/[.!?…]+$/, '').trim();
  const w = last.split(/\s+/);
  return w.slice(-Math.min(2, w.length)).join(' ');
}

function bgKindOf(variant: string): 'photo' | 'texture' | null {
  if (variant === 'M01-D') return 'photo';
  if (variant === 'M01-E') return 'texture';
  return null;
}

export function HiveTesteM01() {
  const [design, setDesign] = useState<DesignData | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [ci, setCi] = useState(0);
  const [variant, setVariant] = useState('M01-A');
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  const [fabric, setFabric] = useState<object | undefined>(undefined);
  const [renderKey, setRenderKey] = useState(0);
  const [zone, setZone] = useState<ZoneChoice | null>(null);
  // fundo de IA gerado por KIND (photo/texture), guardado em memória.
  const genBg = useRef<Record<'photo' | 'texture', DesignAsset | undefined>>({ photo: undefined, texture: undefined });

  const [hl, setHl] = useState('');

  useEffect(() => {
    void loadHiveDesign().then(setDesign).catch((e) => toast.error(`Design: ${(e as Error).message}`));
    void (async () => {
      const { data, error } = await supabase
        .from('user_posts')
        .select('carousel_text,codigo,status')
        .in('status', ['approved', 'scheduled', 'published'])
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) { toast.error(error.message); return; }
      const list: Content[] = [];
      for (const p of data ?? []) {
        const ct = (p.carousel_text ?? {}) as Record<string, unknown>;
        const quote = String(ct.quote ?? '').trim();
        if (quote.length < 20) continue;
        list.push({ quote, highlight: guessHighlight(quote), codigo: (p.codigo as string) ?? undefined });
      }
      setContents(list);
    })();
  }, []);

  const m01Variants = useMemo(
    () => (design?.variacoes ?? []).filter((v) => v.manifestacao_id === 'M01'),
    [design],
  );
  const content = contents[ci];
  const kind = bgKindOf(variant);

  useEffect(() => { if (content) setHl(content.highlight); }, [ci, content]);

  function sortear() {
    if (contents.length) setCi(Math.floor(Math.random() * contents.length));
  }

  // Gera um fundo de IA novo pro KIND da variação atual (D=foto, E=textura).
  async function gerarFundo() {
    if (!kind) { toast.error('Essa variação não usa fundo de IA (só D e E usam).'); return; }
    setGenBusy(true);
    try {
      const res = await edge.generateImage({
        prompt: BG_PROMPT[kind], aspect_ratio: '3:4',
        style_hint: 'Marcos Piccini / Bee — sóbrio, silencioso, sistêmico',
      });
      if (!res.success || !res.image_base64) throw new Error('IA não retornou imagem.');
      const dataUrl = `data:${res.mime_type || 'image/png'};base64,${res.image_base64}`;
      const dims = await imageDims(dataUrl);
      genBg.current[kind] = { url: dataUrl, width: dims.w, height: dims.h };
      clearZoneCache(dataUrl);
      toast.success('Fundo gerado — clique em Renderizar.');
    } catch (e) {
      toast.error(`Falha ao gerar fundo: ${(e as Error).message}`);
    } finally { setGenBusy(false); }
  }

  async function render() {
    if (!design || !content) { toast.error('Carregando dados…'); return; }
    const recipe = m01Variants.find((v) => v.id === variant) ?? m01Variants[0];
    if (!recipe) { toast.error('Sem receita M01.'); return; }
    setBusy(true);
    try {
      // D/E: usa o fundo de IA gerado (se houver) ou o da biblioteca; A/B/C: sem fundo.
      let assets = design.assets;
      const g = kind ? genBg.current[kind] : undefined;
      if (kind && g) {
        assets = kind === 'photo' ? { ...design.assets, photos: [g] } : { ...design.assets, textures: [g] };
      }
      const bgUrl = pickM01BgUrl(recipe, assets, content.quote);
      const layout = bgUrl ? await analyzeTextZone(bgUrl) : null;
      setZone(layout);
      const fabricJson = composeM01({
        recipe, colors: design.colors, spiralUrl: design.spiralUrl, assets,
        text: content.quote, highlight: hl.trim() ? { target: hl.trim() } : null,
        canvas: { w: 1080, h: 1350 }, layout,
      });
      setFabric(fabricJson);
      setRenderKey((k) => k + 1);
    } catch (e) {
      toast.error(`Falhou: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const ready = Boolean(design && content);
  const hasBg = kind ? Boolean(genBg.current[kind]) : true;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">🧪 Refino do M01 — Frase Essencial</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contents.length} conteúdo(s) aprovado(s). As 5 variações; D (Campo) e E (Matéria) usam fundo de IA + posicionamento automático do texto.
          </p>
        </div>
        <Button variant="accent" onClick={sortear} disabled={!ready}><Shuffle className="mr-1.5 h-4 w-4" /> Sortear</Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        {/* CONTROLES */}
        <div className="space-y-4">
          {content && (
            <section className="space-y-2 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Conteúdo {ci + 1}/{contents.length} {content.codigo ? `· ${content.codigo}` : ''}</span>
                <div className="flex gap-1">
                  <button className="rounded border border-border px-2 py-0.5 hover:bg-secondary/50" onClick={() => setCi((i) => (i - 1 + contents.length) % contents.length)}>‹</button>
                  <button className="rounded border border-border px-2 py-0.5 hover:bg-secondary/50" onClick={() => setCi((i) => (i + 1) % contents.length)}>›</button>
                </div>
              </div>
              <p className="text-sm font-medium">{content.quote}</p>
              <div className="grid gap-2 pt-1">
                <label className="text-[11px] text-muted-foreground">destaque (laranja)</label>
                <input value={hl} onChange={(e) => setHl(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs" />
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-border p-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">VARIAÇÃO</div>
              <div className="flex flex-wrap gap-1.5">
                {m01Variants.map((v) => (
                  <button key={v.id} onClick={() => setVariant(v.id)}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${variant === v.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}>
                    {v.id.replace('M01-', '')} · {v.nome}
                  </button>
                ))}
              </div>
            </div>

            {kind ? (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <Sparkles className="h-3.5 w-3.5" /> FUNDO DE IA ({kind === 'photo' ? 'Campo — foto' : 'Matéria — textura'})
                </div>
                <Button variant="outline" size="sm" onClick={() => void gerarFundo()} disabled={genBusy}>
                  {genBusy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Gerando…</> : hasBg ? 'Regenerar fundo' : 'Gerar fundo'}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {hasBg ? 'Fundo pronto em memória. O texto se posiciona sozinho na zona de espaço negativo ao renderizar.' : 'Gere o fundo primeiro (senão sai o placeholder navy).'}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" /> Variação tipográfica — sem fundo de IA. Posição fixa do template.
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button variant="accent" onClick={() => void render()} disabled={busy || !ready}>
                {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Compondo…</> : 'Renderizar'}
              </Button>
              {zone && (
                <span className="text-[11px] text-muted-foreground">
                  texto: <b>{zone.zone === 'top' ? 'topo' : 'base'}</b> · cor {zone.textColor}
                </span>
              )}
            </div>
          </section>
          <p className="text-[11px] text-muted-foreground">
            Dica: layout no <code>composeM01.ts</code>; heurística de posição no <code>imageZone.ts</code>. O fundo aqui fica em memória (não salva na biblioteca).
          </p>
        </div>

        {/* PREVIEW */}
        <div className="min-h-[600px] rounded-xl border border-border p-2">
          {fabric ? (
            <CanvasStudio key={renderKey} embedded initialPreset="instagram-portrait" initialFabricJson={fabric} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sorteie e clique em Renderizar.</div>
          )}
        </div>
      </div>
    </div>
  );
}
