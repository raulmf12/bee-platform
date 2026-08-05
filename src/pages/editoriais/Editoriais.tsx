// Lista + CRUD dos 8 pilares editoriais (bee_editorials).
// Editar os oficiais (is_system) e criar novos. O que for salvo aqui entra
// automaticamente na geracao (generate-content le por slug) e na selecao de
// editorial dos posts (beeApi.editorials()).

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Sparkles, Trash2, Users } from 'lucide-react';
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
import { edge } from '@/lib/edge';
import type { BeeAudience, BeeEditorial, BeeExamplePost } from '@/types';
import { toast } from 'sonner';

const DEFAULT_SEQUENCE = ['Reconhecimento', 'Desconforto', 'Insight', 'Implicacao'];

interface FormState {
  slug: string;
  name: string;
  description: string;
  objetivo: string;
  tom: string;
  fazer: string;   // 1 por linha
  evitar: string;  // 1 por linha
  temas: string;   // 1 por linha
  frequency_hint: string;
  structure_template: string;
  emotional_sequence: string; // 1 item por linha na UI
  color: string;              // cor do card na Agenda (hex)
  is_active: boolean;
  // público-alvo (perfil próprio) — objecoes/gatilhos como texto 1/linha na UI
  audience: { quem: string; dor: string; desejo: string; objecoes: string; gatilhos: string; linguagem: string };
}

const EMPTY_AUDIENCE = { quem: '', dor: '', desejo: '', objecoes: '', gatilhos: '', linguagem: '' };

const EMPTY: FormState = {
  slug: '',
  name: '',
  description: '',
  objetivo: '',
  tom: '',
  fazer: '',
  evitar: '',
  temas: '',
  frequency_hint: '',
  structure_template: '',
  emotional_sequence: DEFAULT_SEQUENCE.join('\n'),
  color: '#F5B301',
  is_active: true,
  audience: { ...EMPTY_AUDIENCE },
};

const lines2arr = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const arr2lines = (a?: string[]) => (a ?? []).join('\n');

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
  const [aiFilling, setAiFilling] = useState(false);
  const [examples, setExamples] = useState<BeeExamplePost[]>([]);
  const [newEx, setNewEx] = useState({ image_quote: '', caption: '', why_good: '' });

  const isEdit = editing !== null;

  function setAudience(patch: Partial<FormState['audience']>) {
    setForm((f) => ({ ...f, audience: { ...f.audience, ...patch } }));
  }

  // A IA propõe o público a partir do que já foi descrito. Você revisa e salva.
  async function fillAudienceWithAI() {
    if (!form.name.trim() && !form.description.trim()) {
      toast.error('Descreva o editorial primeiro (nome ou descrição).');
      return;
    }
    setAiFilling(true);
    try {
      const r = await edge.suggestAudience({
        name: form.name, description: form.description, objetivo: form.objetivo, tom: form.tom,
      });
      setAudience({
        quem: r.audience.quem, dor: r.audience.dor, desejo: r.audience.desejo,
        objecoes: (r.audience.objecoes ?? []).join('\n'),
        gatilhos: (r.audience.gatilhos ?? []).join('\n'),
        linguagem: r.audience.linguagem,
      });
      toast.success('Público proposto — revise e ajuste antes de salvar');
    } catch (e) {
      console.error(e);
      toast.error(`IA falhou: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setAiFilling(false);
    }
  }

  async function loadExamples(slug: string) {
    try { setExamples(await beeApi.examplesForEditorial(slug)); }
    catch (e) { console.error(e); setExamples([]); }
  }

  async function addExample() {
    if (!editing) { toast.error('Salve o editorial primeiro pra anexar exemplos.'); return; }
    if (!newEx.image_quote.trim()) { toast.error('A frase do exemplo é obrigatória.'); return; }
    try {
      await beeApi.createExample({
        editorial_slug: editing.slug,
        image_quote: newEx.image_quote.trim(),
        caption: newEx.caption.trim(),
        why_good: newEx.why_good.trim() || undefined,
        position: examples.length + 1,
      });
      setNewEx({ image_quote: '', caption: '', why_good: '' });
      await loadExamples(editing.slug);
      toast.success('Exemplo adicionado — entra no few-shot da geração');
    } catch (e) { console.error(e); toast.error('Erro ao adicionar exemplo'); }
  }

  async function removeExample(id: string) {
    try {
      await beeApi.deleteExample(id);
      setExamples((cur) => cur.filter((x) => x.id !== id));
    } catch (e) { console.error(e); toast.error('Erro ao remover'); }
  }

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
    setExamples([]);
    setNewEx({ image_quote: '', caption: '', why_good: '' });
    setDialogOpen(true);
  }

  function openEdit(ed: BeeEditorial) {
    const a = ed.audience ?? {};
    setForm({
      slug: ed.slug,
      name: ed.name,
      description: ed.description ?? '',
      objetivo: ed.objetivo ?? '',
      tom: ed.tom ?? '',
      fazer: arr2lines(ed.fazer),
      evitar: arr2lines(ed.evitar),
      temas: arr2lines(ed.temas),
      frequency_hint: ed.frequency_hint ?? '',
      structure_template: ed.structure_template ?? '',
      emotional_sequence: (ed.emotional_sequence ?? []).join('\n'),
      color: ed.color ?? '#F5B301',
      is_active: ed.is_active,
      audience: {
        quem: a.quem ?? '', dor: a.dor ?? '', desejo: a.desejo ?? '',
        objecoes: arr2lines(a.objecoes), gatilhos: arr2lines(a.gatilhos), linguagem: a.linguagem ?? '',
      },
    });
    setEditing(ed);
    setNewEx({ image_quote: '', caption: '', why_good: '' });
    void loadExamples(ed.slug);
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

    // Público-alvo: só grava se ao menos um campo foi preenchido.
    const a = form.audience;
    const audienceFilled = [a.quem, a.dor, a.desejo, a.objecoes, a.gatilhos, a.linguagem].some((v) => v.trim());
    const audience: BeeAudience = audienceFilled ? {
      quem: a.quem.trim() || undefined,
      dor: a.dor.trim() || undefined,
      desejo: a.desejo.trim() || undefined,
      objecoes: lines2arr(a.objecoes),
      gatilhos: lines2arr(a.gatilhos),
      linguagem: a.linguagem.trim() || undefined,
    } : {};

    setSaving(true);
    try {
      const payload: Partial<BeeEditorial> = {
        name,
        description: form.description.trim() || undefined,
        objetivo: form.objetivo.trim() || undefined,
        tom: form.tom.trim() || undefined,
        fazer: lines2arr(form.fazer),
        evitar: lines2arr(form.evitar),
        temas: lines2arr(form.temas),
        frequency_hint: form.frequency_hint.trim() || undefined,
        structure_template: form.structure_template.trim() || undefined,
        emotional_sequence: sequence.length ? sequence : undefined,
        color: form.color,
        is_active: form.is_active,
        audience,
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEdit ? 'Editar' : 'Novo'} editorial</DialogTitle>
              <DialogDescription>
                Quanto mais detalhe, melhor a IA gera. O que você salvar entra na geração na hora.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {/* ---------- Identidade ---------- */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Diagnóstico Sistêmico" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="slug">Slug</Label>
                  <Input id="slug" value={form.slug} disabled={isEdit}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                    placeholder="diagnostico-sistemico" />
                  {isEdit && <p className="text-[11px] text-muted-foreground">Travado — referenciado por arsenal, exemplos e posts.</p>}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="color">Cor na Agenda</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="color"
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground">
                    Define a cor dos cards deste editorial no calendário.
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="desc">Descrição (essência do editorial)</Label>
                <Textarea id="desc" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="O que é esse editorial, em uma ou duas frases." />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="obj">Objetivo (o que quer provocar)</Label>
                  <Textarea id="obj" rows={2} value={form.objetivo}
                    onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
                    placeholder="Ex: fazer o líder ver o sistema por trás do sintoma." />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tom">Tom de voz deste editorial</Label>
                  <Textarea id="tom" rows={2} value={form.tom}
                    onChange={(e) => setForm({ ...form, tom: e.target.value })}
                    placeholder="Ex: incisivo, sem suavizar; provoca sem ofender." />
                </div>
              </div>

              {/* ---------- Regras ---------- */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Sempre faz (1 por linha)</Label>
                  <Textarea rows={3} value={form.fazer}
                    onChange={(e) => setForm({ ...form, fazer: e.target.value })}
                    placeholder={'Abre com um fenômeno reconhecível\nUsa analogia da natureza'} className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label>Nunca faz (1 por linha)</Label>
                  <Textarea rows={3} value={form.evitar}
                    onChange={(e) => setForm({ ...form, evitar: e.target.value })}
                    placeholder={'Culpar a pessoa\nDar receita de bolo'} className="text-xs" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Estrutura obrigatória</Label>
                  <Textarea rows={3} value={form.structure_template}
                    onChange={(e) => setForm({ ...form, structure_template: e.target.value })}
                    placeholder="Fenômeno → analogia → virada sistêmica → pergunta." className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label>Sequência emocional (1 por linha)</Label>
                  <Textarea rows={3} value={form.emotional_sequence}
                    onChange={(e) => setForm({ ...form, emotional_sequence: e.target.value })}
                    placeholder={'Reconhecimento\nDesconforto\nInsight'} className="text-xs" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Temas recorrentes (1 por linha)</Label>
                  <Textarea rows={2} value={form.temas}
                    onChange={(e) => setForm({ ...form, temas: e.target.value })}
                    placeholder={'Autonomia\nPonto único de falha'} className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="freq">Frequência sugerida</Label>
                  <Input id="freq" value={form.frequency_hint}
                    onChange={(e) => setForm({ ...form, frequency_hint: e.target.value })}
                    placeholder="Ex: 1-2x por semana" />
                </div>
              </div>

              {/* ---------- Público-alvo deste editorial ---------- */}
              <div className="space-y-3 rounded-md border border-accent/30 bg-accent/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Users className="h-4 w-4 text-accent" /> Público-alvo deste editorial
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void fillAudienceWithAI()} disabled={aiFilling}>
                    {aiFilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Preencher com IA
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Descreva quem este pilar quer alcançar — ou deixe a IA propor a partir da descrição.
                  É aditivo ao público identificado/incomodado.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Quem é</Label>
                    <Textarea rows={2} value={form.audience.quem} onChange={(e) => setAudience({ quem: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dor central</Label>
                    <Textarea rows={2} value={form.audience.dor} onChange={(e) => setAudience({ dor: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Desejo</Label>
                    <Textarea rows={2} value={form.audience.desejo} onChange={(e) => setAudience({ desejo: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Linguagem dela</Label>
                    <Textarea rows={2} value={form.audience.linguagem} onChange={(e) => setAudience({ linguagem: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Objeções (1 por linha)</Label>
                    <Textarea rows={3} value={form.audience.objecoes} onChange={(e) => setAudience({ objecoes: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gatilhos (1 por linha)</Label>
                    <Textarea rows={3} value={form.audience.gatilhos} onChange={(e) => setAudience({ gatilhos: e.target.value })} className="text-xs" />
                  </div>
                </div>
              </div>

              {/* ---------- Exemplos (few-shot) ---------- */}
              <div className="space-y-2 rounded-md border border-border p-3">
                <span className="text-sm font-semibold">Exemplos deste editorial</span>
                <p className="text-[11px] text-muted-foreground">
                  Posts modelo — a IA usa como few-shot pra imitar o padrão.{' '}
                  {!isEdit && <span className="text-amber-600">Salve o editorial primeiro pra anexar exemplos.</span>}
                </p>
                {isEdit && (
                  <>
                    {examples.length > 0 && (
                      <ul className="space-y-1.5">
                        {examples.map((ex) => (
                          <li key={ex.id} className="flex items-start justify-between gap-2 rounded border border-border p-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{ex.image_quote}</p>
                              {ex.why_good && <p className="text-[10px] text-muted-foreground">{ex.why_good}</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => void removeExample(ex.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="space-y-1.5 rounded border border-dashed border-border p-2">
                      <Input value={newEx.image_quote} onChange={(e) => setNewEx({ ...newEx, image_quote: e.target.value })}
                        placeholder="Frase do post (a que vai na imagem)" className="h-8 text-xs" />
                      <Textarea rows={2} value={newEx.caption} onChange={(e) => setNewEx({ ...newEx, caption: e.target.value })}
                        placeholder="Legenda (opcional)" className="text-xs" />
                      <Input value={newEx.why_good} onChange={(e) => setNewEx({ ...newEx, why_good: e.target.value })}
                        placeholder="Por que é um bom exemplo (opcional)" className="h-8 text-xs" />
                      <Button variant="outline" size="sm" onClick={() => void addExample()}>
                        <Plus className="h-3.5 w-3.5" /> Adicionar exemplo
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.is_active ? 'active' : 'inactive'}
                  onValueChange={(v) => setForm({ ...form, is_active: v === 'active' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo (disponível na geração)</SelectItem>
                    <SelectItem value="inactive">Inativo (oculto da geração)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-1">
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
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: ed.color ?? '#94A3B8' }}
                      title="Cor na Agenda"
                    />
                    {ed.name}
                  </p>
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
