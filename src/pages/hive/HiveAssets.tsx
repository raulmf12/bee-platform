// Curadoria de assets da Hive: gera fotos atmosféricas (D — Campo) e texturas
// (E — Matéria) com a IA de imagem (Nano Banana Pro), sem texto/logo, e salva na
// biblioteca (design_assets). O compositor passa a escolher entre estas.
// Rota: /hive/assets

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImagePlus, Loader2, Trash2, Wand2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { edge } from '@/lib/edge';
import {
  blobFromBase64, imageDims, uploadDesignAsset, saveDesignAsset,
  listDesignAssets, deleteDesignAsset, setAssetActive, type DesignAssetRow,
} from '@/lib/hive/assetLib';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const SUGESTOES: Record<'photo' | 'texture', string[]> = {
  photo: [
    'floresta enevoada ao amanhecer', 'horizonte sobre o mar calmo', 'caminho na neblina',
    'vale entre montanhas ao entardecer', 'céu vasto com nuvens', 'arquitetura minimalista silenciosa',
    'superfície de um lago parado', 'campo aberto e dourado', 'floresta densa vista de cima',
  ],
  texture: [
    'sombra de folhas em parede clara', 'papel artesanal de fibra', 'linho natural amassado',
    'superfície mineral suave', 'reboco branco com textura',
  ],
};

export function HiveAssets() {
  const [kind, setKind] = useState<'photo' | 'texture'>('photo');
  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState('');
  const [espaco, setEspaco] = useState<'baixo' | 'centro' | 'esquerda'>('baixo');
  const [preview, setPreview] = useState<{ dataUrl: string; mime: string; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lib, setLib] = useState<DesignAssetRow[]>([]);

  const load = () => listDesignAssets().then(setLib).catch((e) => console.error(e));
  useEffect(() => { void load(); }, []);

  async function gerar() {
    const tema = prompt.trim();
    if (!tema) { toast.error('Descreva a cena.'); return; }
    setBusy(true); setPreview(null);
    try {
      const wrapped = kind === 'photo'
        ? `Fotografia atmosférica e contemplativa: ${tema}. Fotorrealista, cinematográfica, cores dessaturadas, profundidade real, névoa suave, muito espaço negativo e calmo. SEM texto, SEM logotipo, SEM marca d'água, SEM legendas, SEM pessoas olhando para a câmera. Composição vertical, uma área tranquila embaixo para receber texto depois.`
        : `Textura orgânica e sutil: ${tema}. Discreta, baixo contraste, elegante, natural, luz suave. SEM texto, SEM logotipo. Fundo predominantemente claro/creme.`;
      const res = await edge.generateImage({ prompt: wrapped, aspect_ratio: '3:4', style_hint: 'Marcos Piccini / Bee — sóbrio, silencioso, sistêmico' });
      if (!res.success || !res.image_base64) throw new Error('A IA não retornou imagem.');
      const dataUrl = `data:${res.mime_type || 'image/png'};base64,${res.image_base64}`;
      const dims = await imageDims(dataUrl);
      setPreview({ dataUrl, mime: res.mime_type || 'image/png', w: dims.w, h: dims.h });
    } catch (e) {
      toast.error(`Erro ao gerar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function salvar() {
    if (!preview) return;
    setSaving(true);
    try {
      const blob = blobFromBase64(preview.dataUrl.split(',')[1], preview.mime);
      const { path, publicUrl } = await uploadDesignAsset(blob);
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const semantic = kind === 'photo'
        ? { natureza: true, profundidade: true, silencio: true, espaco_texto: espaco }
        : { organico: true, sutil: true };
      await saveDesignAsset({
        kind, title: prompt.trim().slice(0, 80), url: publicUrl, storage_path: path,
        mime_type: preview.mime, width: preview.w, height: preview.h, origin: 'generated', semantic, tags: tagList,
      });
      toast.success('Salvo na biblioteca da Hive.');
      setPreview(null); setPrompt(''); setTags('');
      void load();
    } catch (e) {
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remover(a: DesignAssetRow) {
    if (!confirm(`Remover "${a.title}"?`)) return;
    try { await deleteDesignAsset(a.id, a.storage_path); void load(); }
    catch { toast.error('Erro ao remover.'); }
  }
  async function toggle(a: DesignAssetRow) {
    try { await setAssetActive(a.id, !a.is_active); void load(); }
    catch { toast.error('Erro ao alternar.'); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <ImagePlus className="h-6 w-6 text-accent" /> Hive · Biblioteca de imagens
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fotos atmosféricas (D — Campo) e texturas (E — Matéria) que a Hive escolhe. Gere aqui, sem texto/logo — a Hive compõe os elementos oficiais por cima.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/hive/preview">Abrir prévia</Link></Button>
      </header>

      {/* Gerar */}
      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(['photo', 'texture'] as const).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? 'accent' : 'outline'} onClick={() => { setKind(k); setPreview(null); }}>
              {k === 'photo' ? 'Foto (D · Campo)' : 'Textura (E · Matéria)'}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUGESTOES[kind].map((s) => (
            <button key={s} onClick={() => setPrompt(s)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary">
              {s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[300px] flex-1 space-y-1">
            <Label className="text-xs">Descreva a cena (sem texto/logo — a Hive cuida disso)</Label>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex: floresta enevoada ao amanhecer" />
          </div>
          <Button variant="accent" onClick={() => void gerar()} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
            Gerar
          </Button>
        </div>

        {preview && (
          <div className="flex flex-wrap gap-4 rounded-lg border border-border p-4">
            <img src={preview.dataUrl} alt="prévia" className="max-h-[46vh] w-auto rounded-md border border-border" />
            <div className="min-w-[220px] flex-1 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Tags (vírgula) — ajudam a Hive a escolher</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="floresta, névoa, silêncio" />
              </div>
              {kind === 'photo' && (
                <div className="space-y-1">
                  <Label className="text-xs">Espaço pro texto</Label>
                  <div className="flex gap-1.5">
                    {(['baixo', 'centro', 'esquerda'] as const).map((e) => (
                      <Button key={e} size="sm" variant={espaco === e ? 'accent' : 'outline'} onClick={() => setEspaco(e)}>{e}</Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="accent" onClick={() => void salvar()} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar na biblioteca
                </Button>
                <Button variant="outline" onClick={() => void gerar()} disabled={busy}>Gerar outra</Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Biblioteca */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Na biblioteca ({lib.length})</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {lib.map((a) => (
            <div key={a.id} className={cn('group relative overflow-hidden rounded-md border', a.is_active ? 'border-border' : 'border-dashed border-muted opacity-50')}>
              <img src={a.url} alt={a.title} className="aspect-[4/5] w-full object-cover" />
              <div className="absolute left-1 top-1 flex gap-1">
                <Badge variant="secondary" className="text-[9px]">{a.kind === 'photo' ? 'D' : 'E'}</Badge>
                {a.origin === 'generated' && <Badge variant="secondary" className="text-[9px]">gerado</Badge>}
              </div>
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => void toggle(a)} title={a.is_active ? 'Desativar' : 'Ativar'} className="rounded bg-black/60 p-1 text-white">
                  {a.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => void remover(a)} title="Remover" className="rounded bg-black/60 p-1 text-white">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground" title={a.title}>{a.title}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
