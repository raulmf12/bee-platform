import { cn } from '@/lib/utils';

interface BeeLogoProps {
  className?: string;
  showTagline?: boolean;
}

// Versao SVG inline e leve da logo Bee.
// O simbolo da abelha (loop laranja) + texto "Bee" navy.
export function BeeLogo({ className, showTagline = false }: BeeLogoProps) {
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 60 50"
          className="h-8 w-auto"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Loop infinito laranja (abelha estilizada) */}
          <path
            d="M 10 25 Q 5 10 18 12 Q 30 14 30 25 Q 30 36 18 38 Q 5 40 10 25 Z"
            stroke="#E8A04C"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 30 25 Q 32 14 44 12 Q 56 10 50 25 Q 56 40 44 38 Q 32 36 30 25 Z"
            stroke="#E8A04C"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
        </svg>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-xl font-bold tracking-tight text-foreground">
            Bee
          </span>
          {showTagline && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Consulting
            </span>
          )}
        </div>
      </div>
      {showTagline && (
        <p className="text-[10px] italic text-muted-foreground">
          cocriando novas realidades
        </p>
      )}
    </div>
  );
}
