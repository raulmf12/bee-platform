// Validação do conteúdo (Tela 11): movimento pretendido, mecanismo, principal risco
// e o portão "o movimento aconteceu?". Marcos qualifica a leitura (fonte do Registro Vivo).
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDashed } from 'lucide-react';
import { toast } from 'sonner';
import { AcjChip } from './AcjChip';
import { acjContractApi } from '@/lib/acj/api';
import { REALIZED_LABELS, acjLabel } from '@/lib/acj/library';
import type { AcjContentContract } from '@/types';

export function AcjContractSummary({ contract, onChange }: { contract: AcjContentContract | null | undefined; onChange?: (c: AcjContentContract) => void }) {
  const [open, setOpen] = useState(false);
  if (!contract) {
    return (
      <section className="flex items-start gap-2 rounded-2xl border border-dashed border-amber-500/50 p-4 text-sm text-amber-700 dark:text-amber-400" data-testid="acj-contract-missing">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Este conteúdo ainda não tem contrato ACJ (movimento relacional). Você pode aprovar mesmo assim; ele fica registrado sem ACJ.
      </section>
    );
  }
  const v = contract.validation;
  const icon = !v ? <CircleDashed className="h-4 w-4 text-muted-foreground" /> : v.realized === 'yes' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />;
  async function feedback(realized: 'yes' | 'partial' | 'no') {
    try {
      const c = await acjContractApi.update(contract!.id, { marcos_feedback: { realized, at: new Date().toISOString() } });
      onChange?.(c);
      toast.success('Sua leitura do movimento foi registrada.');
    } catch (e) { toast.error((e as Error).message.slice(0, 160)); }
  }
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="acj-contract">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Movimento pretendido</p>
        <AcjChip id={contract.acj_primary} showPhrase />
        {contract.acj_secondary && <AcjChip id={contract.acj_secondary} secondary size="xs" />}
        {contract.assigned_late && <span className="text-xs text-amber-700 dark:text-amber-400" data-testid="acj-assigned-late">ACJ atribuída depois da ideia</span>}
      </div>
      <p className="text-sm"><span className="text-muted-foreground">De</span> {contract.audience_state_from} <span className="text-muted-foreground">→ para</span> {contract.movement_to}</p>
      <p className="text-sm"><span className="text-muted-foreground">Mecanismo:</span> {contract.connection_mechanism}</p>
      <div className="flex flex-wrap items-start gap-2 rounded-lg bg-secondary/50 p-3 text-sm" data-testid="acj-gate">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{v ? `${REALIZED_LABELS[v.realized]} (${v.score}/100)` : 'Portão ACJ não executado'}</p>
          {v?.main_risk && <p className="text-muted-foreground">Risco principal: {v.main_risk}</p>}
          {v?.boundary_conflict && <p className="text-amber-700 dark:text-amber-400">O texto parece produzir {acjLabel(v.boundary_conflict)} — se for intencional, vira nova variante.</p>}
          {v && v.realized !== 'yes' && v.suggestion && <p className="text-muted-foreground">Sugestão: {v.suggestion}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Na sua leitura, o movimento aconteceu?</span>
        {(['yes', 'partial', 'no'] as const).map((r) => (
          <button key={r} type="button" onClick={() => feedback(r)} aria-pressed={contract.marcos_feedback?.realized === r}
            className={`rounded-full border px-2.5 py-0.5 ${contract.marcos_feedback?.realized === r ? 'border-accent bg-accent/15' : 'hover:bg-accent/5'}`} data-testid={`acj-feedback-${r}`}>
            {r === 'yes' ? 'Sim' : r === 'partial' ? 'Em parte' : 'Não'}
          </button>
        ))}
        <button type="button" onClick={() => setOpen((x) => !x)} className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
          {open ? <><ChevronUp className="h-3.5 w-3.5" /> Ocultar contrato</> : <><ChevronDown className="h-3.5 w-3.5" /> Ver contrato completo</>}
        </button>
      </div>
      {open && (
        <dl className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2" data-testid="acj-contract-details">
          {[
            ['Necessidade da jornada', contract.journey_need], ['Gesto do autor', contract.authorial_gesture],
            ['Experiência favorecida', contract.expected_experience], ['Por que esta ACJ', contract.rationale],
            ['Resposta esperada (não obrigatória)', contract.expected_response.join('; ')], ['Modos de falha', contract.failure_modes.join('; ')],
            ['Não deve tentar', contract.not_to_do], ['Convite compatível', contract.expression_context?.cta ?? ''],
            ['Problemas apontados pelo portão', v?.issues.join('; ') ?? ''], ['Versão', `v${contract.version} · ${contract.source_acj_version}`],
          ].filter(([, x]) => x).map(([k, x]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{x}</dd></div>)}
        </dl>
      )}
    </section>
  );
}
