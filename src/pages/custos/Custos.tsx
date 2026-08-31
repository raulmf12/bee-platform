// Dashboard de custos de API — lê usage_events (RLS: só os próprios), estima o
// custo de cada geração pela tabela de preços (src/lib/pricing.ts) e agrega por
// período, produto e modelo. Mostra também o custo de CADA geração recente.

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { costOf, money, type UsageEvent } from '@/lib/pricing';

interface Row extends UsageEvent {
  id: number; created_at: string; metadata: Record<string, unknown> | null;
}

const PRODUCT_LABEL: Record<string, string> = { text: 'Texto', image: 'Imagem', 'image-search': 'Busca de imagem' };
const fnLabel = (r: Row): string => {
  const fn = r.metadata?.fn as string | undefined;
  return fn || PRODUCT_LABEL[r.product ?? ''] || r.product || '—';
};

export function Custos() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    supabase.from('usage_events')
      .select('id,provider,product,model,tokens_input,tokens_output,cost_usd,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data }) => { setRows((data ?? []) as Row[]); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    let today = 0, week = 0, month = 0, all = 0;
    const byProduct: Record<string, { cost: number; n: number }> = {};
    const byModel: Record<string, { cost: number; n: number }> = {};
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    for (const r of rows) {
      const c = costOf(r);
      const t = new Date(r.created_at).getTime();
      all += c;
      if (t >= startToday.getTime()) today += c;
      if (now - t <= 7 * DAY) week += c;
      if (now - t <= 30 * DAY) month += c;
      const p = r.product ?? '—';
      (byProduct[p] ??= { cost: 0, n: 0 }); byProduct[p].cost += c; byProduct[p].n += 1;
      const m = r.model ?? '—';
      (byModel[m] ??= { cost: 0, n: 0 }); byModel[m].cost += c; byModel[m].n += 1;
    }
    return { today, week, month, all, byProduct, byModel, count: rows.length };
  }, [rows]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <DollarSign className="h-6 w-6 text-accent" /> Custos de API
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimativa de custo de cada geração (texto, imagem e busca), pela tabela de preços em <code>src/lib/pricing.ts</code>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Atualizar
        </Button>
      </header>

      {/* Totais por período */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Hoje', v: stats.today },
          { label: 'Últimos 7 dias', v: stats.week },
          { label: 'Últimos 30 dias', v: stats.month },
          { label: `Total (${stats.count})`, v: stats.all },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-display text-2xl font-bold">{money(s.v)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Por produto e por modelo */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Por produto</h3>
            <div className="space-y-2">
              {Object.entries(stats.byProduct).sort((a, b) => b[1].cost - a[1].cost).map(([p, v]) => (
                <div key={p} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px]">{v.n}</Badge>{PRODUCT_LABEL[p] ?? p}</span>
                  <b>{money(v.cost)}</b>
                </div>
              ))}
              {stats.count === 0 && <p className="text-xs text-muted-foreground">Sem uso registrado ainda.</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Por modelo</h3>
            <div className="space-y-2">
              {Object.entries(stats.byModel).sort((a, b) => b[1].cost - a[1].cost).map(([m, v]) => (
                <div key={m} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px]">{v.n}</Badge><span className="truncate">{m}</span></span>
                  <b>{money(v.cost)}</b>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custo de cada geração recente */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-4"><h3 className="text-sm font-semibold">Gerações recentes</h3></div>
          <div className="max-h-[52vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Quando</th>
                  <th className="p-3 font-medium">Geração</th>
                  <th className="p-3 font-medium">Modelo</th>
                  <th className="p-3 text-right font-medium">Tokens</th>
                  <th className="p-3 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-3">{fnLabel(r)}</td>
                    <td className="p-3 text-muted-foreground">{r.model ?? '—'}</td>
                    <td className="whitespace-nowrap p-3 text-right text-muted-foreground">{r.product === 'text' ? `${(r.tokens_input ?? 0) + (r.tokens_output ?? 0)}` : '—'}</td>
                    <td className="p-3 text-right font-semibold">{money(costOf(r))}</td>
                  </tr>
                ))}
                {loading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma geração registrada ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Os preços são estimativas configuráveis em <code>src/lib/pricing.ts</code>. Novas gerações já gravam o custo calculado; as antigas são estimadas pelos tokens.
      </p>
    </div>
  );
}
