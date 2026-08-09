// Painel lateral de brainstorm com a IA, dentro da revisão do post.
// A IA enxerga o título+legenda atuais, troca ideias, e quando propõe um texto
// pronto (título ou legenda) mostra um botão "Aplicar" que joga direto no campo.
// Fixo à direita; some ao trocar de post (o pai remonta via key={activeId}).

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X, Check, Wand2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { edge } from '@/lib/edge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Suggestion { field: 'titulo' | 'legenda'; text: string; label?: string }
interface ChatMessage { role: 'user' | 'assistant'; content: string; suggestions?: Suggestion[] }

// Rede de segurança: se por algum motivo a resposta vier como JSON cru
// ({ "reply": "..." }), extrai só o texto do reply em vez de mostrar as chaves.
function sanitizeReply(raw: string): string {
  const t = (raw ?? '').trim();
  if (!t.startsWith('{') || !/"reply"\s*:/.test(t)) return t;
  const m = t.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
  if (m) { try { return JSON.parse(`"${m[1]}"`); } catch { return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); } }
  return t;
}

interface PostChatPanelProps {
  open: boolean;
  onClose: () => void;
  postId: string;              // pra persistir a conversa por post
  post: { quote?: string; caption?: string; editorial_slug?: string; platform?: 'linkedin' | 'instagram'; target_avatar?: string };
  onApply: (field: 'titulo' | 'legenda', text: string) => Promise<void>;
}

const STORAGE_PREFIX = 'bee.postchat.';
const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'Bora pensar juntos neste post? Me diz o que te incomoda — o gancho, a analogia, o fechamento — ou me pede ideias novas. 🐝',
};

// Carrega o histórico salvo deste post (sobrevive a refresh e reabertura).
function loadMessages(postId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + postId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as ChatMessage[];
    }
  } catch { /* ignore */ }
  return [GREETING];
}

export function PostChatPanel({ open, onClose, postId, post, onApply }: PostChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(postId));
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persiste a conversa deste post a cada mudança.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_PREFIX + postId, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages, postId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await edge.postChat({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        post,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: sanitizeReply(res.reply), suggestions: res.suggestions }]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Deu um erro aqui: ${(e as Error).message.slice(0, 120)}` }]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([GREETING]);
    setApplied(new Set());
    try { localStorage.removeItem(STORAGE_PREFIX + postId); } catch { /* ignore */ }
  };

  const apply = async (s: Suggestion, key: string) => {
    try {
      await onApply(s.field, s.text);
      setApplied((prev) => new Set(prev).add(key));
      toast.success(`Aplicado ${s.field === 'titulo' ? 'no título' : 'na legenda'}.`);
    } catch (e) {
      console.error(e);
      toast.error('Não consegui aplicar. Tente de novo.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-accent/15 p-1.5"><Sparkles className="h-4 w-4 text-accent" /></div>
          <div>
            <p className="text-sm font-semibold leading-tight">Assistente de geração de conteúdo</p>
            <p className="text-[11px] text-muted-foreground leading-tight">A IA vê este post e pode aplicar sugestões</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={clearChat} title="Limpar conversa"><Trash2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Fechar"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] space-y-2')}>
              <div
                className={cn(
                  'rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                  m.role === 'user' ? 'bg-accent text-accent-foreground rounded-br-sm' : 'bg-secondary rounded-bl-sm',
                )}
              >
                {m.content}
              </div>
              {m.suggestions?.map((s, j) => {
                const key = `${i}-${j}`;
                const done = applied.has(key);
                return (
                  <div key={j} className="rounded-lg border border-accent/30 bg-accent/5 p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent uppercase tracking-wide">
                      <Wand2 className="h-3 w-3" />
                      {s.field === 'titulo' ? 'Título' : 'Legenda'}{s.label ? ` · ${s.label}` : ''}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{s.text}</p>
                    <Button size="sm" variant={done ? 'outline' : 'accent'} className="w-full" disabled={done} onClick={() => void apply(s, key)}>
                      {done ? <><Check className="h-3.5 w-3.5 mr-1" /> Aplicado</> : `Aplicar ${s.field === 'titulo' ? 'no título' : 'na legenda'}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-secondary px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            placeholder="Ex: o gancho tá fraco, me dá 3 opções mais provocativas."
            className="resize-none text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          />
          <Button size="icon" variant="accent" disabled={!input.trim() || sending} onClick={() => void send()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Enter envia · Shift+Enter quebra linha</p>
      </div>
    </div>
  );
}
