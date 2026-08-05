// A tela de "campanha ainda fechada" — mostrada quando NENHUM segmento liberou.
//
// A campanha deixou de ser toda-ou-nada: ela abre por segmento (editoria ×
// plataforma × alvo). Enquanto zero segmentos estão liberados, a campanha não
// tem o que gerar sozinha, então esta tela explica o caminho.

import { Link } from 'react-router-dom';
import { Brain, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AiGate } from '@/types';

export function GateLock({ gate }: { gate: AiGate }) {
  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <Card className="border-accent/40">
        <CardContent className="space-y-5 p-8">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold">Campanha ainda fechada</h1>
          </div>

          <p className="text-sm text-muted-foreground">
            A campanha gera e publica <strong>sozinha</strong>, então ela abre por{' '}
            <strong>conjunto</strong> — cada combinação de editoria, plataforma e público destrava
            no seu próprio ritmo, quando a IA prova que acerta ali ({gate.meta}% em cada faceta:
            texto, legenda e imagem).
          </p>

          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs leading-snug">
              {gate.total_segmentos === 0
                ? 'Nenhum conjunto tem medição ainda. Gere posts individuais e aprove — cada aprovação mede um conjunto.'
                : `${gate.total_segmentos} conjunto(s) em medição, nenhum nos ${gate.meta}% ainda. Falta consistência: aprovar sem editar é o que faz um conjunto liberar.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="accent">
              <Link to="/aprendizado">
                <Brain className="h-4 w-4" /> Ver o aprendizado por conjunto
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/posts/novo">Gerar um post individual</Link>
            </Button>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Um conjunto libera com {gate.min_amostra} posts medidos ali e cada faceta batendo{' '}
            {gate.meta}%. Não precisa de todos: assim que o primeiro conjunto abre, a campanha começa
            a produzir só pra ele.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
