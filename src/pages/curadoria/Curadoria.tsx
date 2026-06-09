// Curadoria — a fila onde o material minerado pela IA aguarda aprovacao humana.
// Aprovar promove pro arsenal/exemplos/analogias de verdade (entra na geracao).
// Tambem dá pra minerar um texto avulso aqui.

import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { beeApi, suggestionApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import type { BeeEditorial, BeeSuggestion, SuggestionKind } from '@/types';
import { toast } from 'sonner';

const KIND_LABELS: Record<SuggestionKind, string> = {
  arsenal: 'Arsenal',
  example_post: 'Frase / Exemplo',
  analogy: 'Analogia',
};

const KIND_COLORS: Record<SuggestionKind, string> = {
  arsenal: 'bg-blue-500/15 text-blue-700',
  example_post: 'bg-accent/20 text-accent-foreground',
  analogy: 'bg-emerald-500/15 text-emerald-700',
};

// Campos editaveis por tipo de sugestao.
const FIELDS: Record<SuggestionKind, { key: string; label: string; area?: boolean }[]> = {
  arsenal: [
    { key: 'type', label: 'Tipo (case/historia/framework/dado/insight)' },
    { key: 'title', label: 'Título' },
    { key: 'summary', label: 'Resumo', area: true },
    { key: 'details', label: 'Detalhes', area: true },
  ],
  example_post: [
    { key: 'image_quote', label: 'Frase da imagem', area: true },
    { key: 'caption', label: 'Caption', area: true },
    { key: 'why_good', label: 'Por que é boa', area: true },
    { key: 'headline_type', label: 'Tipo de headline' },
    { key: 'analogy', label: 'Analogia usada' },
  ],
  analogy: [
    { key: 'name', label: 'Nome' },
    { key: 'description', label: 'Descrição', area: true },
    { key: 'best_for', label: 'Melhor para' },
  ],
};

export function Curadoria() {
  const [items, setItems] = useState<BeeSuggestion[]>([]);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mineText, setMineText] = useState('');
  const [mining, setMining] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [sug, eds] = await Promise.all([suggestionApi.listPending(), beeApi.listEditorials()]);
      setItems(sug);
      setEditorials(eds);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar a fila');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function patch(id: string, changes: Partial<BeeSuggestion>) {
    setItems((cur) => cur.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  }
  function patchPayload(id: string, key: string, value: string) {
    setItems((cur) => cur.map((s) => (s.id === id ? { ...s, payload: { ...s.payload, [key]: value } } : s)));
  }

  async function approve(s: BeeSuggestion) {
    setBusy(s.id);
    try {
      await suggestionApi.approve(s);
      toast.success('Aprovado — já entra na geração');
      setItems((cur) => cur.filter((x) => x.id !== s.id));
    } catch (e) {
      console.error(e);
      toast.error('Erro ao aprovar');
    } finally {
      setBusy(null);
    }
  }

  async function reject(s: BeeSuggestion) {
    setBusy(s.id);
    try {
      await suggestionApi.reject(s.id);
      setItems((cur) => cur.filter((x) => x.id !== s.id));
    } catch (e) {
      console.error(e);
      toast.error('Erro ao rejeitar');
    } finally {
      setBusy(null);
    }
  }

  async function mine() {
    if (mineText.trim().length < 40) {
      toast.error('Cole um texto maior pra minerar');
      return;
    }
    setMining(true);
    try {
      const r = await edge.mineContent({ text: mineText.trim(), source_type: 'manual' });
      toast.success(`${r.created} sugestão(ões) nova(s)${r.skipped ? ` · ${r.skipped} repetida(s)` : ''}`);
      setMineText('');
      await load();
    } catch (e) {
      console.error(e);
      toast.error(`Falha ao minerar: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setMining(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold">Curadoria</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Material destilado pela IA aguardando sua aprovação. O que você aprovar vira arsenal/exemplo/analogia
          de verdade e entra na geração na hora. Nada entra sem passar por aqui.
        </p>
      </header>

      {/* Minerar texto avulso */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <Label className="text-sm font-semibold">Minerar um texto</Label>
          <Textarea
            rows={3}
            value={mineText}
            onChange={(e) => setMineText(e.target.value)}
            placeholder="Cole uma transcrição, trecho de livro, anotação... a IA destila pepitas pra fila."
          />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void mine()} disabled={mining}>
              {mining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Minerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Fila vazia. Minere um corte de podcast, um documento ou um texto pra começar a alimentar a metodologia.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((s) => {
            const kind = s.kind;
            return (
              <Card key={s.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={KIND_COLORS[kind]}>{KIND_LABELS[kind]}</Badge>
                      {typeof s.confidence === 'number' && s.confidence > 0 && (
                        <span className="text-[10px] text-muted-foreground">confiança {Math.round(s.confidence * 100)}%</span>
                      )}
                      {s.source_type && <span className="text-[10px] text-muted-foreground">· {s.source_type}</span>}
                    </div>
                  </div>

                  {/* editorial */}
                  <div className="space-y-1">
                    <Label className="text-xs">Editorial</Label>
                    <Select
                      value={s.editorial_slug ?? 'none'}
                      onValueChange={(v) => patch(s.id, { editorial_slug: v === 'none' ? null : v })}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— sem editorial —</SelectItem>
                        {editorials.map((e) => <SelectItem key={e.slug} value={e.slug}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* campos do payload conforme o kind */}
                  {FIELDS[kind].map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs">{f.label}</Label>
                      {f.area ? (
                        <Textarea
                          rows={2}
                          value={(s.payload[f.key] as string) ?? ''}
                          onChange={(e) => patchPayload(s.id, f.key, e.target.value)}
                          className="text-xs"
                        />
                      ) : (
                        <Input
                          value={(s.payload[f.key] as string) ?? ''}
                          onChange={(e) => patchPayload(s.id, f.key, e.target.value)}
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}

                  {s.source_excerpt && (
                    <p className="rounded border border-border bg-muted/40 p-2 text-[11px] italic text-muted-foreground line-clamp-2">
                      “{s.source_excerpt}”
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => void reject(s)} disabled={busy === s.id}>
                      <X className="h-3.5 w-3.5 text-destructive" /> Rejeitar
                    </Button>
                    <Button variant="accent" size="sm" onClick={() => void approve(s)} disabled={busy === s.id}>
                      {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aprovar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
