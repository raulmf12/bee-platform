import { useState } from 'react';
import { Calendar as CalendarIcon, Clock, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: Date | null) => Promise<void>;
  platform: string;
  // Quando false, esconde "Publicar Agora" (ex: fluxo de imagem só agenda; o
  // stand-by é um botão à parte). Default true pra não mudar quem já usava.
  allowPublishNow?: boolean;
}

export function ScheduleModal({ open, onOpenChange, onConfirm, platform, allowPublishNow = true }: ScheduleModalProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string>('12:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sugestão "Inteligente" mockada (futuro: chamar API que calcula engajamento)
  const suggestedDate = addDays(new Date(), 1);
  const suggestedTime = platform === 'instagram' ? '18:30' : '10:00';

  const applySuggestion = () => {
    setDate(suggestedDate);
    setTime(suggestedTime);
  };

  const handleConfirm = async (isSchedule: boolean) => {
    setIsSubmitting(true);
    try {
      if (!isSchedule) {
        await onConfirm(null); // Publicar agora
      } else {
        if (!date) return;
        const [hours, minutes] = time.split(':').map(Number);
        const finalDate = new Date(date);
        finalDate.setHours(hours, minutes, 0, 0);
        if (finalDate.getTime() < Date.now()) {
          toast.error('Não dá pra agendar no passado.');
          return;
        }
        await onConfirm(finalDate);
      }
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar Publicação</DialogTitle>
          <DialogDescription>
            Escolha quando este post deve ir ao ar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-medium text-accent">
              <Sparkles className="h-4 w-4" />
              <span>Sugestão Inteligente</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Baseado no seu público no {platform === 'instagram' ? 'Instagram' : 'LinkedIn'}, sugerimos agendar para:
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-semibold">
                {format(suggestedDate, "EEEE, d 'de' MMMM", { locale: ptBR })} às {suggestedTime}
              </span>
              <Button size="sm" variant="secondary" onClick={applySuggestion} className="h-7 text-xs">
                Aplicar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={date ? format(date, "yyyy-MM-dd") : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) setDate(undefined);
                  else {
                    const [year, month, day] = val.split('-').map(Number);
                    setDate(new Date(year, month - 1, day));
                  }
                }}
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>

            <div className="space-y-2">
              <Label>Horário</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  className="pl-9"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {allowPublishNow && (
              <Button variant="outline" onClick={() => handleConfirm(false)} disabled={isSubmitting}>
                Publicar Agora
              </Button>
            )}
            <Button variant="accent" onClick={() => handleConfirm(true)} disabled={!date || !time || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Agendar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
