// Laboratório de imagem — compara modelos (Nano Banana × GPT Image 2.5) na MESMA
// frase, lado a lado, com o CUSTO REAL de cada geração e um placar de aprovações.
// Objetivo: até sexta, decidir qual modelo o sistema vai adotar.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { ImageIcon, Loader2, Check, DollarSign, Trophy } from 'lucide-react';
import { edge } from '@/lib/edge';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

// O grupo em disputa. Nano Banana é o atual; os dois GPT são os candidatos.
const MODELS: Array<{ id: string; label: string; provider: string }> = [
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana', provider: 'Gemini' },
  { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare', provider: 'OpenAI · rápido' },
  { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst', provider: 'OpenAI · precisão' },
];

interface GenResult {
  model: string;
  loading: boolean;
  dataUrl?: string;
  cost?: number;
  tokensOut?: number;
  error?: string;
  trialId?: string;
  approved?: boolean;
}

interface LeaderRow { model: string; gens: number; aprovados: number; custoMedio: number; custoTotal: number }

const STYLE_HINT = 'Marcos Piccini / Bee — sóbrio, silencioso, sistêmico';

export function ImageLab() {
  const [prompt, setPrompt] = useState('Fotografia atmosférica e contemplativa: vale entre montanhas ao amanhecer, névoa, muito espaço negativo. Sem pessoas, sem texto. Vertical.');
  const [aspect, setAspect] = useState('3:4');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'xhigh'>('medium');
  const [selected, setSelected] = useState<string[]>(MODELS.map((m) => m.id));
  const [results, setResults] = useState<GenResult[]>([]);
  const [running, setRunning] = useState(false);
  const [leader, setLeader] = useState<LeaderRow[]>([]);

  const loadLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from('image_model_trials')
      .select('model,approved,cost_usd');
    if (error) return;
    const map = new Map<string, LeaderRow>();
    for (const r of data ?? []) {
      const row = map.get(r.model) ?? { model: r.model, gens: 0, aprovados: 0, custoMedio: 0, custoTotal: 0 };
      row.gens += 1;
      if (r.approved) row.aprovados += 1;
      row.custoTotal += Number(r.cost_usd ?? 0);
      map.set(r.model, row);
    }
    const rows = [...map.values()].map((r) => ({ ...r, custoMedio: r.gens ? r.custoTotal / r.gens : 0 }));
    rows.sort((a, b) => b.aprovados - a.aprovados);
    setLeader(rows);
  }, []);

  useEffect(() => { void loadLeaderboard(); }, [loadLeaderboard]);

  function toggleModel(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function generate() {
    if (!prompt.trim()) { toast.error('Escreva a frase/descrição.'); return; }
    if (selected.length === 0) { toast.error('Escolha pelo menos um modelo.'); return; }
    setRunning(true);
    const initial: GenResult[] = selected.map((m) => ({ model: m, loading: true }));
    setResults(initial);

    await Promise.all(selected.map(async (model) => {
      try {
        const isGpt = model.startsWith('gpt-image');
        const res = await edge.generateImage({
          prompt, aspect_ratio: aspect, style_hint: STYLE_HINT, model,
          ...(isGpt ? { quality } : {}),
        });
        const dataUrl = `data:${res.mime_type};base64,${res.image_base64}`;
        const cost = res.cost_usd ?? 0;
        // Grava o trial (placar de custo/aprovações). user_id sai do default auth.uid().
        const { data: ins } = await supabase
          .from('image_model_trials')
          .insert({ model, prompt: prompt.slice(0, 500), cost_usd: cost, tokens_input: res.tokens_input ?? null, tokens_output: res.tokens_output ?? null, approved: false })
          .select('id').single();
        setResults((cur) => cur.map((r) => r.model === model
          ? { ...r, loading: false, dataUrl, cost, tokensOut: res.tokens_output, trialId: ins?.id }
          : r));
      } catch (e) {
        setResults((cur) => cur.map((r) => r.model === model
          ? { ...r, loading: false, error: (e as Error).message }
          : r));
      }
    }));

    setRunning(false);
    void loadLeaderboard();
  }

  async function approve(model: string, trialId?: string) {
    if (!trialId) return;
    const { error } = await supabase.from('image_model_trials').update({ approved: true }).eq('id', trialId);
    if (error) { toast.error('Falha ao aprovar.'); return; }
    setResults((cur) => cur.map((r) => (r.model === model ? { ...r, approved: true } : r)));
    toast.success('Aprovada — contabilizada no placar.');
    void loadLeaderboard();
  }

  const labelOf = (id: string) => MODELS.find((m) => m.id === id)?.label ?? id;
  const fmt = (n: number) => `$${n.toFixed(4)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ImageIcon className="h-6 w-6 text-accent" /> Teste de modelos de imagem
        </h1>
        <p className="text-sm text-muted-foreground">
          Mesma frase nos modelos em disputa, lado a lado, com custo real. Aprove a melhor de cada rodada — no fim da semana o placar + o /custos decidem.
        </p>
      </div>

      {/* Controles */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Frase / descrição da imagem</Label>
            <textarea
              id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Proporção</Label>
              <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="block rounded-md border border-input bg-background p-2 text-sm">
                <option value="3:4">Retrato 3:4 (feed)</option>
                <option value="1:1">Quadrado 1:1</option>
                <option value="16:9">Paisagem 16:9</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Qualidade (só GPT)</Label>
              <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} className="block rounded-md border border-input bg-background p-2 text-sm">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Modelos na rodada</Label>
            <div className="flex flex-wrap gap-2">
              {MODELS.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleModel(m.id)} type="button"
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted-foreground hover:bg-accent/5'}`}>
                    {on ? <Check className="mr-1 inline h-3 w-3" /> : null}{m.label} <span className="opacity-60">· {m.provider}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Button onClick={generate} disabled={running} variant="accent">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            {running ? 'Gerando...' : 'Gerar nos modelos'}
          </Button>
        </CardContent>
      </Card>

      {/* Resultados lado a lado */}
      {results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <Card key={r.model} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{labelOf(r.model)}</span>
                  {r.cost != null && <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><DollarSign className="h-3 w-3" />{fmt(r.cost)}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md bg-secondary/20">
                  {r.loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    : r.error ? <p className="p-3 text-center text-[11px] text-destructive">{r.error}</p>
                    : r.dataUrl ? <img src={r.dataUrl} alt={r.model} className="h-full w-full object-cover" />
                    : null}
                </div>
                {r.tokensOut != null && <p className="text-[10px] text-muted-foreground">{r.tokensOut} tokens de imagem</p>}
                {r.dataUrl && (
                  <Button size="sm" variant={r.approved ? 'secondary' : 'outline'} className="w-full" disabled={r.approved} onClick={() => approve(r.model, r.trialId)}>
                    <Check className="h-3.5 w-3.5" /> {r.approved ? 'Aprovada' : 'Aprovar esta'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Placar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-accent" /> Placar (todas as rodadas)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leader.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sem rodadas ainda. Gere e aprove pra montar o placar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr><th className="p-3">Modelo</th><th className="p-3">Aprovações</th><th className="p-3">Gerações</th><th className="p-3">Custo médio</th><th className="p-3">Custo total</th></tr>
                </thead>
                <tbody>
                  {leader.map((r, i) => (
                    <tr key={r.model} className={`border-b ${i === 0 ? 'bg-accent/5 font-medium' : ''}`}>
                      <td className="p-3">{i === 0 ? '🏆 ' : ''}{labelOf(r.model)}</td>
                      <td className="p-3">{r.aprovados}</td>
                      <td className="p-3">{r.gens}</td>
                      <td className="p-3">{fmt(r.custoMedio)}</td>
                      <td className="p-3">{fmt(r.custoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
