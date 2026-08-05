// Coach de voz — /coach.
//
// Um segundo caminho pra a IA aprender: você CONVERSA pra corrigir os erros de
// geração, e o agente destila regras. Ele enxerga seus dados reais (correções,
// precisão por conjunto) e só PROPÕE — nada vira lição sem você confirmar.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { aiApi } from '@/lib/api';
import { edge, type CoachProposal } from '@/lib/edge';
import type { AiChatMessage } from '@/types';
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

const SUGESTOES = [
  'As frases estão usando advérbios de enchimento demais.',
  'As legendas estão longas — no máximo 3 parágrafos.',
  'Pro público incomodado, seja mais provocativo.',
];

export function Coach() {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void aiApi.chatHistory()
      .then(setMessages)
      .catch((e) => { console.error(e); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    setSending(true);

    // grava a fala do usuário e mostra na hora
    let userMsg: AiChatMessage;
    try {
      userMsg = await aiApi.saveChatMessage({ role: 'user', content });
    } catch (e) {
      console.error(e);
      toast.error('Falha ao enviar');
      setSending(false);
      return;
    }
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    try {
      const history = withUser.map((m) => ({ role: m.role, content: m.content }));
      const res = await edge.voiceCoach(history);
      const assistantMsg = await aiApi.saveChatMessage({
        role: 'assistant',
        content: res.reply,
        proposals: res.proposals.map((p) => ({ ...p, saved: false })),
      });
      setMessages((cur) => [...cur, assistantMsg]);
    } catch (e) {
      console.error(e);
      toast.error(`Coach falhou: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setSending(false);
    }
  }

  async function saveProposal(msg: AiChatMessage, idx: number) {
    const prop = msg.proposals[idx];
    if (!prop || prop.saved) return;
    setSavingKey(`${msg.id}-${idx}`);
    try {
      const r = await edge.commitLearning({ ...prop, chat_message_id: msg.id });
      toast.success(r.reforcou ? 'Reforçou uma lição existente' : 'Lição salva — já vale na próxima geração');
      const nextProposals = msg.proposals.map((p, i) => (i === idx ? { ...p, saved: true } : p));
      await aiApi.markProposalSaved(msg.id, nextProposals);
      setMessages((cur) => cur.map((m) => (m.id === msg.id ? { ...m, proposals: nextProposals } : m)));
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSavingKey(null);
    }
  }

  function discardProposal(msg: AiChatMessage, idx: number) {
    const nextProposals = msg.proposals.map((p, i) => (i === idx ? { ...p, saved: true } : p));
    void aiApi.markProposalSaved(msg.id, nextProposals).catch(() => {});
    setMessages((cur) => cur.map((m) => (m.id === msg.id ? { ...m, proposals: nextProposals } : m)));
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6 lg:p-8">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold">Coach de voz</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Converse pra corrigir os erros de geração. O agente vê suas correções e a precisão por
          conjunto, e propõe regras — <strong>você confirma</strong> antes de virar lição.{' '}
          <Link to="/aprendizado" className="text-accent underline-offset-2 hover:underline">
            Ver o que já aprendeu →
          </Link>
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-border bg-card/30 p-4">
        {loading ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-accent" />
            <p className="text-sm text-muted-foreground">
              Diga o que está saindo errado nas gerações. Ex:
            </p>
            <div className="flex flex-col items-center gap-1.5">
              {SUGESTOES.map((sug) => (
                <button
                  key={sug}
                  onClick={() => void send(sug)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] space-y-2', m.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={cn(
                  'rounded-2xl px-3.5 py-2 text-sm leading-snug',
                  m.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-secondary',
                )}>
                  {m.content}
                </div>

                {/* propostas de lição */}
                {m.role === 'assistant' && m.proposals.filter((p) => !p.saved).map((p, i) => {
                  const idx = m.proposals.indexOf(p);
                  const key = `${m.id}-${idx}`;
                  return (
                    <Card key={key} className="border-accent/40 bg-accent/5">
                      <CardContent className="space-y-2 p-2.5">
                        <p className="text-xs font-medium">💡 {p.texto}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary" className="text-[9px]">{FACET_LABEL[p.facet] ?? p.facet}</Badge>
                          <Badge variant="outline" className="text-[9px]">{scopeLabel(p.scope)}</Badge>
                          <Badge variant="secondary" className="text-[9px]">{p.categoria}</Badge>
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="accent" className="h-7 flex-1 text-xs"
                            disabled={savingKey === key} onClick={() => void saveProposal(m, idx)}>
                            {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Salvar lição
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => discardProposal(m, idx)}>
                            <X className="h-3.5 w-3.5" /> Descartar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-secondary px-3.5 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
          }}
          placeholder="O que está saindo errado nas gerações?"
          rows={2}
          className="resize-none"
        />
        <Button variant="accent" size="icon" className="h-10 w-10 shrink-0"
          disabled={sending || !input.trim()} onClick={() => void send(input)}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
