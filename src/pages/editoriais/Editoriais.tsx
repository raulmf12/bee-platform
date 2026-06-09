// Lista + CRUD dos 8 pilares editoriais (bee_editorials).
// Editar os oficiais (is_system) e criar novos. O que for salvo aqui entra
// automaticamente na geracao (generate-content le por slug) e na selecao de
// editorial dos posts (beeApi.editorials()).

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react';
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
import { beeApi } from '@/lib/api';
import type { BeeEditorial } from '@/types';
import { toast } from 'sonner';

const DEFAULT_SEQUENCE = ['Reconhecimento', 'Desconforto', 'Insight', 'Implicacao'];

interface FormState {
  slug: string;
  name: string;
  description: string;
  frequency_hint: string;
  structure_template: string;
  emotional_sequence: string; // 1 item por linha na UI
  is_active: boolean;
}

const EMPTY: FormState = {
  slug: '',
  name: '',
  description: '',
  frequency_hint: '',
  structure_template: '',
  emotional_sequence: DEFAULT_SEQUENCE.join('\n'),
  is_active: true,
};

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function Editoriais() {
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState<BeeEditorial | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = editing !== null;

  async function load() {
    setLoading(true);
    try {
      const data = await beeApi.listEditorials();
      setEditorials(data);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar editoriais');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const nextPosition = useMemo(
    () => editorials.reduce((max, e) => Math.max(max, e.position ?? 0), 0) + 1,
    [editorials],
  );

  function openNew() {
    setForm(EMPTY);
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(ed: BeeEditorial) {
    setForm({
      slug: ed.slug,
      name: ed.name,
      description: ed.description ?? '',
      frequency_hint: ed.frequency_hint ?? '',
      structure_template: ed.structure_template ?? '',
      emotional_sequence: (ed.emotional_sequence ?? []).join('\n'),
      is_active: ed.is_active,
    });
    setEditing(ed);
    setDialogOpen(true);
  }

  async function save() {
    const name = form.name.trim();
    const slug = (isEdit ? form.slug : slugify(form.slug || form.name)).trim();
    if (!name || !slug) {
      toast.error('Nome e slug sao obrigatorios');
      return;
    }
    const sequence = form.emotional_sequence
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      const payload: Partial<BeeEditorial> = {
        name,
        description: form.description.trim() || undefined,
        frequency_hint: form.frequency_hint.trim() || undefined,
        structure_template: form.structure_template.trim() || undefined,
        emotional_sequence: sequence.length ? sequence : undefined,
        is_active: form.is_active,
      };
      if (isEdit && editing) {
        await beeApi.updateEditorial(editing.id, payload);
      } else {
        // slug so na criacao (travado depois); position no fim da lista.
        await beeApi.createEditorial({ ...payload, slug, position: nextPosition });
      }
      toast.success('Editorial salvo');
      setDialogOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar editorial');
    } finally {
      setSaving(false);
    }
  }

  async function remove(ed: BeeEditorial) {
    if (ed.is_system) {
      toast.info('Editoriais oficiais nao podem ser apagados.');
      return;
    }
    if (!confirm(`Apagar "${ed.name}"? O arsenal e os exemplos ligados a ele tambem serao removidos.`)) return;
    try {
      await beeApi.deleteEditorial(ed.id);
      toast.success('Editorial removido');
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao apagar');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-accent" />
            <h1 className="font-display text-3xl font-bold">Editoriais</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Os pilares de conteúdo da Bee. A IA usa o nome, a descrição, a estrutura e a sequência
            emocional de cada editorial pra gerar os posts. O que você editar aqui entra na geração na hora.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="accent" onClick={openNew}>
              <Plus className="h-4 w-4" /> Novo editorial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{isEdit ? 'Editar' : 'Novo'} editorial</DialogTitle>
              <DialogDescription>
                {isEdit
                  ? 'O slug é fixo. Ajuste os campos de conteúdo abaixo.'
                  : 'Defina o slug uma vez (fica imutável depois) e os campos de conteúdo.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Diagnóstico Sistêmico"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    disabled={isEdit}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                    placeholder="diagnostico-sistemico"
                  />
                  {isEdit && (
                    <p className="text-[11px] text-muted-foreground">Travado — referenciado por arsenal, exemplos e posts.</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="desc">Descrição (essência do editorial)</Label>
                <Textarea
                  id="desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="O que é esse editorial, em uma ou duas frases."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="freq">Frequência sugerida</Label>
                <Input
                  id="freq"
                  value={form.frequency_hint}
                  onChange={(e) => setForm({ ...form, frequency_hint: e.target.value })}
                  placeholder="Ex: 1-2x por semana"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="struct">Estrutura obrigatória (template)</Label>
                <Textarea
                  id="struct"
                  rows={3}
                  value={form.structure_template}
                  onChange={(e) => setForm({ ...form, structure_template: e.target.value })}
                  placeholder="Fenômeno reconhecível → analogia da natureza → virada sistêmica → pergunta."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seq">Sequência emocional (1 por linha)</Label>
                <Textarea
                  id="seq"
                  rows={4}
                  value={form.emotional_sequence}
                  onChange={(e) => setForm({ ...form, emotional_sequence: e.target.value })}
                  placeholder={'Reconhecimento\nDesconforto\nInsight\nImplicação'}
                />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.is_active ? 'active' : 'inactive'}
                  onValueChange={(v) => setForm({ ...form, is_active: v === 'active' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo (disponível na geração)</SelectItem>
                    <SelectItem value="inactive">Inativo (oculto da geração)</SelectItem>
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
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {editorials.map((ed) => (
            <Card
              key={ed.id}
              className={`cursor-pointer transition-colors hover:border-accent/40 ${ed.is_active ? '' : 'opacity-60'}`}
              onClick={() => openEdit(ed)}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{ed.name}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    {ed.is_system && <Badge variant="outline" className="text-[9px]">oficial</Badge>}
                    {!ed.is_active && <Badge variant="secondary" className="text-[9px]">inativo</Badge>}
                  </div>
                </div>
                {ed.description && <p className="line-clamp-3 text-xs text-muted-foreground">{ed.description}</p>}
                <div className="flex items-center justify-between pt-2">
                  {ed.frequency_hint
                    ? <span className="text-[11px] text-muted-foreground">{ed.frequency_hint}</span>
                    : <span />}
                  {!ed.is_system && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); void remove(ed); }}
                    >
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
