// CRUD de linhas editoriais.

import { useEffect, useState } from 'react';
import { Loader2, Plus, Play, Pause, Trash2, CalendarClock, FolderKanban } from 'lucide-react';
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
import { beeApi, editorialLinesApi, productApi } from '@/lib/api';
import type {
  BeeEditorial, BeeProduct, CampaignPhase, EditorialLine,
  EditorialLineStatus, FrequencyType, Platform, TargetAvatar,
} from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DAYS = [
  { n: 1, label: 'Seg' }, { n: 2, label: 'Ter' }, { n: 3, label: 'Qua' },
  { n: 4, label: 'Qui' }, { n: 5, label: 'Sex' }, { n: 6, label: 'Sáb' }, { n: 7, label: 'Dom' },
];

interface FormState {
  name: string;
  description: string;
  product_id?: string;
  editorial_slugs: string[];
  target_avatar: TargetAvatar;
  platforms: Platform[];
  campaign_phase: CampaignPhase;
  frequency_type: FrequencyType;
  frequency_days: number[];
  preferred_hour: number;
  start_date: string;
  end_date: string;
  briefing_base: string;
  theme: string;
  status: EditorialLineStatus;
}

const EMPTY: FormState = {
  name: '', description: '', editorial_slugs: [], target_avatar: 'ambos',
  platforms: ['linkedin'], campaign_phase: 'free',
  frequency_type: 'weekly', frequency_days: [1, 4], preferred_hour: 8,
  start_date: '', end_date: '', briefing_base: '', theme: '', status: 'draft',
};

export function LinhasEditoriais() {
  const [lines, setLines] = useState<EditorialLine[]>([]);
  const [products, setProducts] = useState<BeeProduct[]>([]);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [l, p, e] = await Promise.all([
        editorialLinesApi.list(),
        productApi.list(),
        beeApi.editorials(),
      ]);
      setLines(l); setProducts(p); setEditorials(e);
    } catch (e) {
      console.error(e); toast.error('Falha ao carregar');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function openNew() {
    setForm(EMPTY); setEditingId(null); setDialogOpen(true);
  }

  function openEdit(l: EditorialLine) {
    setForm({
      name: l.name, description: l.description ?? '',
      product_id: l.product_id ?? undefined,
      editorial_slugs: l.editorial_slugs, target_avatar: (l.target_avatar ?? 'ambos'),
      platforms: l.platforms, campaign_phase: l.campaign_phase,
      frequency_type: l.frequency_type, frequency_days: l.frequency_days ?? [1, 4],
      preferred_hour: l.preferred_hour, start_date: l.start_date ?? '', end_date: l.end_date ?? '',
      briefing_base: l.briefing_base ?? '', theme: l.theme ?? '', status: l.status,
    });
    setEditingId(l.id); setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim() || form.editorial_slugs.length === 0 || form.platforms.length === 0) {
      toast.error('Nome, editorial(is) e plataforma(s) obrigatorios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        product_id: form.product_id || null,
      };
      if (editingId) await editorialLinesApi.update(editingId, payload as unknown as Partial<EditorialLine>);
      else await editorialLinesApi.create(payload as unknown as Partial<EditorialLine>);
      toast.success('Linha salva');
      setDialogOpen(false); await load();
    } catch (e) {
      console.error(e); toast.error('Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function toggleStatus(l: EditorialLine) {
    const newStatus = l.status === 'active' ? 'paused' : 'active';
    await editorialLinesApi.update(l.id, { status: newStatus });
    toast.success(`Linha ${newStatus === 'active' ? 'ativada' : 'pausada'}`);
    await load();
  }

  async function remove(l: EditorialLine) {
    if (!confirm(`Apagar "${l.name}"? Os posts já gerados ficam, mas a linha some.`)) return;
    await editorialLinesApi.delete(l.id);
    toast.success('Removida');
    await load();
  }

  function toggleArray<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-accent" />
            <h1 className="font-display text-3xl font-bold">Linhas Editoriais</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Campanhas recorrentes. A IA gera posts automaticamente seguindo frequência, editoriais em rotação, e mantém continuidade entre os posts da linha.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="accent" onClick={openNew}>
              <Plus className="h-4 w-4" /> Nova linha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar' : 'Nova'} linha editorial</DialogTitle>
              <DialogDescription>
                Define editorial em rotação, frequência, alvo e produto vinculado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ln">Nome</Label>
                <Input id="ln" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Pré-lançamento Masterclass Jun26" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld">Descrição</Label>
                <Textarea id="ld" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Produto vinculado (opcional)</Label>
                  <Select value={form.product_id ?? 'none'} onValueChange={(v) => setForm({ ...form, product_id: v === 'none' ? undefined : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— nenhum —</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Fase da campanha</Label>
                  <Select value={form.campaign_phase} onValueChange={(v) => setForm({ ...form, campaign_phase: v as CampaignPhase })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Livre / sem fase</SelectItem>
                      <SelectItem value="pre_launch">Pré-lançamento</SelectItem>
                      <SelectItem value="launch">Lançamento</SelectItem>
                      <SelectItem value="post_launch">Pós-lançamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Editoriais em rotação</Label>
                <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto rounded-md border border-border p-2">
                  {editorials.map((e) => (
                    <label key={e.slug} className="flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={form.editorial_slugs.includes(e.slug)}
                        onChange={() => setForm({ ...form, editorial_slugs: toggleArray(form.editorial_slugs, e.slug) })}
                      />
                      {e.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Avatar alvo</Label>
                  <Select value={form.target_avatar} onValueChange={(v) => setForm({ ...form, target_avatar: v as TargetAvatar })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambos">Ambos</SelectItem>
                      <SelectItem value="identificado">O Identificado</SelectItem>
                      <SelectItem value="incomodado">O Incomodado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Plataformas</Label>
                  <div className="flex gap-2 pt-1">
                    {(['linkedin', 'instagram'] as Platform[]).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant={form.platforms.includes(p) ? 'accent' : 'outline'}
                        size="sm"
                        onClick={() => setForm({ ...form, platforms: toggleArray(form.platforms, p) })}
                        className="capitalize"
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Frequência</Label>
                  <Select value={form.frequency_type} onValueChange={(v) => setForm({ ...form, frequency_type: v as FrequencyType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal (dias específicos)</SelectItem>
                      <SelectItem value="daily">Diária</SelectItem>
                      <SelectItem value="manual">Manual (sem auto-gerar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hr">Hora preferida</Label>
                  <Input id="hr" type="number" min={0} max={23} value={form.preferred_hour}
                    onChange={(e) => setForm({ ...form, preferred_hour: parseInt(e.target.value) || 8 })} />
                </div>
              </div>

              {(form.frequency_type === 'weekly') && (
                <div className="space-y-1">
                  <Label>Dias da semana</Label>
                  <div className="flex gap-1 flex-wrap">
                    {DAYS.map((d) => (
                      <Button
                        key={d.n}
                        type="button"
                        size="sm"
                        variant={form.frequency_days.includes(d.n) ? 'accent' : 'outline'}
                        onClick={() => setForm({ ...form, frequency_days: toggleArray(form.frequency_days, d.n).sort() })}
                      >
                        {d.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sd">Início</Label>
                  <Input id="sd" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ed">Fim</Label>
                  <Input id="ed" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="theme">Tema / foco editorial</Label>
                <Input id="theme" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="exaustão silenciosa, autorresponsabilidade..." />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bb">Briefing base (vai em todo post da linha)</Label>
                <Textarea id="bb" rows={4} value={form.briefing_base} onChange={(e) => setForm({ ...form, briefing_base: e.target.value })} placeholder="Contexto persistente que orienta toda a linha. Ex: 'Líderes seniores em conflito interno entre sucesso aparente e vazio crescente.'" />
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EditorialLineStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho (não gera)</SelectItem>
                    <SelectItem value="active">Ativa (gera no horário)</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="ended">Encerrada</SelectItem>
                  </SelectContent>
                </Select>
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
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : lines.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderKanban className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma linha. Cria a primeira.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lines.map((l) => (
            <Card key={l.id} className="hover:border-accent/40 transition-colors cursor-pointer" onClick={() => openEdit(l)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{l.name}</p>
                    {l.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{l.description}</p>}
                  </div>
                  <Badge variant="secondary" className={cn(
                    l.status === 'active' && 'bg-emerald-500/15 text-emerald-700',
                    l.status === 'paused' && 'bg-amber-500/15 text-amber-700',
                    l.status === 'draft' && 'bg-muted',
                    l.status === 'ended' && 'bg-muted text-muted-foreground/60',
                  )}>{l.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.platforms.map((p) => <Badge key={p} variant="outline" className="text-[9px] capitalize">{p}</Badge>)}
                  <Badge variant="secondary" className="text-[9px]">{l.editorial_slugs.length} editoriais</Badge>
                  {l.campaign_phase !== 'free' && (
                    <Badge variant="secondary" className="text-[9px] bg-accent/20">{l.campaign_phase}</Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p>Posts gerados: <strong>{l.posts_generated_count}</strong></p>
                  {l.next_run_at && <p>Próximo: {new Date(l.next_run_at).toLocaleString('pt-BR')}</p>}
                </div>
                <div className="flex justify-end gap-1 pt-1 border-t border-border">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void toggleStatus(l); }}>
                    {l.status === 'active' ? <><Pause className="h-3 w-3" /> Pausar</> : <><Play className="h-3 w-3" /> Ativar</>}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); void remove(l); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
