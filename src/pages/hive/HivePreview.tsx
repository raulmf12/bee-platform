// Prévia do COMPOSITOR real da Hive (M01). Renderiza as 5 variações frozen a
// partir do banco (recipes + tokens) via o mesmo pipeline Fabric do app.
// Serve pra validar/calibrar o compositor contra a prancha aprovada.
// Rota: /hive/preview

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadM01Design, type DesignData } from '@/lib/hive/loadDesign';
import { composeM01 } from '@/lib/hive/composeM01';
import { renderFabricToDataUrl } from '@/lib/templates/renderPost';

const CANVAS = { w: 1080, h: 1350 };   // feed 4:5 (IG e LinkedIn)

export function HivePreview() {
  const [design, setDesign] = useState<DesignData | null>(null);
  const [text, setText] = useState('O que você não consegue explicar é justamente o que transforma.');
  const [highlight, setHighlight] = useState('transforma');
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadM01Design().then(setDesign).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const render = useCallback(async () => {
    if (!design) return;
    setBusy(true);
    try {
      const out: Record<string, string> = {};
      await Promise.all(
        design.variacoes.map(async (recipe) => {
          const allowHl = Boolean(recipe.limites?.destaque_permitido) && highlight.trim();
          const slide = composeM01({
            recipe,
            colors: design.colors,
            spiralUrl: design.spiralUrl,
            assets: design.assets,
            text: text.trim() || 'Sua frase aqui',
            highlight: allowHl ? { target: highlight.trim() } : null,
            canvas: CANVAS,
          });
          const url = await renderFabricToDataUrl(slide, { width: CANVAS.w, height: CANVAS.h, multiplier: 0.42 });
          if (url) out[recipe.id] = url;
        }),
      );
      setImgs(out);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [design, text, highlight]);

  useEffect(() => { void render(); /* render inicial ao carregar o design */ }, [design]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Wand2 className="h-6 w-6 text-accent" /> Hive · Compositor M01 — prévia
        </h1>
        <p className="text-sm text-muted-foreground">
          As 5 variações renderizadas pelo compositor real, a partir das receitas e tokens do banco. Feed 1080×1350 (serve Instagram e LinkedIn).
        </p>
      </header>

      {err && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <div className="min-w-[280px] flex-1 space-y-1">
          <Label className="text-xs">Frase (texto aprovado — o compositor não altera)</Label>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite a frase…" />
        </div>
        <div className="w-48 space-y-1">
          <Label className="text-xs">Destaque (laranja)</Label>
          <Input value={highlight} onChange={(e) => setHighlight(e.target.value)} placeholder="palavra da virada" />
        </div>
        <Button variant="accent" onClick={() => void render()} disabled={busy || !design}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
          Renderizar
        </Button>
      </div>

      {!design ? (
        <p className="text-sm text-muted-foreground">Carregando receitas…</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
          {design.variacoes.map((v) => (
            <div key={v.id} className="space-y-2">
              <div className="overflow-hidden rounded-md border border-border bg-muted/30" style={{ aspectRatio: '4 / 5' }}>
                {imgs[v.id]
                  ? <img src={imgs[v.id]} alt={v.id} className="h-full w-full object-contain" />
                  : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{busy ? 'renderizando…' : '—'}</div>}
              </div>
              <p className="text-sm"><b>{v.id}</b> · {v.nome}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
