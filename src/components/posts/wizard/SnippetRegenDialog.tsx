// Modal de "Regenerar trecho": a pessoa selecionou um pedaço da legenda (ex:
// uma analogia), dá uma orientação, e a IA traz 4-5 alternativas que encaixam
// no lugar. Clicar numa opção substitui SÓ o trecho selecionado.

import { useState } from 'react';
import { Loader2, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SnippetRegenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippet: string;              // trecho selecionado
  busy: boolean;                // gerando opções
  options: string[];            // alternativas geradas
  onGenerate: (instruction: string) => Promise<void>;
  onPick: (option: string) => void;
}

export function SnippetRegenDialog({ open, onOpenChange, snippet, busy, options, onGenerate, onPick }: SnippetRegenDialogProps) {
  const [instruction, setInstruction] = useState('');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" /> Regenerar trecho
          </DialogTitle>
          <DialogDescription>
            A IA vai propor alternativas só para o trecho selecionado, mantendo o resto do texto. Clique numa opção pra usá-la.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Trecho selecionado</p>
            <p className="text-sm leading-relaxed">{snippet}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="snippet-instruction">O que você quer? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea
              id="snippet-instruction"
              rows={2}
              placeholder="Ex: quero outra analogia, algo da natureza; menos técnico."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={busy}
              className="resize-none"
            />
            <Button
              variant="accent"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => void onGenerate(instruction)}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {busy ? 'Gerando opções…' : options.length ? 'Gerar outras opções' : 'Gerar opções'}
            </Button>
          </div>

          {options.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {options.length} opções — clique pra usar
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPick(opt)}
                    className="group w-full text-left rounded-md border p-3 text-sm leading-relaxed transition-colors hover:border-accent hover:bg-accent/5"
                  >
                    <span className="flex items-start gap-2">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-accent" />
                      <span>{opt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
