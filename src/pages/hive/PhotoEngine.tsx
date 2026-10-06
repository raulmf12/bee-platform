// MOTOR FOTOGRÁFICO DO MARCOS — gestão (docs/fotografia/01–06):
//   1. Referências por nível (A0 aparência atual · A identidade/expressão · B/C apoio · D histórico),
//      com a suficiência (sem A0 não há corpo — Constituição §4.4) e o envio das fotos A0;
//   2. Estilos F01–F04: prancha de validação + aprovação humana (só aprovados entram em produção);
//   3. Histórico das imagens geradas (origem, estilo, portões, revisão).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ImagePlus, Loader2, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MarcosPhotoReview } from '@/components/hive/MarcosPhotoReview';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { generateMarcosPhoto, type PhotoGeneration } from '@/lib/hive/marcosPhoto';
import {
  BODY_VARIANTS, REFERENCE_MANIFEST, STYLE_ESSENCE, STYLE_NAMES, STYLE_VARIANTS, VARIANT_NAMES, manifestKeyOf, type RefPriority,
} from '@/lib/hive/photoCatalog';
import { cn } from '@/lib/utils';

interface RefRow { id: string; ref_key: string; priority: RefPriority; roles: string[]; url: string; file_name: string | null }
interface Approval { style_id: string; status: 'draft' | 'approved' | 'rejected'; notes: string | null; decided_at: string | null; board_generation_ids: string[] }

const LEVELS: Array<{ p: RefPriority; title: string; hint: string }> = [
  { p: 'A0', title: 'A0 · Aparência atual (23/09/2026)', hint: 'Define idade, cabelo, barba, peso, cintura e proporções do corpo. Sem elas, o motor só gera rosto e busto.' },
  { p: 'A', title: 'A · Identidade e expressões', hint: 'Rosto, olhos, cabelo, barba e as expressões E01–E04.' },
  { p: 'B', title: 'B · Apoio (camiseta preta)', hint: 'Corpo superior e roupa contemporânea.' },
  { p: 'C', title: 'C · Luz natural e contexto externo', hint: 'Postura sentada, ambiente externo, reflexão.' },
  { p: 'D', title: 'D · Fala (estado visual antigo)', hint: 'Só anatomia e expressão em fala — nunca cabelo/barba/corpo.' },
];

// Texto-base da prancha de validação de cada estilo (o motor lê como texto-mãe).
const BOARD_TEXT: Record<string, string> = {
  F01: 'Eu acredito que liderança começa pela presença: antes de responder, é preciso sustentar a pergunta.',
  F02: 'Estou revisando um método: perceber o padrão antes de propor qualquer solução.',
  F03: 'Escutar de verdade muda a qualidade da conversa — e a cultura nasce dessas conversas.',
  F04: 'O próximo passo não precisa ser grandioso; precisa começar.',
};

export function PhotoEngine() {
  const userId = useAuthStore((s) => s.currentUser?.id);
  const [refs, setRefs] = useState<RefRow[] | null>(null);
  const [approvals, setApprovals] = useState<Record<string, Approval>>({});
  const [gens, setGens] = useState<PhotoGeneration[]>([]);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState<{ style: string; variant: string; done: number; total: number } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [r, a, g] = await Promise.all([
      supabase.from('photo_references').select('id,ref_key,priority,roles,url,file_name').eq('is_active', true),
      supabase.from('photo_style_approvals').select('*'),
      supabase.from('photo_generations').select('*').order('created_at', { ascending: false }).limit(60),
    ]);
    setRefs((r.data ?? []) as RefRow[]);
    setApprovals(Object.fromEntries(((a.data ?? []) as Approval[]).map((x) => [x.style_id, x])));
    setGens((g.data ?? []) as PhotoGeneration[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const a0 = (refs ?? []).filter((r) => r.priority === 'A0').length;
  const bodyAllowed = a0 > 0;
  const missingA0 = REFERENCE_MANIFEST.filter((m) => m.priority === 'A0' && !(refs ?? []).some((r) => r.ref_key === m.key));
  const boardOf = useMemo(() => (style: string) => {
    const latest = new Map<string, PhotoGeneration>();
    for (const g of gens) if (g.purpose === 'validation_board' && g.style_id === style && !latest.has(g.variant_id)) latest.set(g.variant_id, g);
    return STYLE_VARIANTS[style].map((v) => latest.get(v)).filter(Boolean) as PhotoGeneration[];
  }, [gens]);

  // Fotos de referência: o nome do arquivo identifica a foto no manifesto do perfil (ex.: 20260923_152032.jpg).
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0; const unknown: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const key = manifestKeyOf(f.name);
        const m = REFERENCE_MANIFEST.find((x) => x.key === key);
        if (!key || !m) { unknown.push(f.name); continue; }
        const path = `hive/refs/${key}.${f.name.split('.').pop()?.toLowerCase() || 'jpg'}`;
        const up = await supabase.storage.from('design').upload(path, f, { upsert: true, contentType: f.type || 'image/jpeg' });
        if (up.error) throw up.error;
        const url = supabase.storage.from('design').getPublicUrl(path).data.publicUrl;
        const ins = await supabase.from('photo_references').upsert({ producer_id: 'marcos_piccini', ref_key: key, priority: m.priority, roles: m.roles, url, storage_path: path, file_name: f.name, is_active: true }, { onConflict: 'producer_id,ref_key' });
        if (ins.error) throw ins.error;
        ok++;
      }
      if (ok) toast.success(`${ok} referência(s) registrada(s).`);
      if (unknown.length) toast.warning(`Não reconhecidas pelo nome (fora do manifesto do perfil): ${unknown.join(', ')}`);
      await load();
    } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setUploading(false); }
  }

  // Prancha de validação: uma imagem por variação disponível do estilo.
  async function runBoard(style: string) {
    const variants = STYLE_VARIANTS[style].filter((v) => bodyAllowed || !BODY_VARIANTS.has(v));
    if (!variants.length) { toast.info('Este estilo precisa das referências A0 (corpo atual).'); return; }
    for (const [i, v] of variants.entries()) {
      setRunning({ style, variant: v, done: i, total: variants.length });
      try { await generateMarcosPhoto({ text: BOARD_TEXT[style], forceVariant: v, purpose: 'validation_board' }); }
      catch (e) { toast.error(`${v}: ${(e as Error).message.slice(0, 160)}`); }
      await load();
    }
    setRunning(null);
    toast.success(`Prancha do ${style} pronta — revise e decida.`);
  }

  async function decide(style: string, status: 'approved' | 'rejected') {
    if (!userId) return;
    const board = boardOf(style);
    const { error } = await supabase.from('photo_style_approvals').upsert({
      user_id: userId, style_id: style, status, notes: notes[style] ?? null, board_generation_ids: board.map((g) => g.id),
      decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,style_id' });
    if (error) { toast.error(error.message); return; }
    toast.success(status === 'approved' ? `${style} aprovado — entra em produção.` : `${style} rejeitado — fica fora da produção.`);
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <header>
        <h1 className="font-display text-2xl font-bold">Motor fotográfico do Marcos</h1>
        <p className="text-sm text-muted-foreground">A Hive não fabrica autoridade. Dá forma visual a uma presença real. · Constituição v1.0 · Perfil marcos_piccini_v1.1 · F01–F04</p>
      </header>

      {/* 1. Referências */}
      <section className="space-y-3" aria-labelledby="h-refs">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="h-refs" className="font-display text-lg font-semibold">Referências ({refs?.length ?? '…'} de {REFERENCE_MANIFEST.length})</h2>
          <label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent/5', uploading && 'opacity-60')}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Enviar fotos de referência
            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => void upload(e.target.files)} data-testid="ref-upload" />
          </label>
        </div>
        {!bodyAllowed && refs && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm" data-testid="a0-missing">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Faltam as {missingA0.length} fotos A0 (aparência atual de 23/09/2026).</p>
            <p className="text-muted-foreground">Sem elas o perfil proíbe deduzir corpo, peso e cintura das fotos antigas — o motor gera só rosto e busto (F01-A, F01-B, F01-C). Envie os arquivos com o nome original ({missingA0.slice(0, 2).map((m) => `${m.key}.jpg`).join(', ')}…) que cada um é reconhecido sozinho.</p>
          </div>
        )}
        <div className="space-y-3">
          {LEVELS.map((l) => {
            const items = (refs ?? []).filter((r) => r.priority === l.p);
            return (
              <div key={l.p} className="rounded-xl border bg-card p-3" data-testid={`level-${l.p}`}>
                <p className="text-sm font-semibold">{l.title} <span className="font-normal text-muted-foreground">· {items.length} de {REFERENCE_MANIFEST.filter((m) => m.priority === l.p).length}</span></p>
                <p className="mb-2 text-xs text-muted-foreground">{l.hint}</p>
                <div className="flex flex-wrap gap-2">
                  {items.sort((a, b) => a.ref_key.localeCompare(b.ref_key)).map((r) => (
                    <figure key={r.id} className="w-20" title={r.roles.join(', ')}>
                      <img src={r.url} alt={r.ref_key} className="aspect-[4/5] w-20 rounded border object-cover" loading="lazy" />
                      <figcaption className="truncate text-[10px] text-muted-foreground">{r.ref_key}</figcaption>
                    </figure>
                  ))}
                  {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Estilos */}
      <section className="space-y-3" aria-labelledby="h-styles">
        <h2 id="h-styles" className="font-display text-lg font-semibold">Estilos fotográficos</h2>
        <p className="text-sm text-muted-foreground">Cada estilo precisa ser aprovado por você na prancha de validação antes de entrar nos posts. Enquanto nenhum estiver aprovado, os posts com o Marcos usam fotos reais dele.</p>
        {(['F01', 'F02', 'F03', 'F04'] as const).map((st) => {
          const ap = approvals[st];
          const board = boardOf(st);
          const available = STYLE_VARIANTS[st].filter((v) => bodyAllowed || !BODY_VARIANTS.has(v));
          const isRunning = running?.style === st;
          return (
            <div key={st} className="space-y-3 rounded-2xl border bg-card p-4" data-testid={`style-${st}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base font-semibold">{st} · {STYLE_NAMES[st]}
                    <span className={cn('ml-2 rounded px-1.5 py-0.5 align-middle text-[11px] font-medium', ap?.status === 'approved' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : ap?.status === 'rejected' ? 'bg-rose-500/15 text-rose-600' : 'bg-secondary text-muted-foreground')} data-testid="style-status">
                      {ap?.status === 'approved' ? 'Aprovado' : ap?.status === 'rejected' ? 'Rejeitado' : 'Em validação'}
                    </span>
                  </p>
                  <p className="text-xs italic text-muted-foreground">{STYLE_ESSENCE[st]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Variações: {STYLE_VARIANTS[st].map((v) => `${v} ${VARIANT_NAMES[v]}${available.includes(v) ? '' : ' (precisa A0)'}`).join(' · ')}</p>
                </div>
                <Button size="sm" variant="outline" disabled={!!running || available.length === 0} onClick={() => void runBoard(st)} data-testid={`board-${st}`}>
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isRunning ? `Gerando ${running!.variant} (${running!.done + 1}/${running!.total})…` : board.length ? 'Gerar prancha de novo' : 'Gerar prancha de validação'}
                </Button>
              </div>
              {board.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {board.map((g) => <MarcosPhotoReview key={g.id} generationId={g.id} compact onApprove={() => load()} onRegenerate={async (note) => { await generateMarcosPhoto({ text: BOARD_TEXT[st], forceVariant: g.variant_id, purpose: 'validation_board', adjustNote: note, parentId: g.id }); await load(); }} />)}
                </div>
              )}
              {board.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                  <Textarea rows={1} className="min-w-[240px] flex-1" placeholder="Observações da validação (opcional)" value={notes[st] ?? ap?.notes ?? ''} onChange={(e) => setNotes({ ...notes, [st]: e.target.value })} aria-label={`Observações ${st}`} />
                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void decide(st, 'approved')} data-testid={`approve-${st}`}><CheckCircle2 className="h-4 w-4" /> Aprovar estilo</Button>
                  <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void decide(st, 'rejected')} data-testid={`reject-${st}`}><XCircle className="h-4 w-4" /> Rejeitar estilo</Button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 3. Histórico */}
      <section className="space-y-2" aria-labelledby="h-hist">
        <h2 id="h-hist" className="font-display text-lg font-semibold">Fotos geradas para posts</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {gens.filter((g) => g.purpose === 'post').map((g) => (
            <li key={g.id} className="space-y-1 text-[11px]" data-testid="history-item">
              {g.image_url && <img src={g.image_url} alt="" className="aspect-[4/5] w-full rounded border object-cover" loading="lazy" />}
              <p className="font-medium">{g.variant_id} · {VARIANT_NAMES[g.variant_id]}</p>
              <p className="text-muted-foreground">portões: {g.auto_status ?? '—'} · {g.review_status === 'approved' ? 'aprovada' : g.review_status === 'rejected' ? 'rejeitada' : g.review_status === 'adjust' ? 'ajuste' : 'pendente'}</p>
            </li>
          ))}
          {!gens.some((g) => g.purpose === 'post') && <li className="col-span-full text-sm text-muted-foreground">Nenhuma ainda.</li>}
        </ul>
      </section>
    </div>
  );
}
