// Coach de voz FOCADO num post — abre dentro do editor da publicação.
//
// Pra quando o post gerado não presta e você quer dar feedback ao agente em vez
// de reescrever na mão. O agente já sabe qual publicação você está avaliando
// (a frase/legenda que a IA gerou e o conjunto dela) e ancora o feedback nela.
//
// Conversa efêmera (só as lições confirmadas persistem, via commit-learning).

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { edge, type CoachFocus, type CoachProposal } from '@/lib/edge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const FACET_LABEL: Record<string, string> = { texto: 'Texto', legenda: 'Legenda', imagem: 'Imagem' };
const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', instagram: 'Instagram' };

function scopeLabel(s: CoachProposal['scope']): string {
  const parts = [
    s.editorial_slug ? s.editorial_slug.replace(/-/g, ' ') : null,
    s.platform ? PLATFORM_LABEL[s.platform] ?? s.platform : null,
    s.target_avatar,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'todos os posts';
}

interface Msg { role: 'user' | 'assistant'; content: string; proposals?: (CoachProposal & { saved?: boolean })[] }

export function PostCoach({ focus }: { focus: CoachFocus }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setSending(true);
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }));
      const res = await edge.voiceCoach(history, focus);
      setMessages((cur) => [...cur, {
        role: 'assistant',
        content: res.reply,
        proposals: res.proposals.map((p) => ({ ...p, saved: false })),
      }]);
    } catch (e) {
      console.error(e);
      toast.error(`Coach falhou: ${(e as Error).message.slice(0, 120)}`);
      setMessages((cur) => cur.slice(0, -1)); // desfaz a fala que não foi respondida
    } finally {
      setSending(false);
    }
  }

  async function saveProposal(mi: number, pi: number) {
    const prop = messages[mi]?.proposals?.[pi];
    if (!prop || prop.saved) return;
    const key = `${mi}-${pi}`;
    setSavingKey(key);
    try {
      const r = await edge.commitLearning(prop);
      toast.success(r.reforcou ? 'Reforçou uma lição existente' : 'Lição salva — já vale na próxima geração');
      mark(mi, pi);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSavingKey(null);
    }
  }
  function mark(mi: number, pi: number) {
    setMessages((cur) => cur.map((m, i) => i !== mi ? m : {
      ...m, proposals: m.proposals?.map((p, j) => (j === pi ? { ...p, saved: true } : p)),
    }));
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" /> Falar com o coach sobre este post
      </Button>
    );
  }

  return (
    <Card className="border-accent/40">
      <CardContent className="flex h-[420px] flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <MessageSquare className="h-3.5 w-3.5 text-accent" /> Coach — feedback deste post
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto rounded-md bg-card/40 p-2">
          {messages.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] leading-snug text-muted-foreground">
              Diga o que não ficou bom nesta frase ou legenda. O agente entende o que corrigir e
              propõe uma regra pras próximas gerações deste conjunto.
            </p>
          ) : (
            messages.map((m, mi) => (
              <div key={mi} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className="max-w-[88%] space-y-1.5">
                  <div className={cn(
                    'rounded-xl px-2.5 py-1.5 text-xs leading-snug',
                    m.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-secondary',
                  )}>
                    {m.content}
                  </div>
                  {m.proposals?.map((p, pi) => p.saved ? null : (
                    <div key={pi} className="rounded-md border border-accent/40 bg-accent/5 p-2">
                      <p className="text-[11px] font-medium">💡 {p.texto}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[9px]">{FACET_LABEL[p.facet] ?? p.facet}</Badge>
                        <Badge variant="outline" className="text-[9px]">{scopeLabel(p.scope)}</Badge>
                      </div>
                      <div className="mt-1.5 flex gap-1">
                        <Button size="sm" variant="accent" className="h-6 flex-1 text-[11px]"
                          disabled={savingKey === `${mi}-${pi}`} onClick={() => void saveProposal(mi, pi)}>
                          {savingKey === `${mi}-${pi}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Salvar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => mark(mi, pi)}>
                          <X className="h-3 w-3" /> Descartar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-secondary px-2.5 py-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="flex items-end gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder="O que não ficou bom?"
            rows={2}
            className="resize-none text-xs"
          />
          <Button variant="accent" size="icon" className="h-9 w-9 shrink-0"
            disabled={sending || !input.trim()} onClick={() => void send(input)}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
