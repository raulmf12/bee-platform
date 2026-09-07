// ⚠️ PÁGINA DE TESTE TEMPORÁRIA — refino de DESIGN do M02. APAGAR depois.
// Rota: /hive/teste-m02. Puxa conteúdos JÁ APROVADOS + sorteia foto do Marcos
// sozinho. Foco: iterar o design do composeM02 (variação, posição, real vs cena
// IA). A cena IA (Nano Banana) fica CACHEADA por conteúdo/foto/posição — não
// regenera (nem gasta) a cada ajuste de layout.
// Pra remover: apague este arquivo + a import/rota em App.tsx + a func nano-scene.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Shuffle, ImageIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CanvasStudio } from '@/components/editor/canvas-studio/CanvasStudio';
import { loadHiveDesign, type DesignData } from '@/lib/hive/loadDesign';
import { composeM02 } from '@/lib/hive/composeM02';
import { listMarcosPhotos, imageDims, type MarcosPhotoRow } from '@/lib/hive/assetLib';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Content { quote: string; subtitle: string; highlight: string; codigo?: string }

const SCENE_ZONE: Record<string, string> = {
  esquerda: 'o homem À DIREITA do quadro; toda a METADE ESQUERDA vazia e escura (fundo liso), reservada pra texto',
  direita: 'o homem À ESQUERDA do quadro; toda a METADE DIREITA vazia e escura (fundo liso), reservada pra texto',
  baixo: 'o homem na METADE DE CIMA; a parte de BAIXO vazia e escura (fundo liso), reservada pra texto',
  topo: 'o homem na parte de BAIXO; o TOPO amplo e limpo (parede/céu), reservado pra texto',
  centro: 'o homem descentralizado; borda ampla e limpa (fundo liso) ao redor, reservada pra texto',
};

// Prancha OFICIAL (referência de ESTILO/composição por variação). O Nano Banana
// copia enquadramento, paleta e clima destes exemplares — mas o ROSTO vem das
// fotos reais do Marcos, nunca da prancha.
const PRANCHA_TILE: Record<string, string> = {
  'M02-A': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-A.jpg`,
  'M02-B': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-B.jpg`,
  'M02-C': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-C.jpg`,
  'M02-D': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-D.jpg`,
};

async function urlToB64(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
    fr.readAsDataURL(blob);
  });
}

// Palpite de destaque (a "virada"): últimas ~2 palavras da frase. Editável.
function guessHighlight(q: string): string {
  const clean = q.trim().replace(/["“”]/g, '');
  const sents = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const last = (sents[sents.length - 1] || clean).replace(/[.!?…]+$/, '').trim();
  const w = last.split(/\s+/);
  return w.slice(-Math.min(2, w.length)).join(' ');
}

export function HiveTesteM02() {
  const [design, setDesign] = useState<DesignData | null>(null);
  const [photos, setPhotos] = useState<MarcosPhotoRow[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [ci, setCi] = useState(0);
  const [pi, setPi] = useState(0);
  const [variant, setVariant] = useState('M02-A');
  const [place, setPlace] = useState('esquerda');
  const [source, setSource] = useState<'real' | 'ia'>('real');
  const [busy, setBusy] = useState(false);

  const [fabric, setFabric] = useState<object | undefined>(undefined);
  const [renderKey, setRenderKey] = useState(0);
  const sceneCache = useRef<Map<string, string>>(new Map()); // key -> dataUrl

  // editáveis (prefill automático)
  const [hl, setHl] = useState('');
  const [sub, setSub] = useState('');

  useEffect(() => {
    void loadHiveDesign().then(setDesign).catch((e) => toast.error(`Design: ${(e as Error).message}`));
    void listMarcosPhotos().then(setPhotos).catch(() => {});
    // conteúdos aprovados
    void (async () => {
      const { data, error } = await supabase
        .from('user_posts')
        .select('carousel_text,caption,codigo,status')
        .in('status', ['approved', 'scheduled', 'published'])
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) { toast.error(error.message); return; }
      const list: Content[] = [];
      for (const p of data ?? []) {
        const ct = (p.carousel_text ?? {}) as Record<string, unknown>;
        const quote = String(ct.quote ?? '').trim();
        if (quote.length < 20) continue;
        const cap = String(p.caption ?? ct.caption ?? '').trim();
        const firstSent = cap.split(/(?<=[.!?…])\s+/)[0] ?? '';
        list.push({
          quote,
          subtitle: firstSent && firstSent.length <= 64 ? firstSent : '',
          highlight: guessHighlight(quote),
          codigo: (p.codigo as string) ?? undefined,
        });
      }
      setContents(list);
    })();
  }, []);

  const m02Variants = useMemo(
    () => (design?.variacoes ?? []).filter((v) => v.manifestacao_id === 'M02'),
    [design],
  );
  const content = contents[ci];
  const photo = photos[pi];

  // Prefill destaque/subtítulo quando muda o conteúdo.
  useEffect(() => {
    if (!content) return;
    setHl(content.highlight);
    setSub(content.subtitle);
  }, [ci, content]);

  function sortear() {
    if (contents.length) setCi(Math.floor(Math.random() * contents.length));
    if (photos.length) setPi(Math.floor(Math.random() * photos.length));
  }

  async function render() {
    if (!design || !content) { toast.error('Carregando dados…'); return; }
    if (!photo) { toast.error('Sem foto do Marcos.'); return; }
    const recipe = m02Variants.find((v) => v.id === variant) ?? m02Variants[0];
    if (!recipe) { toast.error('Sem receita M02.'); return; }
    const sem = (photo.semantic ?? {}) as Record<string, unknown>;
    setBusy(true);
    try {
      let asset;
      if (source === 'ia') {
        const key = `${ci}|${photo.id}|${variant}|${place}`;
        let sceneUrl = sceneCache.current.get(key);
        if (!sceneUrl) {
          const tileUrl = PRANCHA_TILE[variant];
          const prompt = [
            'Gere UMA fotografia editorial de retrato (4:5 vertical). Você recebe referências com DOIS papéis diferentes:',
            '• A 1ª imagem é a PRANCHA OFICIAL de estilo: copie dela o ENQUADRAMENTO, a COMPOSIÇÃO, a PALETA, a luz e o clima — e principalmente o ESPAÇO NEGATIVO reservado pra texto. IGNORE COMPLETAMENTE o rosto/identidade da pessoa que aparece nela; ela serve só de guia visual.',
            '• As imagens SEGUINTES são o HOMEM REAL a ser retratado. PRESERVE EXATAMENTE a aparência dele: mesmo rosto, mesmos traços, mesmo cabelo curto castanho, mesma barba curta, mesma meia-idade. NÃO rejuvenesça, NÃO idealize, NÃO troque a roupa por terno/blazer — mantenha camisa clara/social como nas fotos dele.',
            `Recrie a cena no estilo da prancha, com esta composição: ${SCENE_ZONE[place] ?? SCENE_ZONE.esquerda}.`,
            'A área reservada deve ficar limpa e uniforme (fundo liso), com espaço de sobra pro texto ser depositado depois.',
            'Paleta sóbria: off-white, azul profundo, preto e cinza. Atmosfera silenciosa, editorial, sem estética de banco de imagens.',
            'NÃO escreva NENHUM texto/letra/número/logo na imagem — só a cena fotográfica.',
          ].join(' ');
          // 1ª ref = prancha (estilo) · demais = Marcos real (identidade). Até 4.
          const marcosRefs = [photo, ...photos.filter((p) => p.id !== photo.id)].slice(0, 3);
          const refPool = tileUrl ? [{ url: tileUrl }, ...marcosRefs] : marcosRefs;
          const references = await Promise.all(refPool.map((p) => urlToB64(p.url)));
          const { data } = await supabase.auth.getSession();
          const res = await fetch(`${SUPABASE_URL}/functions/v1/nano-scene`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, references, ref_mime: 'image/jpeg' }),
          });
          const txt = await res.text();
          if (!res.ok) throw new Error(`nano-scene ${res.status}: ${txt.slice(0, 160)}`);
          const out = JSON.parse(txt) as { image_base64: string; mime_type: string };
          sceneUrl = `data:${out.mime_type};base64,${out.image_base64}`;
          sceneCache.current.set(key, sceneUrl);
        }
        const dims = await imageDims(sceneUrl);
        asset = { url: sceneUrl, width: dims.w, height: dims.h, espaco_texto: place, texto_cor: 'claro', origin: 'real_adapted', preComposed: true };
      } else {
        const dims = await imageDims(photo.url);
        asset = {
          url: photo.url, width: dims.w, height: dims.h, espaco_texto: place,
          texto_cor: (sem.texto_cor as string) ?? 'claro', origin: 'real',
        };
      }
      const fabricJson = composeM02({
        recipe, colors: design.colors, spiralUrl: design.spiralUrl,
        text: content.quote, subtitle: sub.trim() || null,
        highlight: hl.trim() ? { target: hl.trim() } : null,
        canvas: { w: 1080, h: 1350 }, asset,
      });
      setFabric(fabricJson);
      setRenderKey((k) => k + 1);
    } catch (e) {
      toast.error(`Falhou: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const ready = Boolean(design && content && photo);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">🧪 Refino do M02 — Rosto + Pensamento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contents.length} conteúdo(s) aprovado(s) · {photos.length} foto(s) do Marcos. Sorteio automático — foco no design.
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
                <label className="text-[11px] text-muted-foreground">frase secundária (opcional)</label>
                <input value={sub} onChange={(e) => setSub(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs" />
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-border p-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">VARIAÇÃO</div>
              <div className="flex flex-wrap gap-1.5">
                {m02Variants.map((v) => (
                  <button key={v.id} onClick={() => setVariant(v.id)}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${variant === v.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}>
                    {v.id.replace('M02-', '')} · {v.nome}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">POSIÇÃO DO TEXTO</div>
              <div className="flex flex-wrap gap-1.5">
                {(['esquerda', 'direita', 'baixo', 'topo', 'centro'] as const).map((z) => (
                  <button key={z} onClick={() => setPlace(z)}
                    className={`rounded-lg border px-2.5 py-1 text-xs capitalize ${place === z ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}>
                    {z}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">MATÉRIA</div>
              <div className="flex gap-1.5">
                <button onClick={() => setSource('real')} className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${source === 'real' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}>
                  <ImageIcon className="h-3.5 w-3.5" /> Foto real (instantâneo)
                </button>
                <button onClick={() => setSource('ia')} className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${source === 'ia' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}>
                  <Sparkles className="h-3.5 w-3.5" /> Cena IA (cacheada)
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="accent" onClick={() => void render()} disabled={busy || !ready}>
                {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {source === 'ia' ? 'Gerando cena…' : 'Compondo…'}</> : 'Renderizar'}
              </Button>
              <span className="text-[11px] text-muted-foreground">foto: {photo?.title ?? '—'}</span>
            </div>
          </section>
          <p className="text-[11px] text-muted-foreground">
            Dica: refino de layout é no <code>composeM02.ts</code> — salvar recarrega sozinho. Na cena IA, mudar variação/posição/destaque não regenera (cache por conteúdo+foto+posição).
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
