// Biblioteca de FOTOS REAIS do Marcos — o topo da hierarquia de imagem da M02
// (Rosto + Pensamento). O usuário sobe as fotos que já existem e as tagueia com o
// vocabulário semântico que o motor da Hive lê pra ESCOLHER (não sortear): quem
// aparece, se está reconhecível, onde há espaço pro texto, tipo de registro, etc.
// A geração de imagem só entra quando NÃO houver foto real adequada. Rota: /hive/marcos

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Loader2, Trash2, Upload, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  imageDims, uploadDesignAsset, saveMarcosPhoto,
  listMarcosPhotos, deleteDesignAsset, setAssetActive, type MarcosPhotoRow,
} from '@/lib/hive/assetLib';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Vocabulário semântico (valores casam com os must_have das variações M02).
const DIMS: Array<{ key: string; label: string; opts: string[] }> = [
  { key: 'marcos_presente', label: 'Marcos presente', opts: ['sim', 'nao'] },
  { key: 'marcos_reconhecivel', label: 'Reconhecível', opts: ['sim', 'parcial', 'nao'] },
  { key: 'espaco_texto', label: 'Espaço pro texto', opts: ['baixo', 'topo', 'esquerda', 'direita', 'centro'] },
  { key: 'texto_cor', label: 'Cor do texto (luz da foto)', opts: ['claro', 'escuro'] },
  { key: 'tipo_registro', label: 'Tipo de registro', opts: ['retrato', 'interacao', 'ambiente', 'cotidiano', 'anotacao'] },
  { key: 'contexto_narrativo', label: 'Contexto narrativo', opts: ['baixo', 'medio', 'alto'] },
  { key: 'relacao_narrativa', label: 'Relação narrativa', opts: ['baixa', 'media', 'alta'] },
  { key: 'espontaneidade', label: 'Espontaneidade', opts: ['baixa', 'media', 'alta'] },
  { key: 'profundidade', label: 'Profundidade', opts: ['baixa', 'media', 'alta'] },
  { key: 'intimidade', label: 'Intimidade', opts: ['baixa', 'media', 'alta'] },
];

// Presets que preenchem tags coerentes com cada variação da M02.
const PRESETS: Record<string, { label: string; tags: Record<string, string> }> = {
  A: { label: 'A · Presença', tags: { marcos_presente: 'sim', marcos_reconhecivel: 'sim', tipo_registro: 'retrato', contexto_narrativo: 'baixo', espaco_texto: 'esquerda', texto_cor: 'claro' } },
  B: { label: 'B · Em Relação', tags: { marcos_presente: 'sim', marcos_reconhecivel: 'sim', tipo_registro: 'interacao', relacao_narrativa: 'alta', espontaneidade: 'alta', espaco_texto: 'baixo', texto_cor: 'claro' } },
  C: { label: 'C · Campo', tags: { marcos_presente: 'sim', marcos_reconhecivel: 'parcial', tipo_registro: 'ambiente', contexto_narrativo: 'alto', profundidade: 'alta', espaco_texto: 'topo', texto_cor: 'escuro' } },
  D: { label: 'D · Diário', tags: { marcos_presente: 'nao', tipo_registro: 'cotidiano', espontaneidade: 'alta', intimidade: 'alta', espaco_texto: 'baixo', texto_cor: 'claro' } },
};

const DEFAULT_SEM: Record<string, string> = { marcos_presente: 'sim', marcos_reconhecivel: 'sim', espaco_texto: 'baixo', texto_cor: 'claro', tipo_registro: 'retrato' };

export function HiveMarcos() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ blob: Blob; dataUrl: string; w: number; h: number; name: string } | null>(null);
  const [sem, setSem] = useState<Record<string, string>>(DEFAULT_SEM);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [lib, setLib] = useState<MarcosPhotoRow[]>([]);

  const load = () => listMarcosPhotos().then(setLib).catch((e) => console.error(e));
  useEffect(() => { void load(); }, []);

  async function onPick(f: File | undefined) {
    if (!f) return;
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f);
    });
    const dims = await imageDims(dataUrl);
    setFile({ blob: f, dataUrl, w: dims.w, h: dims.h, name: f.name });
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 60));
  }

  function applyPreset(k: string) {
    setSem((prev) => ({ ...prev, ...PRESETS[k].tags }));
  }
  function setDim(key: string, val: string) {
    setSem((prev) => ({ ...prev, [key]: val }));
  }

  async function salvar() {
    if (!file) { toast.error('Escolha uma foto.'); return; }
    setSaving(true);
    try {
      const { path, publicUrl } = await uploadDesignAsset(file.blob);
      await saveMarcosPhoto({
        title: title.trim() || 'Foto do Marcos', url: publicUrl, storage_path: path,
        mime_type: file.blob.type || 'image/jpeg', width: file.w, height: file.h,
        origin: 'real', semantic: { ...sem, person: 'marcos' },
        tags: ['marcos', 'real'],
      });
      toast.success('Foto do Marcos salva na biblioteca.');
      setFile(null); setTitle(''); setSem(DEFAULT_SEM);
      if (fileRef.current) fileRef.current.value = '';
      void load();
    } catch (e) {
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remover(a: MarcosPhotoRow) {
    if (!confirm(`Remover "${a.title}"?`)) return;
    try { await deleteDesignAsset(a.id, a.storage_path); void load(); }
    catch { toast.error('Erro ao remover.'); }
  }
  async function toggle(a: MarcosPhotoRow) {
    try { await setAssetActive(a.id, !a.is_active); void load(); }
    catch { toast.error('Erro ao alternar.'); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Camera className="h-6 w-6 text-accent" /> Hive · Fotos do Marcos (M02)
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O topo da hierarquia de imagem: a Hive usa <b>foto real do Marcos primeiro</b> e só gera uma cena quando não houver foto adequada. Suba as fotos reais e marque as tags — é o que deixa o motor <b>escolher</b> a certa em vez de sortear.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/hive/assets">Fotos/texturas (M01)</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hive/preview">Abrir prévia</Link></Button>
        </div>
      </header>

      {/* Subir */}
      <section className="space-y-4 rounded-xl border border-border p-5">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        {!file ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-muted-foreground transition-colors hover:bg-secondary/40"
          >
            <Upload className="h-6 w-6" />
            <span className="text-sm">Clique pra escolher uma foto real do Marcos</span>
          </button>
        ) : (
          <div className="flex flex-wrap gap-5">
            <img src={file.dataUrl} alt="prévia" className="max-h-[52vh] w-auto rounded-md border border-border" />
            <div className="min-w-[280px] flex-1 space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Marcos facilitando roda de conversa" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Preset por variação (preenche as tags)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <Button key={k} size="sm" variant="outline" onClick={() => applyPreset(k)}>{p.label}</Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {DIMS.map((d) => (
                  <div key={d.key} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{d.label}</Label>
                    <select
                      value={sem[d.key] ?? ''}
                      onChange={(e) => setDim(d.key, e.target.value)}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="">—</option>
                      {d.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="accent" onClick={() => void salvar()} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar na biblioteca
                </Button>
                <Button variant="outline" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>Trocar foto</Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Biblioteca */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Fotos do Marcos ({lib.length})</h2>
        {lib.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma foto ainda. Sem foto real, a M02-A (Presença) e a M02-B (Em Relação) não são escolhidas — o motor prefere Campo/Diário ou volta pra M01. É honesto: não se fabrica o rosto.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {lib.map((a) => (
              <div key={a.id} className={cn('group relative overflow-hidden rounded-md border', a.is_active ? 'border-border' : 'border-dashed border-muted opacity-50')}>
                <img src={a.url} alt={a.title} className="aspect-[4/5] w-full object-cover" />
                <div className="absolute left-1 top-1 flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[9px]">{String(a.semantic?.marcos_reconhecivel ?? '?')}</Badge>
                  {a.semantic?.tipo_registro ? <Badge variant="secondary" className="text-[9px]">{String(a.semantic.tipo_registro)}</Badge> : null}
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
        )}
      </section>
    </div>
  );
}
