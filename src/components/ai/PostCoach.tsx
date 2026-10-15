// Coach de voz FOCADO num post — abre dentro do editor da publicação.
//
// Pra quando o post gerado não presta e você quer dar feedback ao agente em vez
// de reescrever na mão. O agente já sabe qual publicação você está avaliando
// (a frase/legenda que a IA gerou e o conjunto dela) e ancora o feedback nela.
//
// Conversa efêmera (só as lições confirmadas persistem, via commit-learning).
//
// Com `current` + `onApply` (editor da peça), cada feedback também volta com o
// texto REESCRITO (post-chat em modo 'rewrite'): a legenda/frase nova aparece
// com "Aplicar" — o feedback corrige ESTE post e, se salvo, os próximos.

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, Send, Wand2, X } from 'lucide-react';
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

type Field = 'titulo' | 'legenda';
interface Rewrite { field: Field; text: string; label?: string; applied?: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; proposals?: (CoachProposal & { saved?: boolean })[]; rewrites?: Rewrite[] }

interface PostCoachProps {
  focus: CoachFocus;                       // o que a IA gerou (ancora as lições)
  current?: { id?: string; quote?: string; caption?: string };   // o texto como está agora no editor
  onApply?: (field: Field, text: string) => Promise<void>;
}

const QUICK: Array<{ label: string; text: string }> = [
  { label: 'Nova legenda', text: 'Escreva uma nova versão da legenda.' },
  { label: 'Nova frase', text: 'Proponha uma nova frase para a imagem (título).' },
];

export function PostCoach({ focus, current, onApply }: PostCoachProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const canRewrite = !!onApply;
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
      // Em paralelo: o coach destila a lição; a reescrita corrige o texto deste post.
      const [coach, rewrite] = await Promise.allSettled([
        edge.voiceCoach(history, focus),
        canRewrite
          ? edge.postChat({
              messages: history,
              mode: 'rewrite',
              post: {
                id: current?.id, quote: current?.quote ?? focus.quote, caption: current?.caption ?? focus.caption,
                editorial_slug: focus.editorial_slug ?? undefined,
                platform: focus.platform === 'instagram' ? 'instagram' : 'linkedin',
                target_avatar: focus.target_avatar ?? undefined,
              },
            })
          : Promise.resolve(null),
      ]);
      const c = coach.status === 'fulfilled' ? coach.value : null;
      const r = rewrite.status === 'fulfilled' ? rewrite.value : null;
      if (!c && !r) throw (coach as PromiseRejectedResult).reason;
      const rewrites = (r?.suggestions ?? []).map((x) => ({ ...x, applied: false }));
      setMessages((cur) => [...cur, {
        role: 'assistant',
        // com reescrita, a fala do coach ainda vale (explica a lição); sem ele, a da reescrita
        content: c?.reply || r?.reply || '…',
        proposals: (c?.proposals ?? []).map((p) => ({ ...p, saved: false })),
        rewrites,
      }]);
      if (canRewrite && rewrite.status === 'rejected') toast.error('Não consegui reescrever o texto agora — tente de novo.');
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
  async function applyRewrite(mi: number, ri: number) {
    const rw = messages[mi]?.rewrites?.[ri];
    if (!rw || !onApply) return;
    const key = `${mi}-${ri}`;
    setApplyingKey(key);
    try {
      await onApply(rw.field, rw.text);
      setMessages((cur) => cur.map((m, i) => i !== mi ? m : {
        ...m, rewrites: m.rewrites?.map((x, j) => ({ ...x, applied: j === ri })),
      }));
    } catch (e) {
      console.error(e);
      toast.error(`Não apliquei: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setApplyingKey(null);
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
        <MessageSquare className="h-4 w-4" /> {canRewrite ? 'Coach: corrigir este post' : 'Falar com o coach sobre este post'}
      </Button>
    );
  }

  return (
    <Card className="border-accent/40">
      <CardContent className={cn('flex flex-col gap-2 p-3', canRewrite ? 'h-[560px]' : 'h-[420px]')}>
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
              {canRewrite
                ? 'Diga o que não ficou bom. A Hive reescreve o texto deste post (você aplica se gostar) e propõe uma regra pras próximas gerações.'
                : 'Diga o que não ficou bom nesta frase ou legenda. O agente entende o que corrigir e propõe uma regra pras próximas gerações deste conjunto.'}
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
                  {m.rewrites?.map((rw, ri) => {
                    const key = `${mi}-${ri}`;
                    return (
                      <div key={`rw${ri}`} data-testid="coach-rewrite" className={cn('rounded-md border p-2', rw.applied ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-primary/40 bg-primary/5')}>
                        <p className="text-[11px] font-semibold">
                          ✍️ {rw.field === 'legenda' ? 'Nova legenda' : 'Nova frase'}{rw.label ? ` · ${rw.label}` : ''}
                        </p>
                        <p
                          className={cn('mt-1 whitespace-pre-wrap text-[11px] leading-snug', expanded === key ? 'max-h-72 overflow-y-auto' : 'line-clamp-6')}
                        >{rw.text}</p>
                        {rw.text.length > 280 && (
                          <button type="button" className="mt-0.5 text-[10px] text-primary underline" onClick={() => setExpanded(expanded === key ? null : key)}>
                            {expanded === key ? 'ver menos' : 'ver tudo'}
                          </button>
                        )}
                        <div className="mt-1.5 flex gap-1">
                          {rw.applied ? (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-500"><Check className="h-3 w-3" /> Aplicada</span>
                          ) : (
                            <Button size="sm" variant="accent" className="h-6 flex-1 text-[11px]" data-testid="coach-apply"
                              disabled={applyingKey !== null} onClick={() => void applyRewrite(mi, ri)}>
                              {applyingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                              Aplicar {rw.field === 'legenda' ? 'na legenda' : 'na frase'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

        {canRewrite && (
          <div className="flex gap-1">
            {QUICK.map((q) => (
              <Button key={q.label} size="sm" variant="outline" className="h-6 text-[11px]" disabled={sending}
                onClick={() => void send(q.text)}>
                <Wand2 className="h-3 w-3" /> {q.label}
              </Button>
            ))}
          </div>
        )}
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
