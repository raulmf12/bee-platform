// Ações sobre uma peça com resultado previsível (docs/identidade/Hive_Ajustes_e_Alternativas_de_Pecas_v1.md §3–§4):
// Ajustar texto · Trocar imagem · Trocar template · Explorar visual · Outra abordagem.
// Cada pedido gera uma PROPOSTA (candidato) → comparação atual × proposta → Aplicar / Descartar /
// Pedir outro ajuste. A peça ativa só muda ao aplicar (validação no banco).
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, Check, ImageIcon, LayoutTemplate, Loader2, PenLine, RefreshCw, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { loadHiveDesign } from '@/lib/hive/loadDesign';
import { imageKind } from '@/lib/campaign/produce';
import {
  ACTION_LABELS, PRESERVED_LABELS, applyCandidate, availability, componentsOf, createCandidate, discardCandidate, templateImpact, updateScheduledPackage,
  type Component, type PieceAction, type PieceCandidate,
} from '@/lib/pieces/ops';
import type { UserPost } from '@/types';

const ICONS: Record<PieceAction, typeof PenLine> = {
  adjust_text: PenLine, swap_image: ImageIcon, swap_template: LayoutTemplate, explore_visual: Wand2, other_approach: RefreshCw, vary_both: ArrowLeftRight,
};
const MAIN: PieceAction[] = ['adjust_text', 'swap_image', 'swap_template', 'explore_visual', 'other_approach'];
const KIND_LABEL = { none: 'sem imagem', bg: 'com fundo', photo: 'com foto' } as const;

export interface ExternalRequest { action: PieceAction; instruction?: string; nonce: number }

export function PieceActionsPanel({ piece, userId, onApplied, externalRequest }: {
  piece: UserPost; userId: string; onApplied: (p: UserPost) => void; externalRequest?: ExternalRequest | null;
}) {
  const [action, setAction] = useState<PieceAction | null>(null);
  const [field, setField] = useState<'quote' | 'caption'>('quote');
  const [mode, setMode] = useState<'hive' | 'manual'>('hive');
  const [instruction, setInstruction] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [cand, setCand] = useState<PieceCandidate | null>(null);
  // "Pedir outro ajuste": base = proposta exibida (null = versão atual).
  const [baseCand, setBaseCand] = useState<PieceCandidate | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<{ id: string; impact: string } | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; nome: string; manifestacao_id: string; operacao?: string }>>([]);
  const cur = componentsOf(piece);

  useEffect(() => {
    loadHiveDesign().then((d) => setTemplates((d.variacoes as Array<{ id: string; nome: string; manifestacao_id: string; operacao?: string }>).filter((v) => v.manifestacao_id !== 'M04'))).catch(() => setTemplates([]));
  }, []);
  // Pedido vindo de fora (ex.: revisão da foto do Marcos → "gerar outra foto").
  useEffect(() => {
    if (!externalRequest) return;
    setAction(externalRequest.action); setInstruction(externalRequest.instruction ?? '');
    void generate({ action: externalRequest.action, instruction: externalRequest.instruction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRequest?.nonce]);

  const openAction = (a: PieceAction) => {
    const av = availability(piece, a);
    if (!av.ok) { toast.info(av.reason); return; }
    setAction(a); setPendingTemplate(null); setManual(a === 'adjust_text' ? (field === 'quote' ? cur.quote : cur.caption) : '');
  };

  async function generate(req: { action: PieceAction; templateId?: string; acceptImpact?: boolean; instruction?: string }) {
    setBusy('generate');
    try {
      const c = await createCandidate(userId, piece, {
        action: req.action, templateId: req.templateId, acceptImpact: req.acceptImpact,
        field: req.action === 'adjust_text' ? field : undefined,
        instruction: req.instruction ?? (instruction.trim() || undefined),
        manualText: req.action === 'adjust_text' && mode === 'manual' ? manual : undefined,
        baseCandidate: baseCand,
      });
      setCand(c); setPendingTemplate(null); setBaseCand(null);
      if (c.status !== 'ready') toast.error(c.error ?? 'A proposta não pôde ser preparada.');
    } catch (e) {
      const impact = (e as { impact?: string | null }).impact;
      if (impact && req.templateId) setPendingTemplate({ id: req.templateId, impact });
      else toast.error((e as Error).message.slice(0, 200));
    } finally { setBusy(null); }
  }

  async function apply() {
    if (!cand) return;
    setBusy('apply');
    try {
      const p = await applyCandidate(cand);
      onApplied(p); setCand(null); setAction(null); setInstruction(''); setManual('');
      toast.success(`Aplicado (v${p.version}).${p.status === 'scheduled' && p.scheduled_version !== p.version ? ' O agendamento continua com a versão anterior até você atualizar.' : ''}`);
    } catch (e) {
      const msg = (e as Error).message;
      const status = /conflito/i.test(msg) ? 'conflict' : /rejeitada/i.test(msg) ? 'rejected' : null;
      const text = status === 'conflict' ? 'A peça mudou depois desta proposta. Descarte e peça de novo sobre a versão atual.' : msg.replace(/^.*?(Proposta rejeitada)/, '$1').slice(0, 220);
      toast.error(text);
      if (status) setCand((c) => (c ? { ...c, status, error: text } : c));
    } finally { setBusy(null); }
  }

  async function discard() {
    if (!cand) return;
    await discardCandidate(cand).catch(() => {});
    setCand(null);
  }

  const outdated = piece.status === 'scheduled' && (piece.metadata as { scheduled_outdated?: boolean } | null)?.scheduled_outdated;
  // "Mantido" = o que de fato não mudou na proposta (diff), não só o que estava autorizado a mudar.
  const preserved = useMemo(() => {
    if (!cand) return [];
    const changedC = new Set((cand.diff ?? []).map((d) => (d.component === 'template' ? 'visual' : d.component)));
    return (['quote', 'caption', 'image', 'visual'] as Component[]).filter((c) => !changedC.has(c) && (c !== 'image' || !!cur.image_ref));
  }, [cand, cur.image_ref]);

  if (piece.status === 'published') return null;
  return (
    <section className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="piece-actions">
      {outdated && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="schedule-outdated">
          <span>O agendamento ainda publica a versão v{piece.scheduled_version}. A versão atual é v{piece.version}.</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { onApplied(await updateScheduledPackage(piece.id)); toast.success('Agendamento atualizado para a versão atual.'); }} data-testid="update-schedule">
            Atualizar agendamento
          </Button>
        </div>
      )}
      <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-accent" /> O que você quer mudar?</p>
      <div className="flex flex-wrap gap-1.5">
        {MAIN.map((a) => {
          const av = availability(piece, a);
          const Icon = ICONS[a];
          return (
            <Button key={a} size="sm" variant={action === a ? 'accent' : 'outline'} disabled={!!busy || !!cand} title={av.ok ? undefined : av.reason}
              className={av.ok ? '' : 'opacity-60'} onClick={() => openAction(a)} data-testid={`action-${a}`}>
              <Icon className="h-3.5 w-3.5" /> {ACTION_LABELS[a]}
            </Button>
          );
        })}
      </div>

      {baseCand && !cand && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-accent/60 p-2 text-xs" data-testid="another-base">
          {baseCand.proposal?.rendered_slides?.slide1 && <img src={baseCand.proposal.rendered_slides.slide1} alt="Proposta base" className="h-12 w-10 rounded object-cover" />}
          <span>O próximo ajuste parte da <b>proposta exibida</b> ({ACTION_LABELS[baseCand.action].toLowerCase()}). Escolha a ação acima.</span>
          <Button size="sm" variant="ghost" onClick={() => { void discardCandidate(baseCand).catch(() => {}); setBaseCand(null); }} data-testid="another-from-current">Partir da versão atual</Button>
        </div>
      )}

      {/* ---------- formulário da ação ---------- */}
      {action && !cand && (
        <div className="space-y-3 rounded-xl border bg-card p-3" data-testid="action-form">
          {action === 'adjust_text' && (
            <>
              <div className="flex flex-wrap gap-1 text-xs">
                {(['quote', 'caption'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={field === f} onClick={() => { setField(f); setManual(f === 'quote' ? cur.quote : cur.caption); }}
                    className={`rounded-full border px-3 py-1 ${field === f ? 'border-accent bg-accent/15' : ''}`}>{f === 'quote' ? 'Frase da imagem' : 'Legenda'}</button>
                ))}
                <span className="mx-1 text-muted-foreground">·</span>
                {(['hive', 'manual'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                    className={`rounded-full border px-3 py-1 ${mode === m ? 'border-accent bg-accent/15' : ''}`}>{m === 'hive' ? 'Pedir à Hive' : 'Editar eu mesmo'}</button>
                ))}
              </div>
              {mode === 'hive'
                ? <Input aria-label="Pedido de ajuste do texto" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: mais curta, abertura mais provocativa" />
                : <Textarea aria-label="Novo texto" rows={field === 'quote' ? 2 : 7} value={manual} onChange={(e) => setManual(e.target.value)} />}
              <p className="text-xs text-muted-foreground">{field === 'quote' ? 'Muda só a frase: a imagem e o template ficam; a composição é refeita para acomodar o texto.' : 'Muda só a legenda: a imagem e a frase não mudam.'}</p>
            </>
          )}
          {action === 'swap_image' && (
            <>
              <Input aria-label="O que mudar na imagem (opcional)" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Opcional: ex.: foto mais aberta, outro ambiente" />
              <p className="text-xs text-muted-foreground">Troca só a imagem ({KIND_LABEL[imageKind(cur.variant)]}). Frase, legenda e template ficam exatamente iguais.</p>
            </>
          )}
          {action === 'swap_template' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Templates ativos. A frase e a legenda ficam exatamente iguais; a imagem atual é mantida quando o template é compatível.</p>
              <div className="grid gap-2 sm:grid-cols-2" data-testid="template-gallery">
                {templates.filter((t) => t.id !== cur.variant).map((t) => {
                  const ti = templateImpact(cur.variant, t.id);
                  return (
                    <button key={t.id} type="button" disabled={!!busy} onClick={() => (ti.compatible ? generate({ action: 'swap_template', templateId: t.id }) : setPendingTemplate({ id: t.id, impact: ti.impact ?? '' }))}
                      className="rounded-lg border bg-background p-2 text-left text-xs hover:border-accent" data-testid="template-option" data-template={t.id}>
                      <span className="font-semibold">{t.id} {t.nome}</span>
                      <span className="block text-muted-foreground">{KIND_LABEL[imageKind(t.id)]}{ti.compatible ? ' · mantém a imagem' : ' · muda a imagem'}</span>
                    </button>
                  );
                })}
              </div>
              {pendingTemplate && (
                <div className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300" data-testid="template-impact">
                  {pendingTemplate.impact}
                  <div className="mt-1.5 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => generate({ action: 'swap_template', templateId: pendingTemplate.id, acceptImpact: true })} data-testid="template-accept">Gerar mesmo assim</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingTemplate(null)}>Escolher outro</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {action === 'other_approach' && (
            <>
              <Input aria-label="Que outra abordagem (opcional)" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Opcional: ex.: comece por uma cena concreta" />
              <p className="text-xs text-muted-foreground">Mesmo conteúdo-mãe, intenção e movimento; muda o desenvolvimento do texto. Ocupa este mesmo desdobramento (não cria outra publicação).</p>
            </>
          )}
          {action !== 'swap_template' && (
            <div className="flex gap-2">
              <Button size="sm" variant="accent" disabled={!!busy || (action === 'adjust_text' && (mode === 'hive' ? !instruction.trim() : !manual.trim()))}
                onClick={() => generate({ action })} data-testid="generate-proposal">
                {busy === 'generate' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando proposta…</> : 'Gerar proposta'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Cancelar</Button>
            </div>
          )}
          {action === 'swap_template' && busy === 'generate' && <p className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando proposta…</p>}
        </div>
      )}

      {/* ---------- comparação atual × proposta ---------- */}
      {cand && (
        <div className="space-y-3 rounded-xl border bg-card p-3" data-testid="candidate">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ACTION_LABELS[cand.action]} · proposta sobre a v{cand.base_version}</p>
          {cand.status !== 'ready' && <p className="text-sm text-red-600" data-testid="candidate-error">{cand.error ?? `Proposta ${cand.status}.`}</p>}
          {cand.proposal?.rendered_slides?.slide1 && (
            <div className="grid grid-cols-2 gap-2">
              <figure><figcaption className="mb-1 text-xs text-muted-foreground">Atual</figcaption>
                {piece.rendered_slides?.slide1 ? <img src={piece.rendered_slides.slide1} alt="Versão atual" className="aspect-[4/5] w-full rounded-lg border object-cover" /> : <div className="aspect-[4/5] rounded-lg border" />}</figure>
              <figure><figcaption className="mb-1 text-xs text-muted-foreground">Proposta</figcaption>
                <img src={cand.proposal.rendered_slides.slide1} alt="Proposta" className="aspect-[4/5] w-full rounded-lg border object-cover" data-testid="candidate-image" /></figure>
            </div>
          )}
          {(cand.diff ?? []).filter((d) => d.component === 'quote' || d.component === 'caption').map((d) => (
            <div key={d.component} className="space-y-1 text-sm" data-testid={`candidate-diff-${d.component}`}>
              <p className="text-xs text-muted-foreground">{d.component === 'quote' ? 'Frase' : 'Legenda'}</p>
              <p className="whitespace-pre-line text-muted-foreground line-through decoration-muted-foreground/50">{(d.before ?? '').slice(0, 400)}</p>
              <p className="whitespace-pre-line" data-testid={`candidate-new-${d.component}`}>{(d.after ?? '').slice(0, 800)}</p>
            </div>
          ))}
          {(cand.diff ?? []).some((d) => d.component === 'template') && <p className="text-xs">Template: {(cand.diff ?? []).find((d) => d.component === 'template')?.before} → <b>{(cand.diff ?? []).find((d) => d.component === 'template')?.after}</b></p>}
          {cand.impact && <p className="text-xs text-amber-700 dark:text-amber-400">{cand.impact}</p>}
          <div className="flex flex-wrap gap-1.5" data-testid="candidate-preserved">
            {preserved.map((c) => <span key={c} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"><Check className="mr-0.5 inline h-3 w-3" />{PRESERVED_LABELS[c]}</span>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" disabled={!!busy || cand.status !== 'ready'} onClick={apply} data-testid="candidate-apply">
              {busy === 'apply' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aplicar
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={discard} data-testid="candidate-discard"><X className="h-3.5 w-3.5" /> Descartar</Button>
            {cand.status === 'ready' && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setBaseCand(cand); setCand(null); setAction(null); }} data-testid="candidate-another">
                <Undo2 className="h-3.5 w-3.5" /> Pedir outro ajuste
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );

}
