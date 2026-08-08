// Modal de "Editar com IA": refino CIRÚRGICO e ITERATIVO de um campo.
// O usuário escreve um ajuste, a IA muda só aquilo e mantém o resto. O texto
// atual aparece ao vivo — a cada aplicação ele se atualiza aqui — então dá pra
// ir pedindo pequenos ajustes até ficar bom, sem fechar o modal.

import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AiEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldLabel: string;          // "o título" | "a legenda"
  currentText: string;         // texto ATUAL (atualiza a cada ajuste)
  busy: boolean;               // aplicando um ajuste
  onApply: (instruction: string) => Promise<void>;
}

export function AiEditDialog({ open, onOpenChange, fieldLabel, currentText, busy, onApply }: AiEditDialogProps) {
  const [instruction, setInstruction] = useState('');

  const submit = async () => {
    const t = instruction.trim();
    if (!t || busy) return;
    await onApply(t);
    setInstruction(''); // pronto pro próximo ajuste
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-accent" /> Editar {fieldLabel} com IA
          </DialogTitle>
          <DialogDescription>
            Escreva o ajuste. A IA muda só o que você pedir e mantém o resto. Refine quantas vezes quiser — quando ficar bom, é só concluir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-md border bg-muted/40 p-3 max-h-52 overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Texto atual</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{currentText || '—'}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-edit-instruction">O que ajustar?</Label>
            <Textarea
              id="ai-edit-instruction"
              rows={3}
              placeholder="Ex: troca 'empresa' por 'organização' e deixa o último parágrafo mais curto."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={busy}
              className="resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }}
            />
            <p className="text-[11px] text-muted-foreground">Dica: ⌘/Ctrl + Enter aplica.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Concluir
          </Button>
          <Button variant="accent" onClick={() => void submit()} disabled={!instruction.trim() || busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            {busy ? 'Ajustando…' : 'Aplicar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
