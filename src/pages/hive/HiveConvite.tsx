// Gerador de CONVITE (Hive M04 · Convite / Jornada). Diferente dos outros modos,
// o M04 depende de DADOS REAIS do evento — então aqui o usuário os preenche e a
// Hive monta a variação escolhida (A · Convite Essencial, B · Ideia → Convite,
// C · Jornada). Nada é inventado. Prévia ao vivo + salvar como post. Rota: /hive/convite

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { edge } from '@/lib/edge';
import { postApi } from '@/lib/api';
import type { UserPost } from '@/types';
import { uploadAssetImage } from '@/lib/storage';
import { loadHiveDesign, type DesignData } from '@/lib/hive/loadDesign';
import { composeM04, type EventBrief, type EventStep } from '@/lib/hive/composeM04';
import { renderFabricToDataUrl } from '@/lib/templates/renderPost';
import { blobFromBase64, imageDims, uploadDesignAsset, saveDesignAsset } from '@/lib/hive/assetLib';
import { toast } from 'sonner';

type VarId = 'M04-A' | 'M04-B' | 'M04-C';
const VARIANTS: Array<{ id: VarId; nome: string; hint: string }> = [
  { id: 'M04-A', nome: 'Convite Essencial', hint: 'Produto é protagonista' },
  { id: 'M04-B', nome: 'Ideia → Convite', hint: 'A reflexão abre caminho' },
  { id: 'M04-C', nome: 'Jornada', hint: 'Mostra o caminho maior' },
];

const DEFAULT_EVENT: EventBrief = {
  kicker: 'MASTERCLASS',
  title: 'Liderar uma oitava acima.',
  highlight: 'oitava',
  subtitle: 'Uma nova consciência para liderar no mundo que está emergindo.',
  idea: 'O mundo mudou. A forma de liderar, não.',
  idea_highlight: 'não.',
  idea_support: 'Enquanto tentamos liderar com as mesmas respostas, os problemas só mudam de lugar. É hora de ver o que antes não era visível.',
  date: '24 OUT', location: 'São José do Rio Preto', time: '20H', format: 'Online — Ao vivo',
  author: 'Marcos Piccini', cta: 'INSCREVA-SE AGORA', vagas_limitadas: true,
};

export function HiveConvite() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const navigate = useNavigate();
  const [design, setDesign] = useState<DesignData | null>(null);
  const [variant, setVariant] = useState<VarId>('M04-A');
  const [event, setEvent] = useState<EventBrief>(DEFAULT_EVENT);
  const [asset, setAsset] = useState<{ url: string; width?: number | null; height?: number | null } | null>(null);
  const [photos, setPhotos] = useState<Array<{ url: string; width: number | null; height: number | null; title: string }>>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<number | null>(null);

  // Carrega design + biblioteca de fotos, e pré-preenche as etapas da Jornada.
  useEffect(() => {
    loadHiveDesign().then((d) => {
      setDesign(d);
      const c = d.variacoes.find((v) => v.id === 'M04-C');
      const scaffold = (c?.layer_stack as Array<{ role: string; source?: Record<string, unknown> }> | undefined)
        ?.find((l) => l.role === 'invite')?.source?.data as { steps?: EventStep[]; closing_title?: string; closing_desc?: string } | undefined;
      if (scaffold?.steps) {
        setEvent((e) => ({ ...e, steps: e.steps ?? scaffold.steps, closing_title: e.closing_title ?? scaffold.closing_title, closing_desc: e.closing_desc ?? scaffold.closing_desc }));
      }
    }).catch((e) => toast.error(String(e?.message ?? e)));
    supabase.from('design_assets').select('url,width,height,title').eq('kind', 'photo').eq('is_active', true).limit(24)
      .then(({ data }) => setPhotos((data ?? []) as typeof photos));
  }, []);

  const recipe = useMemo(() => design?.variacoes.find((v) => v.id === variant), [design, variant]);

  // Prévia ao vivo (debounced).
  useEffect(() => {
    if (!design || !recipe) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setRendering(true);
      try {
        const slide = composeM04({ recipe, colors: design.colors, spiralUrl: design.spiralUrl, canvas: { w: 1080, h: 1350 }, event, asset });
        const url = await renderFabricToDataUrl(slide, { width: 1080, height: 1350, multiplier: 0.42 });
        setPreview(url);
      } catch (e) {
        console.error('[HiveConvite preview]', e);
      } finally {
        setRendering(false);
      }
    }, 320);
    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [design, recipe, event, asset, variant]);

  const set = (patch: Partial<EventBrief>) => setEvent((e) => ({ ...e, ...patch }));
  const setStep = (i: number, patch: Partial<EventStep>) => setEvent((e) => {
    const steps = [...(e.steps ?? [])]; steps[i] = { ...steps[i], ...patch };
    if (patch.focal) steps.forEach((s, j) => { if (j !== i) s.focal = false; });
    return { ...e, steps };
  });

  async function gerarFundo() {
    if (!recipe) return;
    const req = (recipe.layer_stack as Array<{ role: string; source?: Record<string, unknown> }>)
      .find((l) => l.role === 'invite');
    void req;
    const prompt = 'Fotografia atmosférica com profundidade, propósito e movimento (lago ao amanhecer, cais, cadeira, paisagem contemplativa), luz natural, cinematográfica, muito espaço negativo. Sem texto, sem logo, sem pessoas olhando para a câmera.';
    setGenBusy(true);
    try {
      const res = await edge.generateImage({ prompt, aspect_ratio: '3:4', style_hint: 'Marcos Piccini / Bee — sóbrio, profundo, significativo' });
      if (!res.success || !res.image_base64) throw new Error('A IA não retornou imagem.');
      const dataUrl = `data:${res.mime_type || 'image/png'};base64,${res.image_base64}`;
      const dims = await imageDims(dataUrl);
      // sobe na biblioteca (design) pra reuso + CORS ok no render
      const blob = blobFromBase64(dataUrl.split(',')[1], res.mime_type || 'image/png');
      const { path, publicUrl } = await uploadDesignAsset(blob);
      await saveDesignAsset({ kind: 'photo', title: 'M04 fundo — gerada', url: publicUrl, storage_path: path, mime_type: res.mime_type || 'image/png', width: dims.w, height: dims.h, origin: 'generated', semantic: { profundidade: 'alta', m04: true }, tags: ['m04', 'gerada'] });
      setAsset({ url: publicUrl, width: dims.w, height: dims.h });
      setPhotos((p) => [{ url: publicUrl, width: dims.w, height: dims.h, title: 'M04 fundo — gerada' }, ...p]);
      toast.success('Fundo gerado.');
    } catch (e) {
      toast.error(`Erro ao gerar: ${(e as Error).message}`);
    } finally {
      setGenBusy(false);
    }
  }

  async function salvar() {
    if (!design || !recipe || !currentUser) return;
    setSaving(true);
    try {
      const post = await postApi.create({
        title: event.title, platform: 'instagram', format: 'image',
        caption: event.subtitle ?? '', status: 'draft',
        metadata: { hive: 'M04', variant },
      });
      const slide = composeM04({ recipe, colors: design.colors, spiralUrl: design.spiralUrl, canvas: { w: 1080, h: 1350 }, event, asset });
      const dataUrl = await renderFabricToDataUrl(slide, { width: 1080, height: 1350, format: 'jpeg' });
      if (!dataUrl) throw new Error('Falha ao renderizar.');
      const { publicUrl } = await uploadAssetImage({ userId: currentUser.id, assetId: post.id, dataUrl, filename: 'hive-m04.png' });
      await postApi.update(post.id, {
        carousel_fabric_json: [slide],
        rendered_slides: { slide1: publicUrl },
        visual_decision: { mode: 'M04', variant, editorial_locked: true },
        image_status: 'pending',
      } as unknown as Partial<UserPost>);
      toast.success('Convite salvo como post.');
      navigate(`/posts/${post.id}`);
    } catch (e) {
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const needsPhoto = variant !== 'M04-C';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-accent" /> Hive · Convite (M04)
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Transformar interesse em movimento. Preencha os dados reais do evento — a Hive monta o convite. <b>Nada de urgência ou promessa inventada.</b>
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/hive/marcos">Fotos do Marcos</Link></Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {VARIANTS.map((v) => (
          <button key={v.id} onClick={() => setVariant(v.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${variant === v.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-secondary/40'}`}>
            <div className="flex items-center gap-2"><Badge variant={variant === v.id ? 'default' : 'outline'} className="text-[10px]">{v.id.replace('M04-', '')}</Badge><b>{v.nome}</b></div>
            <div className="text-xs text-muted-foreground">{v.hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(300px,380px)]">
        {/* Formulário */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold">Experiência</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kicker (tipo)"><Input value={event.kicker ?? ''} onChange={(e) => set({ kicker: e.target.value })} /></Field>
              <Field label="Destaque no título (laranja)"><Input value={event.highlight ?? ''} onChange={(e) => set({ highlight: e.target.value })} /></Field>
            </div>
            <Field label="Título / benefício (Playfair)"><Input value={event.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Subtítulo"><Input value={event.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
          </section>

          {variant === 'M04-B' && (
            <section className="space-y-3 rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold">Ideia que abre o convite</h2>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Field label="Ideia / tensão (Playfair)"><Input value={event.idea ?? ''} onChange={(e) => set({ idea: e.target.value })} /></Field>
                <Field label="Destaque"><Input className="w-28" value={event.idea_highlight ?? ''} onChange={(e) => set({ idea_highlight: e.target.value })} /></Field>
              </div>
              <Field label="Desenvolvimento curto"><Input value={event.idea_support ?? ''} onChange={(e) => set({ idea_support: e.target.value })} /></Field>
            </section>
          )}

          {variant !== 'M04-C' && (
            <section className="space-y-3 rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold">Informações objetivas</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data"><Input value={event.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
                <Field label="Local"><Input value={event.location ?? ''} onChange={(e) => set({ location: e.target.value })} /></Field>
                <Field label="Hora"><Input value={event.time ?? ''} onChange={(e) => set({ time: e.target.value })} /></Field>
                <Field label="Formato"><Input value={event.format ?? ''} onChange={(e) => set({ format: e.target.value })} /></Field>
                <Field label="Autor / facilitador"><Input value={event.author ?? ''} onChange={(e) => set({ author: e.target.value })} /></Field>
                <Field label="CTA"><Input value={event.cta ?? ''} onChange={(e) => set({ cta: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!event.vagas_limitadas} onChange={(e) => set({ vagas_limitadas: e.target.checked })} />
                Mostrar “vagas limitadas” (só se for verdade)
              </label>
            </section>
          )}

          {variant === 'M04-C' && (
            <section className="space-y-3 rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold">Etapas da jornada</h2>
              {(event.steps ?? []).map((st, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr] gap-2 rounded-lg border border-border/60 p-2">
                  <button onClick={() => setStep(i, { focal: true })} title="Etapa em foco (laranja)"
                    className={`h-7 w-7 shrink-0 rounded-full text-xs font-bold ${st.focal ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>{st.n}</button>
                  <div className="grid gap-1.5">
                    <Input className="h-8" value={st.nome} onChange={(e) => setStep(i, { nome: e.target.value })} placeholder="Nome (ex: MASTERCLASS)" />
                    <Input className="h-8" value={st.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Título" />
                    <Input className="h-8" value={st.desc} onChange={(e) => setStep(i, { desc: e.target.value })} placeholder="Descrição curta" />
                  </div>
                </div>
              ))}
              <Field label="Fechamento — título"><Input value={event.closing_title ?? ''} onChange={(e) => set({ closing_title: e.target.value })} /></Field>
              <Field label="Fechamento — descrição"><Input value={event.closing_desc ?? ''} onChange={(e) => set({ closing_desc: e.target.value })} /></Field>
            </section>
          )}

          {needsPhoto && (
            <section className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Imagem de fundo</h2>
                <Button size="sm" variant="accent" onClick={() => void gerarFundo()} disabled={genBusy}>
                  {genBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />} Gerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Profundidade e significado — não foto genérica de evento.</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                {photos.map((p) => (
                  <button key={p.url} onClick={() => setAsset(p)} className={`overflow-hidden rounded border ${asset?.url === p.url ? 'border-accent ring-2 ring-accent/40' : 'border-border'}`}>
                    <img src={p.url} alt={p.title} className="aspect-[4/5] w-full object-cover" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Prévia */}
        <div className="space-y-3">
          <div className="sticky top-4 space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30" style={{ aspectRatio: '4 / 5' }}>
              {preview
                ? <img src={preview} alt="prévia" className="h-full w-full object-contain" />
                : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">montando…</div>}
              {rendering && <div className="absolute right-2 top-2"><Loader2 className="h-4 w-4 animate-spin text-accent" /></div>}
            </div>
            <Button className="w-full" variant="accent" onClick={() => void salvar()} disabled={saving || !preview}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar como post
            </Button>
            {needsPhoto && !asset && <p className="text-center text-xs text-muted-foreground">Escolha ou gere uma imagem de fundo.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
