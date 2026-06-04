// Fluxo de criacao de post Bee — 4 passos.
//   1. Editorial: escolhe 1 dos 8 (Diagnostico Sistemico, Historia Pessoal, etc)
//   2. Arsenal: lista de items pre-mapeados do editorial (ou pula)
//   3. Briefing: contexto adicional opcional
//   4. Preview: IA gera quote + caption no estilo Bee, voce edita, cria.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Linkedin, Instagram, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useTemplateStore } from '@/store/templateStore';
import { usePostStore } from '@/store/postStore';
import { beeApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import { hydrateBeeQuote } from '@/lib/templates/beeQuote';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BeeArsenalItem, BeeAvatar, BeeEditorial, Platform, TargetAvatar, UserPost } from '@/types';

type Step = 1 | 2 | 3 | 4 | 5;

export function NewPost() {
  const navigate = useNavigate();
  const { templates, loaded, load } = useTemplateStore();
  const { create, posts, load: loadPosts } = usePostStore();

  const [step, setStep] = useState<Step>(1);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [arsenal, setArsenal] = useState<BeeArsenalItem[]>([]);
  const [avatars, setAvatars] = useState<BeeAvatar[]>([]);
  const [editorialSlug, setEditorialSlug] = useState<string | undefined>();
  const [arsenalItemId, setArsenalItemId] = useState<string | undefined>();
  const [targetAvatar, setTargetAvatar] = useState<TargetAvatar>('ambos');
  // Plataformas-destino: pode marcar 1 ou as 2 ao mesmo tempo.
  // Se marcar as 2: gera conteudo 1x e cria 2 posts ligados via companion_post_id.
  const [targetPlatforms, setTargetPlatforms] = useState<Platform[]>(['linkedin']);
  const [referencePostId, setReferencePostId] = useState<string | undefined>();
  const [briefing, setBriefing] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{
    quote: string;
    caption: string;
    headline_type_used?: string;
    analogy_used?: string;
  } | null>(null);
  const [editedQuote, setEditedQuote] = useState('');
  const [editedCaption, setEditedCaption] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
    void loadPosts();
    void beeApi.editorials().then(setEditorials).catch((e) => {
      console.error(e);
      toast.error('Falha ao carregar editoriais Bee');
    });
    void beeApi.avatars().then(setAvatars).catch((e) => console.error(e));
  }, [load, loaded, loadPosts]);

  useEffect(() => {
    if (!editorialSlug) {
      setArsenal([]);
      setArsenalItemId(undefined);
      return;
    }
    void beeApi.arsenalForEditorial(editorialSlug).then(setArsenal).catch((e) => {
      console.error(e);
    });
  }, [editorialSlug]);

  // Template visual padrao = Bee Quote (linkedin/image) — pega o primeiro is_system
  const beeTemplate = templates.find((t) => t.platform === 'linkedin' && t.is_system) ?? templates[0];

  async function handleGenerate() {
    if (!editorialSlug) {
      toast.error('Escolhe um editorial primeiro.');
      return;
    }
    if (targetPlatforms.length === 0) {
      toast.error('Escolhe pelo menos uma plataforma.');
      return;
    }
    setGenerating(true);
    try {
      // Pra prompt, manda a primeira plataforma como hint principal.
      // Se forem as 2, geramos 1x com tom "geral" e duplicamos depois.
      const result = await edge.generateContent({
        editorial_slug: editorialSlug,
        arsenal_item_id: arsenalItemId,
        target_avatar: targetAvatar,
        briefing: briefing || undefined,
        quote_max_chars: 200,
        reference_post_id: referencePostId,
        target_platform: targetPlatforms[0] as 'linkedin' | 'instagram',
      });
      setGenerated(result);
      setEditedQuote(result.quote);
      setEditedCaption(result.caption);
      setStep(5);
    } catch (e) {
      console.error(e);
      toast.error(`Falha na IA: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      setGenerating(false);
    }
  }

  function togglePlatform(p: Platform) {
    setTargetPlatforms((cur) => {
      const has = cur.includes(p);
      if (has) {
        // Nao deixa ficar vazio
        if (cur.length === 1) return cur;
        return cur.filter((x) => x !== p);
      }
      const next = [...cur, p];
      // Se ficou com 2 plataformas, limpa a referencia (faz sentido so com 1)
      if (next.length === 2) setReferencePostId(undefined);
      return next;
    });
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const editorial = editorials.find((e) => e.slug === editorialSlug);
      const arsenalItem = arsenal.find((a) => a.id === arsenalItemId);
      const baseTitle = arsenalItem?.title ?? editorial?.name ?? 'Novo post';

      // Cria 1 post por plataforma selecionada. Cada um com seu sizeId/fabric.
      const createdIds: string[] = [];
      let firstPost: { id: string } | null = null;

      for (const platform of targetPlatforms) {
        const sizeId = platform === 'instagram' ? 'square' : 'portrait';
        const fabricJson = hydrateBeeQuote({ quote: editedQuote, sizeId });

        const post = await create({
          template_id: beeTemplate?.id,
          title: targetPlatforms.length > 1 ? `${baseTitle} [${platform === 'linkedin' ? 'LI' : 'IG'}]` : baseTitle,
          briefing,
          platform,
          format: 'image',
          carousel_text: {
            quote: editedQuote,
            caption: editedCaption,
            headline_type: generated?.headline_type_used,
            analogy: generated?.analogy_used,
          },
          carousel_fabric_json: [fabricJson],
          caption: editedCaption,
          metadata: {
            canvas_size: sizeId,
            editorial_slug: editorialSlug,
            arsenal_item_id: arsenalItemId,
            target_avatar: targetAvatar,
            adapted_from: referencePostId ?? null,
            multi_platform_group: targetPlatforms.length > 1 ? targetPlatforms.join('+') : null,
          },
        });
        createdIds.push(post.id);
        if (!firstPost) firstPost = post;
      }

      // Liga os 2 posts entre si via companion_post_id (cross-link)
      if (createdIds.length === 2) {
        try {
          const { postApi } = await import('@/lib/api');
          await postApi.update(createdIds[0], { companion_post_id: createdIds[1] });
          await postApi.update(createdIds[1], { companion_post_id: createdIds[0] });
        } catch (e) {
          console.warn('[NewPost] companion cross-link falhou', e);
        }
      } else if (referencePostId && firstPost) {
        // Single platform + adaptacao de post existente
        try {
          const { postApi } = await import('@/lib/api');
          await postApi.update(firstPost.id, { companion_post_id: referencePostId });
        } catch (e) {
          console.warn('[NewPost] companion link falhou', e);
        }
      }

      toast.success(
        targetPlatforms.length > 1
          ? `2 posts criados (LinkedIn + Instagram) — ligados como par.`
          : 'Post criado.',
      );
      if (firstPost) navigate(`/posts/${firstPost.id}`);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao criar post.');
    } finally {
      setCreating(false);
    }
  }

  const editorial = editorials.find((e) => e.slug === editorialSlug);
  const arsenalItem = arsenal.find((a) => a.id === arsenalItemId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Novo post</h1>
          <p className="text-sm text-muted-foreground">
            Editorial → Arsenal → Briefing → IA gera no estilo Bee.
          </p>
        </div>
      </header>

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { n: 1, label: 'Editorial' },
          { n: 2, label: 'Arsenal' },
          { n: 3, label: 'Avatar' },
          { n: 4, label: 'Briefing' },
          { n: 5, label: 'Preview' },
        ].map((s, i, arr) => (
          <div key={s.n} className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-3 py-1',
                step === s.n
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : step > s.n
                    ? 'bg-accent/30 text-accent-foreground'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {s.n}. {s.label}
            </span>
            {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {/* STEP 1 — Editorial + Plataforma + Adaptar */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            {/* PLATAFORMA + REFERENCIA */}
            <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Plataforma destino (1 ou as 2)</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={targetPlatforms.includes('linkedin') ? 'accent' : 'outline'}
                    onClick={() => togglePlatform('linkedin')}
                  >
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn (4:5)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={targetPlatforms.includes('instagram') ? 'accent' : 'outline'}
                    onClick={() => togglePlatform('instagram')}
                  >
                    <Instagram className="h-3.5 w-3.5" /> Instagram (1:1)
                  </Button>
                </div>
                {targetPlatforms.length > 1 && (
                  <p className="text-[10px] text-accent">
                    ✨ Vamos criar 2 posts ligados (um por rede), cada um com seu canvas. Editáveis independentemente.
                  </p>
                )}
              </div>

              {/* Adaptar de post existente — só quando 1 plataforma selecionada */}
              {targetPlatforms.length === 1 && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Copy className="h-3 w-3" /> Adaptar de post existente (opcional)
                  </Label>
                  <ReferencePostSelector
                    posts={posts}
                    value={referencePostId}
                    onChange={setReferencePostId}
                    excludePlatform={targetPlatforms[0]}
                  />
                  {referencePostId && (
                    <p className="text-[10px] text-muted-foreground">
                      💡 IA vai adaptar o post escolhido pra <strong>{targetPlatforms[0] === 'instagram' ? 'Instagram' : 'LinkedIn'}</strong> mantendo a essência.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-lg font-semibold">Escolhe o editorial</h2>
              <p className="text-sm text-muted-foreground">
                Cada editorial tem uma estrutura, frequência e arsenal próprios.
              </p>
            </div>

            {editorials.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                Carregando editoriais Bee...
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {editorials.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setEditorialSlug(e.slug)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-all hover:border-accent',
                      editorialSlug === e.slug
                        ? 'border-accent bg-accent/5 ring-2 ring-accent/30'
                        : 'border-border',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm">{e.name}</div>
                      {e.frequency_hint && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {e.frequency_hint}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {e.description}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="accent" onClick={() => setStep(2)} disabled={!editorialSlug}>
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Arsenal */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Arsenal do editorial</h2>
              <p className="text-sm text-muted-foreground">
                {editorial?.name} — {editorial?.structure_template}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Escolhe um material do arsenal pra IA usar como ponto de partida. Ou pula e usa só o briefing.
              </p>
            </div>

            {arsenal.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Sem arsenal mapeado pra este editorial — siga só com o briefing.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <button
                  onClick={() => setArsenalItemId(undefined)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-all hover:border-accent',
                    !arsenalItemId
                      ? 'border-accent bg-accent/5 ring-2 ring-accent/30'
                      : 'border-border',
                  )}
                >
                  <p className="text-sm font-medium italic text-muted-foreground">
                    Pular — só usar o briefing
                  </p>
                </button>
                {arsenal.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setArsenalItemId(a.id)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-all hover:border-accent',
                      arsenalItemId === a.id
                        ? 'border-accent bg-accent/5 ring-2 ring-accent/30'
                        : 'border-border',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{a.type}</Badge>
                    </div>
                    {a.summary && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.summary}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
              <Button variant="accent" onClick={() => setStep(3)}>
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — Avatar */}
      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Avatar-alvo (opcional)</h2>
              <p className="text-sm text-muted-foreground">
                Pra quem o post fala? Cada avatar pede um gatilho mental diferente.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                onClick={() => setTargetAvatar('ambos')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all hover:border-accent',
                  targetAvatar === 'ambos' ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border',
                )}
              >
                <div className="font-semibold text-sm">Ambos</div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Padrão. Post genérico que ressoa nos dois perfis.
                </p>
              </button>
              {avatars.map((av) => (
                <button
                  key={av.slug}
                  onClick={() => setTargetAvatar(av.slug as TargetAvatar)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all hover:border-accent',
                    targetAvatar === av.slug ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border',
                  )}
                >
                  <div className="font-semibold text-sm">{av.name}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-3">
                    {av.state}
                  </p>
                  {av.gatilhos && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {av.gatilhos.slice(0, 2).map((g) => (
                        <Badge key={g} variant="secondary" className="text-[9px]">{g}</Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>Voltar</Button>
              <Button variant="accent" onClick={() => setStep(4)}>
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — Briefing */}
      {step === 4 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Briefing (opcional)</h2>
              <p className="text-sm text-muted-foreground">
                Contexto adicional. Se já escolheu arsenal, a IA usa como ponto de partida — aqui só refina.
              </p>
            </div>

            {arsenalItem && (
              <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-xs">
                <p className="font-semibold">Material selecionado: {arsenalItem.title}</p>
                {arsenalItem.summary && (
                  <p className="mt-1 text-muted-foreground">{arsenalItem.summary}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="briefing">Briefing adicional</Label>
              <Textarea
                id="briefing"
                rows={6}
                placeholder="Ex: Foca no aspecto da exaustao silenciosa. Quero falar especificamente com diretores que estao na fase de questionar o proprio sucesso."
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                {briefing.length} chars · vazio também funciona.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>Voltar</Button>
              <Button
                variant="accent"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> Gerar com IA</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 — Preview */}
      {step === 5 && generated && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Preview e edição</h2>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {generated.headline_type_used && (
                  <Badge variant="secondary">Título: {generated.headline_type_used}</Badge>
                )}
                {generated.analogy_used && (
                  <Badge variant="secondary">Analogia: {generated.analogy_used}</Badge>
                )}
                <Badge variant="outline">{editorial?.name}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote">Frase do post (aparece na imagem)</Label>
              <Textarea
                id="quote"
                rows={3}
                value={editedQuote}
                onChange={(e) => setEditedQuote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{editedQuote.length} chars</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="caption">
                Caption (texto do post no{' '}
                {targetPlatforms.length > 1
                  ? 'LinkedIn + Instagram'
                  : targetPlatforms[0] === 'instagram' ? 'Instagram' : 'LinkedIn'})
              </Label>
              <Textarea
                id="caption"
                rows={14}
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{editedCaption.length} chars · ideal 1300-2000</p>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}>Voltar (regenerar)</Button>
              <Button variant="accent" onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Criar post</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Selector compacto de post de referencia.
// Mostra apenas posts da plataforma OPOSTA (faz sentido pra cross-platform).
function ReferencePostSelector({
  posts,
  value,
  onChange,
  excludePlatform,
}: {
  posts: UserPost[];
  value?: string;
  onChange: (id: string | undefined) => void;
  excludePlatform: Platform;
}) {
  const eligible = posts
    .filter((p) => p.platform !== excludePlatform && (p.caption || (p.carousel_text as { quote?: string })?.quote))
    .slice(0, 50);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
    >
      <option value="">— nao adaptar (criar do zero) —</option>
      {eligible.length === 0 ? (
        <option disabled>(sem posts {excludePlatform === 'instagram' ? 'do LinkedIn' : 'do Instagram'} pra adaptar)</option>
      ) : (
        eligible.map((p) => {
          const date = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
          const quote = (p.carousel_text as { quote?: string } | undefined)?.quote;
          const label = `[${p.platform === 'instagram' ? 'IG' : 'LI'}] ${date} · ${p.title?.slice(0, 60) ?? quote?.slice(0, 60) ?? 'sem titulo'}`;
          return (
            <option key={p.id} value={p.id}>
              {label}
            </option>
          );
        })
      )}
    </select>
  );
}
