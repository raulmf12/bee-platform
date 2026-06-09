// Arsenal — biblioteca viva de material por editorial.
// Mostra uso/frescor/ativo de cada item, permite CRUD à mão, e lista os
// exemplos few-shot. O que estiver 'ativo' entra na rotação da geração.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { arsenalApi, beeApi, exampleApi } from '@/lib/api';
import type { BeeArsenalItem, BeeEditorial, BeeExamplePost } from '@/types';
import { toast } from 'sonner';

function freshness(lastUsedAt?: string | null): string {
  if (!lastUsedAt) return 'nunca usado';
  const days = Math.floor((Date.now() - new Date(lastUsedAt).getTime()) / 86400000);
  if (days <= 0) return 'usado hoje';
  if (days === 1) return 'usado ontem';
  return `usado há ${days}d`;
}

interface ArsenalForm {
  editorial_slug: string;
  type: string;
  title: string;
  summary: string;
  details: string;
  source: string;
}
const EMPTY: ArsenalForm = { editorial_slug: '', type: 'insight', title: '', summary: '', details: '', source: '' };

export function Arsenal() {
  const [items, setItems] = useState<BeeArsenalItem[]>([]);
  const [examples, setExamples] = useState<BeeExamplePost[]>([]);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ArsenalForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterEd, setFilterEd] = useState<string>('all');

  async function load() {
    setLoading(true);
    try {
      const [ars, exs, eds] = await Promise.all([arsenalApi.list(), exampleApi.list(), beeApi.listEditorials()]);
      setItems(ars);
      setExamples(exs);
      setEditorials(eds);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar arsenal');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const edName = useMemo(() => {
    const m = new Map(editorials.map((e) => [e.slug, e.name]));
    return (slug?: string) => (slug ? m.get(slug) ?? slug : '—');
  }, [editorials]);

  const visibleItems = filterEd === 'all' ? items : items.filter((i) => i.editorial_slug === filterEd);

  function openNew() {
    setForm({ ...EMPTY, editorial_slug: editorials[0]?.slug ?? '' });
    setEditingId(null);
    setDialogOpen(true);
  }
  function openEdit(it: BeeArsenalItem) {
    setForm({
      editorial_slug: it.editorial_slug,
      type: it.type ?? 'insight',
      title: it.title,
      summary: it.summary ?? '',
      details: it.details ?? '',
      source: it.source ?? '',
    });
    setEditingId(it.id);
    setDialogOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.editorial_slug) {
      toast.error('Editorial e título obrigatórios');
      return;
    }
    setSaving(true);
    try {
      if (editingId) await arsenalApi.update(editingId, form);
      else await arsenalApi.create(form);
      toast.success('Item salvo');
      setDialogOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(it: BeeArsenalItem) {
    try {
      await arsenalApi.update(it.id, { is_active: !(it.is_active ?? true) });
      setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, is_active: !(it.is_active ?? true) } : x)));
    } catch (e) { console.error(e); toast.error('Erro'); }
  }
  async function removeItem(it: BeeArsenalItem) {
    if (!confirm(`Apagar "${it.title}"?`)) return;
    try { await arsenalApi.delete(it.id); setItems((c) => c.filter((x) => x.id !== it.id)); }
    catch (e) { console.error(e); toast.error('Erro ao apagar'); }
  }

  async function toggleExample(ex: BeeExamplePost) {
    try {
      await exampleApi.update(ex.id, { is_active: !(ex.is_active ?? true) });
      setExamples((cur) => cur.map((x) => (x.id === ex.id ? { ...x, is_active: !(ex.is_active ?? true) } : x)));
    } catch (e) { console.error(e); toast.error('Erro'); }
  }
  async function removeExample(ex: BeeExamplePost) {
    if (!confirm('Apagar este exemplo?')) return;
    try { await exampleApi.delete(ex.id); setExamples((c) => c.filter((x) => x.id !== ex.id)); }
    catch (e) { console.error(e); toast.error('Erro ao apagar'); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="h-6 w-6 text-accent" />
            <h1 className="font-display text-3xl font-bold">Arsenal</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            O material que alimenta a geração. A IA rotaciona os itens <span className="font-medium">ativos</span> por
            frescor (menos usados primeiro), pra cada post sair diferente.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="accent" onClick={openNew}><Plus className="h-4 w-4" /> Novo item</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{editingId ? 'Editar' : 'Novo'} item de arsenal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Editorial</Label>
                  <Select value={form.editorial_slug} onValueChange={(v) => setForm({ ...form, editorial_slug: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {editorials.map((e) => <SelectItem key={e.slug} value={e.slug}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="case, historia, framework, dado, insight" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Resumo</Label>
                <Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Detalhes</Label>
                <Textarea rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Fonte (opcional)</Label>
                <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button variant="accent" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs defaultValue="arsenal">
        <TabsList>
          <TabsTrigger value="arsenal">Itens ({items.length})</TabsTrigger>
          <TabsTrigger value="exemplos">Frases-exemplo ({examples.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="arsenal" className="mt-4 space-y-3">
          <div className="w-64">
            <Select value={filterEd} onValueChange={setFilterEd}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os editoriais</SelectItem>
                {editorials.map((e) => <SelectItem key={e.slug} value={e.slug}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : visibleItems.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum item. Crie um ou aprove sugestões na Curadoria.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((it) => (
                <Card key={it.id} className={it.is_active ?? true ? '' : 'opacity-55'}>
                  <CardContent className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openEdit(it)}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px]">{it.type}</Badge>
                        <span className="truncate text-sm font-medium">{it.title}</span>
                      </div>
                      {it.summary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.summary}</p>}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{edName(it.editorial_slug)}</span>
                        <span>·</span>
                        <span>{freshness(it.last_used_at)}</span>
                        <span>·</span>
                        <span>{it.usage_count ?? 0}× usado</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => void toggleActive(it)}>
                        {(it.is_active ?? true) ? 'Ativo' : 'Inativo'}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void removeItem(it)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="exemplos" className="mt-4 space-y-2">
          {examples.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma frase-exemplo. Aprove na Curadoria.</CardContent></Card>
          ) : (
            examples.map((ex) => (
              <Card key={ex.id} className={ex.is_active ?? true ? '' : 'opacity-55'}>
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{ex.image_quote}</p>
                    {ex.caption && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ex.caption}</p>}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{edName(ex.editorial_slug)}</span>
                      <span>·</span>
                      <span>{freshness(ex.last_used_at)}</span>
                      <span>·</span>
                      <span>{ex.usage_count ?? 0}× usado</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => void toggleExample(ex)}>
                      {(ex.is_active ?? true) ? 'Ativo' : 'Inativo'}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void removeExample(ex)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
