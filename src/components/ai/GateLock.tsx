// A tela de "travado" da campanha de conteúdo.
//
// Mostra o progresso em vez de esconder a função: a campanha vira um objetivo
// visível, e fica claro o que falta pra chegar lá.
//
// O portão que decide vem do banco (ai_gate_status) — o mesmo que o cron
// consulta. Esta tela nunca decide nada por conta própria; ela só mostra.

import { Link } from 'react-router-dom';
import { Brain, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AiGate } from '@/types';

export function GateLock({ gate }: { gate: AiGate }) {
  const pct = Math.min(100, (gate.acuracia / gate.meta) * 100);
  const faltaAmostra = Math.max(0, gate.min_amostra - gate.amostra);
  const faltaGeracoes = Math.max(0, gate.min_geracoes - gate.geracoes);

  const motivo = faltaAmostra > 0
    ? `Faltam ${faltaAmostra} post(s) medido(s): a régua só significa algo com ${gate.min_amostra}.`
    : faltaGeracoes > 0
      ? `Faltam ${faltaGeracoes} geração(ões) distinta(s): as 5 variações de uma mesma geração não são tentativas independentes.`
      : `A IA está em ${gate.acuracia}% e precisa de ${gate.meta}%. Nos últimos ${gate.amostra} posts, ${gate.alterados} precisaram de correção.`;

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <Card className="border-accent/40">
        <CardContent className="space-y-5 p-8">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold">Campanha travada</h1>
          </div>

          <p className="text-sm text-muted-foreground">
            A campanha gera e publica <strong>sozinha</strong>, sem você revisar cada post. Por isso
            ela só abre quando a IA provar que escreve na sua voz — {gate.meta}% dos posts aprovados
            sem uma única correção.
          </p>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-4xl font-bold">{gate.acuracia}%</span>
              <span className="text-sm text-muted-foreground">meta: {gate.meta}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {gate.amostra} de {gate.min_amostra} posts medidos · {gate.geracoes} de{' '}
              {gate.min_geracoes} gerações
            </p>
          </div>

          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs leading-snug">{motivo}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="accent">
              <Link to="/aprendizado">
                <Brain className="h-4 w-4" /> Ver o aprendizado da IA
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/posts/novo">Gerar um post individual</Link>
            </Button>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Cada geração produz 5 variações. Corrija o que precisar e aprove — aprovar sem editar é
            o que faz o número subir.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
