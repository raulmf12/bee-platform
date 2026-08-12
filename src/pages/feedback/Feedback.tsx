// Feedback contínuo — um lugar pra ir passando observações genéricas sobre o
// conteúdo, mesmo depois de aprovar ("gosto mais da editoria X", "o 'Vê?' se
// repete", "os ganchos estão fracos"). Cada observação é destilada pela IA em
// lições (ai_learnings) no escopo escolhido, e passa a influenciar as gerações.
// Reusa a mesma engine do feedback do wizard (edge.learnFromFeedback).

import { useEffect, useState } from 'react';
import { MessageSquarePlus, Send, Loader2, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { beeApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BeeEditorial, Platform } from '@/types';

type Scope = 'geral' | 'plataforma' | 'editoria';
type Facet = 'texto' | 'legenda' | 'ambos';
const PLATFORMS: Platform[] = ['linkedin', 'instagram'];

interface LogItem {
  observation: string;
  scopeLabel: string;
  learnings: Array<{ texto: string; categoria: string; reforcou: boolean }>;
}

export function Feedback() {
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [observation, setObservation] = useState('');
  const [scope, setScope] = useState<Scope>('geral');
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [editorialSlug, setEditorialSlug] = useState<string>('');
  const [facet, setFacet] = useState<Facet>('ambos');
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<LogItem[]>([]);

  useEffect(() => {
    void beeApi.editorials().then((eds) => {
      setEditorials(eds);
      if (eds[0]) setEditorialSlug(eds[0].slug);
    }).catch(console.error);
  }, []);

  const scopeLabel = () =>
    scope === 'geral' ? 'Geral (todo conteúdo)'
      : scope === 'plataforma' ? `Plataforma · ${platform}`
        : `Editoria · ${editorials.find((e) => e.slug === editorialSlug)?.name ?? editorialSlug}`;

  const submit = async () => {
    const text = observation.trim();
    if (!text) return;
    if (scope === 'editoria' && !editorialSlug) { toast.info('Escolha uma editoria.'); return; }
    setSending(true);
    try {
      const res = await edge.learnFromFeedback({
        feedback_text: text,
        quote_original: '',
        caption_original: '',
        editorial_slug: scope === 'editoria' ? editorialSlug : null,
        platform: scope === 'plataforma' ? platform : null,
        facet_focus: facet,
      });
      const learnings = res.learnings ?? [];
      setLog((prev) => [{ observation: text, scopeLabel: scopeLabel(), learnings }, ...prev]);
      setObservation('');
      toast[learnings.length ? 'success' : 'info'](
        learnings.length
          ? `A IA aprendeu ${learnings.length} lição(ões) com sua observação.`
          : 'Observação registrada (sem regra nova gerada desta vez).',
      );
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao enviar: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <MessageSquarePlus className="h-6 w-6 text-accent" /> Feedback contínuo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vá passando observações sobre o conteúdo — mesmo depois de aprovar. A IA destila cada uma em lições que passam a valer nas próximas gerações.
        </p>
      </header>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="obs">Sua observação</Label>
            <Textarea
              id="obs"
              rows={4}
              placeholder="Ex: o fechamento 'Vê?' está se repetindo em quase todo post. / Gosto mais quando a editoria de Diagnóstico traz dados concretos."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              className="resize-none"
            />
          </div>

          {/* Escopo */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Vale para</Label>
            <div className="flex flex-wrap gap-2">
              {([['geral', 'Geral'], ['plataforma', 'Uma plataforma'], ['editoria', 'Uma editoria']] as [Scope, string][]).map(([s, lbl]) => (
                <Button key={s} size="sm" variant={scope === s ? 'accent' : 'outline'} onClick={() => setScope(s)}>
                  {scope === s && <Check className="h-3.5 w-3.5 mr-1" />}{lbl}
                </Button>
              ))}
            </div>
            {scope === 'plataforma' && (
              <div className="flex flex-wrap gap-2 pt-1">
                {PLATFORMS.map((p) => (
                  <Button key={p} size="sm" variant={platform === p ? 'accent' : 'outline'} className="capitalize" onClick={() => setPlatform(p)}>{p}</Button>
                ))}
              </div>
            )}
            {scope === 'editoria' && (
              <div className="flex flex-wrap gap-2 pt-1">
                {editorials.map((e) => (
                  <Button key={e.slug} size="sm" variant={editorialSlug === e.slug ? 'accent' : 'outline'} onClick={() => setEditorialSlug(e.slug)}>{e.name}</Button>
                ))}
              </div>
            )}
          </div>

          {/* Faceta */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Sobre o quê</Label>
            <div className="flex flex-wrap gap-2">
              {([['ambos', 'Tudo'], ['texto', 'A frase da imagem'], ['legenda', 'A legenda']] as [Facet, string][]).map(([f, lbl]) => (
                <Button key={f} size="sm" variant={facet === f ? 'accent' : 'outline'} onClick={() => setFacet(f)}>{lbl}</Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">Escopo: <span className="font-medium text-foreground">{scopeLabel()}</span></span>
            <Button variant="accent" disabled={!observation.trim() || sending} onClick={() => void submit()}>
              {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Enviar feedback
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Registro do que já foi enviado nesta sessão */}
      {log.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Enviados agora</p>
          {log.map((item, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{item.observation}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{item.scopeLabel}</Badge>
                </div>
                {item.learnings.length > 0 ? (
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> A IA aprendeu
                    </p>
                    {item.learnings.map((l, j) => (
                      <p key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', l.reforcou ? 'bg-amber-500' : 'bg-emerald-500')} />
                        {l.texto} <span className="opacity-60">· {l.categoria}{l.reforcou ? ' (reforçado)' : ''}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground border-t pt-2">Registrado — sem regra nova gerada desta vez.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
