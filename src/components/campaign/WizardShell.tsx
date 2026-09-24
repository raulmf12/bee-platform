import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Moldura das telas de fluxo (criação de campanha, produção): passo discreto no
// topo, título grande e calmo, conteúdo, ações. Uma decisão por tela.
export function WizardShell({ step, total, eyebrow, title, subtitle, onBack, children, footer }: {
  step?: number; total?: number; eyebrow?: string; title: ReactNode; subtitle?: ReactNode;
  onBack?: () => void; children?: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        ) : <span />}
        {step && total ? (
          <div className="flex items-center gap-1.5" aria-label={`Passo ${step} de ${total}`} data-testid="wizard-progress">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i + 1 === step ? 'w-6 bg-accent' : i + 1 < step ? 'w-3 bg-accent/50' : 'w-3 bg-secondary'}`} />
            ))}
          </div>
        ) : null}
      </div>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>}
      <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
      {subtitle && <div className="mt-2 text-base text-muted-foreground">{subtitle}</div>}
      <div className="mt-8 space-y-6">{children}</div>
      {footer && <div className="mt-10 flex flex-wrap items-center gap-3">{footer}</div>}
    </div>
  );
}

// Card de opção grande e clicável (tipo de campanha, duração, "o que criar").
export function ChoiceCard({ selected, onClick, title, description, badge, icon, testId }: {
  selected?: boolean; onClick: () => void; title: string; description?: string; badge?: string; icon?: ReactNode; testId?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} data-testid={testId} aria-pressed={selected}
      className={`group flex w-full items-start gap-4 rounded-xl border p-5 text-left transition-all ${
        selected ? 'border-accent bg-accent/10 ring-1 ring-accent/40' : 'border-border bg-card hover:border-accent/50 hover:bg-accent/5'
      }`}
    >
      {icon && <span className={`mt-0.5 shrink-0 ${selected ? 'text-accent' : 'text-muted-foreground group-hover:text-accent'}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-semibold">{title}</span>
          {badge && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">{badge}</span>}
        </span>
        {description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}
