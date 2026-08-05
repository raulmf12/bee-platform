import { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type FeedbackActionType = 'correct' | 'discard';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: FeedbackActionType;
  onSubmit: (feedback: string, facet: 'texto' | 'legenda' | 'ambos') => Promise<void>;
  // Quando setado, a faceta é fixa (ex: rejeitar só o título) e o seletor some.
  lockedFacet?: 'texto' | 'legenda';
}

export function FeedbackDialog({ open, onOpenChange, actionType, onSubmit, lockedFacet }: FeedbackDialogProps) {
  const [feedback, setFeedback] = useState('');
  const [facet, setFacet] = useState<'texto' | 'legenda' | 'ambos'>('ambos');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveFacet = lockedFacet ?? facet;

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(feedback, effectiveFacet);
      setFeedback('');
      setFacet('ambos');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {actionType === 'correct' ? 'O que precisa ser corrigido?' : 'Motivo da rejeição total'}
          </DialogTitle>
          <DialogDescription>
            A IA aprenderá com este feedback para não cometer o mesmo erro nos próximos posts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!lockedFacet && (
          <div className="space-y-2">
            <Label>Onde está o problema principal?</Label>
            <div className="flex gap-2">
              <Button 
                variant={facet === 'texto' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setFacet('texto')}
                className={cn(facet === 'texto' && "bg-accent text-accent-foreground")}
              >
                Frase
              </Button>
              <Button 
                variant={facet === 'legenda' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setFacet('legenda')}
                className={cn(facet === 'legenda' && "bg-accent text-accent-foreground")}
              >
                Legenda
              </Button>
              <Button 
                variant={facet === 'ambos' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setFacet('ambos')}
                className={cn(facet === 'ambos' && "bg-accent text-accent-foreground")}
              >
                Ambos
              </Button>
            </div>
          </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="feedback-text">Instrução de correção</Label>
            <Textarea
              id="feedback-text"
              placeholder={actionType === 'correct' ? "Ex: Seja mais direto na frase e corte o primeiro parágrafo da legenda." : "Ex: A ideia não tem nada a ver com a nossa forma de falar sobre o pilar X."}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button 
            variant={actionType === 'correct' ? 'accent' : 'destructive'} 
            onClick={handleSubmit} 
            disabled={!feedback.trim() || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {actionType === 'correct' ? 'Regenerar Post' : 'Descartar e Gerar Novo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
