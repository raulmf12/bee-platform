// Simular público — /personas.
//
// Você conversa com PESSOAS da sua biblioteca de personas — gente com nome,
// idade, trabalho, história e memórias, ancorada no seu público real. A IA gera
// a pessoa a partir de um público-base + suas pistas; você edita e salva.
//
// Integrado ao ecossistema: puxe um post do kanban — a persona VÊ o post (a
// imagem renderizada vai pro modelo) e reage como reagiria no feed.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, ImageIcon, Loader2, Pencil, Plus, Send, Sparkles, Trash2, User, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { beeApi, personaApi, postApi } from '@/lib/api';
import { edge, type PersonaProfile } from '@/lib/edge';
import { renderPostImage } from '@/lib/templates/renderPost';
import type { BeeAvatar, BeeEditorial, BeePersona, UserPost } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// A pessoa vira o profile que o persona-chat consome.
function toProfile(p: BeePersona): PersonaProfile {
  return {
    nome: p.nome, idade: p.idade, cargo: p.cargo, empresa: p.empresa,
    historia: p.historia, rotina: p.rotina, personalidade: p.personalidade,
    memorias: p.memorias, valores: p.valores,
    dor: p.dor, desejo: p.desejo, objecoes: p.objecoes, gatilhos: p.gatilhos, linguagem: p.linguagem,
  };
}

interface Msg { role: 'user' | 'assistant'; content: string; post?: { title: string; quote?: string } }

export function Personas() {
  const [personas, setPersonas] = useState<BeePersona[]>([]);
  const [current, setCurrent] = useState<BeePersona | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attached, setAttached] = useState<{ post: UserPost; image: string | null } | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BeePersona | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const list = await personaApi.list();
      setPersonas(list);
      if (list[0] && !current) setCurrent(list[0]);
    } catch (e) { console.error(e); toast.error('Falha ao carregar personas'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  function pick(p: BeePersona) { setCurrent(p); setMessages([]); setAttached(null); }

  async function openPicker() {
    setPickerOpen(true);
    if (posts.length === 0) { try { setPosts(await postApi.list()); } catch (e) { console.error(e); } }
  }
  async function attach(post: UserPost) {
    setPickerOpen(false); setRendering(true);
    try {
      const size = (post.metadata?.canvas_size as 'square' | 'portrait' | 'landscape' | undefined) ?? 'portrait';
      const image = await renderPostImage(post.carousel_fabric_json?.[0], size);
      setAttached({ post, image });
      if (!image) toast.info('Anexei o texto do post (imagem não pôde renderizar).');
    } catch (e) { console.error(e); setAttached({ post, image: null }); }
    finally { setRendering(false); }
  }

  async function send(text: string) {
    const content = text.trim();
    if ((!content && !attached) || sending || !current) return;
    setInput('');
    const quote = (attached?.post.carousel_text as { quote?: string } | undefined)?.quote;
    const userMsg: Msg = {
      role: 'user', content: content || 'O que você acha deste post?',
      post: attached ? { title: attached.post.title ?? 'post', quote } : undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    const postPayload = attached ? { quote, caption: attached.post.caption ?? undefined, image_base64: attached.image ?? undefined } : undefined;
    setAttached(null); setSending(true);
    try {
      const res = await edge.personaChat({
        persona: toProfile(current),
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        post: postPayload,
      });
      setMessages((cur) => [...cur, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      console.error(e); toast.error(`Persona falhou: ${(e as Error).message.slice(0, 120)}`);
      setMessages((cur) => cur.slice(0, -1));
    } finally { setSending(false); }
  }

  function openNew() { setEditing(null); setEditorOpen(true); }
  function openEdit(p: BeePersona) { setEditing(p); setEditorOpen(true); }
  async function afterSave(saved: BeePersona) {
    setEditorOpen(false);
    await load();
    setCurrent(saved);
    setMessages([]);
  }
  async function removePersona(p: BeePersona) {
    if (!confirm(`Apagar ${p.nome}?`)) return;
    try {
      await personaApi.remove(p.id);
      setPersonas((cur) => cur.filter((x) => x.id !== p.id));
      if (current?.id === p.id) { setCurrent(null); setMessages([]); }
    } catch (e) { console.error(e); toast.error('Erro ao apagar'); }
  }

  if (loading) return <div className="py-20 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto flex h-full max-w-5xl gap-4 p-6 lg:p-8">
      {/* Biblioteca de personas */}
      <aside className="hidden w-64 shrink-0 flex-col gap-2 md:flex">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          <h1 className="font-display text-xl font-bold">Simular público</h1>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Converse com pessoas do seu público. Peça opinião, teste um gancho, puxe um post pra ela ver.
        </p>
        <Button variant="accent" size="sm" className="mt-1" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> Nova pessoa
        </Button>

        {personas.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Nenhuma pessoa ainda. Crie a primeira — a IA monta a partir de um público seu.
          </p>
        ) : (
          <div className="mt-1 space-y-1 overflow-y-auto">
            {personas.map((p) => (
              <div key={p.id}
                className={cn('group flex items-start gap-1 rounded-md border p-2 transition-colors',
                  current?.id === p.id ? 'border-accent bg-accent/15' : 'border-border hover:bg-secondary')}>
                <button onClick={() => pick(p)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="truncate text-xs font-semibold">{p.nome}{p.idade ? `, ${p.idade}` : ''}</span>
                  </div>
                  {p.cargo && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground"><Briefcase className="mr-0.5 inline h-2.5 w-2.5" />{p.cargo}</p>}
                </button>
                <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openEdit(p)} title="Editar" className="rounded p-0.5 hover:bg-secondary"><Pencil className="h-3 w-3" /></button>
                  <button onClick={() => void removePersona(p)} title="Apagar" className="rounded p-0.5 hover:bg-destructive/15"><Trash2 className="h-3 w-3 text-destructive" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Conversa */}
      <div className="flex flex-1 flex-col">
        {current ? (
          <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
            <User className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">
              {current.nome}{current.idade ? `, ${current.idade}` : ''}{current.cargo ? ` — ${current.cargo}` : ''}
            </span>
          </div>
        ) : (
          <div className="mb-2 border-b border-border pb-2 text-sm text-muted-foreground">
            Crie ou escolha uma pessoa à esquerda pra começar.
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-border bg-card/30 p-4">
          {!current ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma pessoa selecionada.</div>
          ) : messages.length === 0 ? (
            <div className="space-y-2 py-10 text-center text-sm text-muted-foreground">
              <p>Pergunte, peça opinião, ou puxe um post pra {current.nome.split(' ')[0]} reagir.</p>
              <p className="text-[11px]">Ela responde em personagem, com a vida e as memórias dela — e é honesta.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className="max-w-[85%] space-y-1.5">
                  {m.post && (
                    <div className="rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-[11px]">
                      <span className="flex items-center gap-1 font-medium"><ImageIcon className="h-3 w-3" /> Post mostrado</span>
                      {m.post.quote && <p className="mt-0.5 italic text-muted-foreground">“{m.post.quote.slice(0, 90)}”</p>}
                    </div>
                  )}
                  <div className={cn('rounded-2xl px-3.5 py-2 text-sm leading-snug',
                    m.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-secondary')}>
                    {m.content}
                  </div>
                </div>
              </div>
            ))
          )}
          {sending && <div className="flex justify-start"><div className="rounded-2xl bg-secondary px-3.5 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></div>}
          <div ref={endRef} />
        </div>

        {attached && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 p-2">
            {attached.image ? <img src={attached.image} alt="post" className="h-10 w-10 rounded object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{attached.post.title ?? 'Post'}</p>
              <p className="text-[10px] text-muted-foreground">Vai anexado à sua próxima pergunta</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAttached(null)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        )}

        <div className="mt-2 flex items-end gap-2">
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" title="Puxar um post do kanban"
                disabled={rendering || !current} onClick={() => void openPicker()}>
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Puxar um post do kanban</DialogTitle></DialogHeader>
              {posts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum post ainda.</p> : (
                <ul className="space-y-1.5">
                  {posts.slice(0, 30).map((p) => (
                    <li key={p.id}>
                      <button onClick={() => void attach(p)} className="w-full rounded-md border border-border p-2 text-left text-xs transition-colors hover:border-accent hover:bg-secondary">
                        <p className="truncate font-medium">{p.title || (p.carousel_text as { quote?: string })?.quote?.slice(0, 60) || 'Post sem título'}</p>
                        <p className="text-[10px] text-muted-foreground">{p.platform} · {p.status}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogContent>
          </Dialog>

          <Textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder={current ? `Pergunte à ${current.nome.split(' ')[0]}...` : 'Crie uma pessoa primeiro'}
            rows={2} className="resize-none" disabled={!current} />
          <Button variant="accent" size="icon" className="h-10 w-10 shrink-0"
            disabled={sending || !current || (!input.trim() && !attached)} onClick={() => void send(input)}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PersonaEditor open={editorOpen} onOpenChange={setEditorOpen} editing={editing} onSaved={afterSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor: cria/edita uma pessoa. "Gerar com IA" a partir de um público-base.
interface EditForm {
  nome: string; idade: string; cargo: string; empresa: string;
  historia: string; rotina: string; personalidade: string;
  memorias: string; valores: string;
  dor: string; desejo: string; objecoes: string; gatilhos: string; linguagem: string;
}
const EMPTY_EDIT: EditForm = {
  nome: '', idade: '', cargo: '', empresa: '', historia: '', rotina: '', personalidade: '',
  memorias: '', valores: '', dor: '', desejo: '', objecoes: '', gatilhos: '', linguagem: '',
};
const l2a = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const a2l = (a?: string[]) => (a ?? []).join('\n');

function PersonaEditor({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: BeePersona | null; onSaved: (p: BeePersona) => void;
}) {
  const [form, setForm] = useState<EditForm>(EMPTY_EDIT);
  const [bases, setBases] = useState<{ id: string; label: string; base: object }[]>([]);
  const [baseId, setBaseId] = useState<string>('');
  const [hints, setHints] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // carrega os públicos-base (avatares + públicos de editorial)
    void (async () => {
      try {
        const [avatars, editorials] = await Promise.all([beeApi.avatars(), beeApi.editorials()]);
        const opts: { id: string; label: string; base: object }[] = [
          ...avatars.map((a: BeeAvatar) => ({
            id: `avatar:${a.slug}`, label: `Avatar: ${a.name}`,
            base: { nome: a.name, quem: a.state, dor: a.dor, desejo: (a.beneficios ?? []).join('; '), gatilhos: a.gatilhos },
          })),
          ...editorials
            .filter((e: BeeEditorial) => e.audience?.quem || e.audience?.dor)
            .map((e: BeeEditorial) => ({
              id: `editorial:${e.slug}`, label: `Público de ${e.name}`,
              base: { nome: `público de ${e.name}`, quem: e.audience?.quem, dor: e.audience?.dor,
                desejo: e.audience?.desejo, objecoes: e.audience?.objecoes, gatilhos: e.audience?.gatilhos, linguagem: e.audience?.linguagem },
            })),
        ];
        setBases(opts);
        if (opts[0] && !baseId) setBaseId(opts[0].id);
      } catch (e) { console.error(e); }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        nome: editing.nome, idade: editing.idade?.toString() ?? '', cargo: editing.cargo ?? '',
        empresa: editing.empresa ?? '', historia: editing.historia ?? '', rotina: editing.rotina ?? '',
        personalidade: editing.personalidade ?? '', memorias: a2l(editing.memorias), valores: a2l(editing.valores),
        dor: editing.dor ?? '', desejo: editing.desejo ?? '', objecoes: a2l(editing.objecoes),
        gatilhos: a2l(editing.gatilhos), linguagem: editing.linguagem ?? '',
      });
    } else {
      setForm(EMPTY_EDIT); setHints('');
    }
  }, [open, editing]);

  async function generate() {
    const base = bases.find((b) => b.id === baseId)?.base;
    if (!base && !hints.trim()) { toast.error('Escolha um público-base ou dê uma pista.'); return; }
    setGenerating(true);
    try {
      const r = await edge.generatePersona({ base, hints: hints.trim() || undefined });
      const p = r.persona;
      setForm({
        nome: p.nome, idade: p.idade?.toString() ?? '', cargo: p.cargo, empresa: p.empresa,
        historia: p.historia, rotina: p.rotina, personalidade: p.personalidade,
        memorias: a2l(p.memorias), valores: a2l(p.valores),
        dor: p.dor, desejo: p.desejo, objecoes: a2l(p.objecoes), gatilhos: a2l(p.gatilhos), linguagem: p.linguagem,
      });
      toast.success('Pessoa gerada — revise e ajuste antes de salvar');
    } catch (e) { console.error(e); toast.error(`IA falhou: ${(e as Error).message.slice(0, 120)}`); }
    finally { setGenerating(false); }
  }

  async function save() {
    if (!form.nome.trim()) { toast.error('A pessoa precisa de um nome.'); return; }
    setSaving(true);
    try {
      const base = bases.find((b) => b.id === baseId);
      const payload = {
        nome: form.nome.trim(), idade: form.idade ? Number(form.idade) : null,
        cargo: form.cargo.trim() || undefined, empresa: form.empresa.trim() || undefined,
        historia: form.historia.trim() || undefined, rotina: form.rotina.trim() || undefined,
        personalidade: form.personalidade.trim() || undefined,
        memorias: l2a(form.memorias), valores: l2a(form.valores),
        dor: form.dor.trim() || undefined, desejo: form.desejo.trim() || undefined,
        objecoes: l2a(form.objecoes), gatilhos: l2a(form.gatilhos), linguagem: form.linguagem.trim() || undefined,
        base_tipo: baseId ? baseId.split(':')[0] : undefined, base_ref: baseId ? baseId.split(':')[1] : undefined,
      };
      const saved = editing
        ? await personaApi.update(editing.id, payload)
        : await personaApi.create({ ...payload, position: 0 });
      toast.success(editing ? 'Pessoa atualizada' : 'Pessoa salva');
      onSaved(saved);
    } catch (e) { console.error(e); toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  }

  const set = (patch: Partial<EditForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? 'Editar pessoa' : 'Nova pessoa'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Gerar com IA */}
          {!editing && (
            <div className="space-y-2 rounded-md border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold">Gerar com IA</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Select value={baseId} onValueChange={setBaseId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Público-base (ancora a pessoa)" /></SelectTrigger>
                  <SelectContent>
                    {bases.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="accent" size="sm" onClick={() => void generate()} disabled={generating}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar pessoa
                </Button>
              </div>
              <Input value={hints} onChange={(e) => setHints(e.target.value)}
                placeholder='Pistas (opcional): "mulher, setor de saúde, ~38 anos, mais cética"' className="h-8 text-xs" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
            <div className="space-y-1"><Label>Nome</Label><Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Ricardo Almeida" /></div>
            <div className="space-y-1"><Label>Idade</Label><Input value={form.idade} onChange={(e) => set({ idade: e.target.value.replace(/\D/g, '') })} placeholder="44" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Cargo</Label><Input value={form.cargo} onChange={(e) => set({ cargo: e.target.value })} placeholder="Diretor de Operações" /></div>
            <div className="space-y-1"><Label>Empresa (setor/porte)</Label><Input value={form.empresa} onChange={(e) => set({ empresa: e.target.value })} placeholder="Transportadora de médio porte" /></div>
          </div>
          <div className="space-y-1"><Label>História de vida</Label><Textarea rows={3} value={form.historia} onChange={(e) => set({ historia: e.target.value })} className="text-xs" placeholder="Como chegou até aqui — a trajetória que explica a dor." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Rotina</Label><Textarea rows={3} value={form.rotina} onChange={(e) => set({ rotina: e.target.value })} className="text-xs" placeholder="Como é um dia normal dela." /></div>
            <div className="space-y-1"><Label>Personalidade</Label><Textarea rows={3} value={form.personalidade} onChange={(e) => set({ personalidade: e.target.value })} className="text-xs" placeholder="Temperamento, como fala, manias." /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Memórias (1 por linha)</Label><Textarea rows={3} value={form.memorias} onChange={(e) => set({ memorias: e.target.value })} className="text-xs" placeholder={'Experiências que a marcaram'} /></div>
            <div className="space-y-1"><Label>Valores (1 por linha)</Label><Textarea rows={3} value={form.valores} onChange={(e) => set({ valores: e.target.value })} className="text-xs" /></div>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold">Âncora no público (o que a mantém sendo seu público-alvo)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Dor</Label><Textarea rows={2} value={form.dor} onChange={(e) => set({ dor: e.target.value })} className="text-xs" /></div>
              <div className="space-y-1"><Label className="text-xs">Desejo</Label><Textarea rows={2} value={form.desejo} onChange={(e) => set({ desejo: e.target.value })} className="text-xs" /></div>
              <div className="space-y-1"><Label className="text-xs">Objeções (1 por linha)</Label><Textarea rows={2} value={form.objecoes} onChange={(e) => set({ objecoes: e.target.value })} className="text-xs" /></div>
              <div className="space-y-1"><Label className="text-xs">Gatilhos (1 por linha)</Label><Textarea rows={2} value={form.gatilhos} onChange={(e) => set({ gatilhos: e.target.value })} className="text-xs" /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Linguagem</Label><Input value={form.linguagem} onChange={(e) => set({ linguagem: e.target.value })} className="h-8 text-xs" /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="accent" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar pessoa'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
