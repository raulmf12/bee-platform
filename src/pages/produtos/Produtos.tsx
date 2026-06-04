// Lista + CRUD de produtos Bee.

import { useEffect, useState } from 'react';
import { Loader2, Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { productApi } from '@/lib/api';
import type { BeeProduct, ProductStatus } from '@/types';
import { toast } from 'sonner';

const STATUS_LABELS: Record<ProductStatus, string> = {
  em_construcao: 'Em construção',
  pre_launch: 'Pré-lançamento',
  launching: 'Lançamento',
  post_launch: 'Pós-lançamento',
  evergreen: 'Evergreen',
  archived: 'Arquivado',
};

const STATUS_COLORS: Record<ProductStatus, string> = {
  em_construcao: 'bg-muted text-muted-foreground',
  pre_launch: 'bg-amber-500/15 text-amber-700',
  launching: 'bg-emerald-500/15 text-emerald-700',
  post_launch: 'bg-blue-500/15 text-blue-700',
  evergreen: 'bg-accent/20 text-accent-foreground',
  archived: 'bg-muted text-muted-foreground/60',
};

interface FormState {
  slug: string;
  name: string;
  description: string;
  type: string;
  status: ProductStatus;
  promessa: string;
  pre_launch_start: string;
  launch_date: string;
  post_launch_end: string;
}

const EMPTY: FormState = {
  slug: '', name: '', description: '', type: 'curso',
  status: 'evergreen', promessa: '',
  pre_launch_start: '', launch_date: '', post_launch_end: '',
};

export function Produtos() {
  const [products, setProducts] = useState<BeeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await productApi.list();
      setProducts(data);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openNew() {
    setForm(EMPTY);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(p: BeeProduct) {
    if (p.is_system) {
      toast.info('Produtos do sistema não podem ser editados.');
      return;
    }
    setForm({
      slug: p.slug,
      name: p.name,
      description: p.description ?? '',
      type: p.type ?? '',
      status: p.status,
      promessa: p.promessa ?? '',
      pre_launch_start: p.pre_launch_start ?? '',
      launch_date: p.launch_date ?? '',
      post_launch_end: p.post_launch_end ?? '',
    });
    setEditingId(p.id);
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nome e slug obrigatorios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        pre_launch_start: form.pre_launch_start || null,
        launch_date: form.launch_date || null,
        post_launch_end: form.post_launch_end || null,
      };
      if (editingId) {
        await productApi.update(editingId, payload as unknown as Partial<BeeProduct>);
      } else {
        await productApi.create(payload as unknown as Partial<BeeProduct>);
      }
      toast.success('Produto salvo');
      setDialogOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: BeeProduct) {
    if (p.is_system) return;
    if (!confirm(`Apagar "${p.name}"?`)) return;
    try {
      await productApi.delete(p.id);
      toast.success('Removido');
      await load();
    } catch (e) {
      toast.error('Erro ao apagar');
      console.error(e);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-accent" />
            <h1 className="font-display text-3xl font-bold">Produtos</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Produtos vinculáveis às linhas editoriais. A IA referencia o produto no contexto de geração.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="accent" onClick={openNew}>
              <Plus className="h-4 w-4" /> Novo produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar' : 'Novo'} produto</DialogTitle>
              <DialogDescription>
                Vincule a um lançamento ou marque como evergreen.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="slug">Slug</Label>
                  <Input id="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="type">Tipo</Label>
                  <Input id="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="curso, mentoria, masterclass..." />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="desc">Descrição</Label>
                <Textarea id="desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prom">Promessa principal</Label>
                <Input id="prom" value={form.promessa} onChange={(e) => setForm({ ...form, promessa: e.target.value })} placeholder="Ex: Liderar com mais sentido, menos esforco e mais impacto." />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProductStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as ProductStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="prelaunch">Pré-lançamento início</Label>
                  <Input id="prelaunch" type="date" value={form.pre_launch_start} onChange={(e) => setForm({ ...form, pre_launch_start: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="launch">Lançamento</Label>
                  <Input id="launch" type="date" value={form.launch_date} onChange={(e) => setForm({ ...form, launch_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="postlaunch">Pós-lançamento fim</Label>
                  <Input id="postlaunch" type="date" value={form.post_launch_end} onChange={(e) => setForm({ ...form, post_launch_end: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button variant="accent" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="hover:border-accent/40 transition-colors cursor-pointer" onClick={() => openEdit(p)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{p.name}</p>
                  {p.is_system && <Badge variant="outline" className="text-[9px]">oficial</Badge>}
                </div>
                {p.description && <p className="text-xs text-muted-foreground line-clamp-3">{p.description}</p>}
                <div className="flex items-center justify-between pt-2">
                  <Badge variant="secondary" className={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                  {!p.is_system && (
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); void remove(p); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
