// Fluxo de criacao de post Bee — 4 passos.
//   1. Editorial: escolhe 1 dos 8 (Diagnostico Sistemico, Historia Pessoal, etc)
//   2. Arsenal: lista de items pre-mapeados do editorial (ou pula)
//   3. Briefing: contexto adicional opcional
//   4. Preview: IA gera quote + caption no estilo Bee, voce edita, cria.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Linkedin, Instagram, Loader2, Sparkles, Wand2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { usePostStore } from '@/store/postStore';
import { beeApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import { renderBeeQuote } from '@/lib/templates/resolve';
import { aiApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AiVariation, BeeArsenalItem, BeeAvatar, BeeEditorial, Platform, TargetAvatar, UserPost } from '@/types';

type Step = 1 | 2 | 3 | 4 | 5;

// Quantos caminhos diferentes a IA abre pro mesmo tema. Cada um vira um post,
// e cada post aprovado e uma medicao da eficacia da IA.
//
// Sai tudo numa UNICA chamada, entao 5 nao custa 5x: o prompt (persona +
// arsenal + exemplos + Camada 0 da Alma) e enorme e a saida e curta. A escolha
// aqui e sobre quanto VOCE quer revisar, nao sobre custo.
const VARIATION_OPTIONS = [1, 2, 3, 4, 5] as const;
const DEFAULT_VARIATIONS = 5;

export function NewPost() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { create, posts, load: loadPosts } = usePostStore();

  const [step, setStep] = useState<Step>(1);
  const [autoRunning, setAutoRunning] = useState(false);
  const autoFired = useRef(false);
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
  const [variations, setVariations] = useState<number>(DEFAULT_VARIATIONS);
  // As 5 variacoes PRISTINAS gravadas no banco (ai_variations) — o lado
  // esquerdo do diff. Nunca sao alteradas aqui.
  const [pristine, setPristine] = useState<AiVariation[]>([]);
  // O que voce edita na tela. Mesma ordem de `pristine`.
  const [edits, setEdits] = useState<Array<{ quote: string; caption: string }>>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void loadPosts();
    void beeApi.editorials().then(setEditorials).catch((e) => {
      console.error(e);
      toast.error('Falha ao carregar editoriais Bee');
    });
    void beeApi.avatars().then(setAvatars).catch((e) => console.error(e));
  }, [loadPosts]);

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

  // -------------------------------------------------------------------------
  // PILOTO AUTOMATICO — 1 botao: o sistema escolhe editorial, arsenal,
  // plataforma e avatar, gera e cria o post pronto.
  // -------------------------------------------------------------------------
  // Peso por frequencia sugerida (editoriais "1-2x/semana" saem mais).
  function editorialWeight(e: BeeEditorial): number {
    const h = (e.frequency_hint ?? '').toLowerCase();
    if (h.includes('semana')) return 4;
    if (h.includes('pelo menos') || h.includes('1-2')) return 3;
    return 1; // 1x/mes
  }

  function weightedPick<T>(items: T[], weight: (x: T) => number): T {
    const total = items.reduce((s, x) => s + Math.max(0.1, weight(x)), 0);
    let r = Math.random() * total;
    for (const x of items) {
      r -= Math.max(0.1, weight(x));
      if (r <= 0) return x;
    }
    return items[items.length - 1];
  }

  function autoChoose() {
    // Olha os posts recentes pra ROTACIONAR (nao repetir o ultimo editorial/rede).
    const recent = [...posts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const lastEditorial = recent.map((p) => p.metadata?.editorial_slug as string | undefined).find(Boolean);
    const lastPlatform = recent.map((p) => p.platform).find(Boolean);

    // Editorial: evita o ultimo usado, escolhe ponderado por frequencia.
    let pool = editorials.filter((e) => e.slug !== lastEditorial);
    if (pool.length === 0) pool = editorials;
    const editorial = weightedPick(pool, editorialWeight);

    // Plataforma: alterna em relacao ao ultimo post.
    const platform: Platform = lastPlatform === 'linkedin' ? 'instagram' : 'linkedin';

    // Avatar: viesado pra "ambos", mas as vezes mira um especifico.
    const avatarPool: TargetAvatar[] = ['ambos', 'ambos', 'ambos', ...(avatars.map((a) => a.slug as TargetAvatar))];
    const targetAvatar = avatarPool[Math.floor(Math.random() * avatarPool.length)];

    return { editorial, platform, targetAvatar };
  }

  async function handleAutoGenerate() {
    if (editorials.length === 0) {
      toast.error('Editoriais ainda carregando — tenta de novo em 1s.');
      return;
    }
    setAutoRunning(true);
    try {
      const pick = autoChoose();
      // Sem arsenal_item_id: a geracao auto-seleciona o item de arsenal mais fresco.
      const result = await edge.generateContent({
        editorial_slug: pick.editorial.slug,
        target_avatar: pick.targetAvatar,
        quote_max_chars: 200,
        target_platform: pick.platform,
      });

      const sizeId = pick.platform === 'instagram' ? 'square' : 'portrait';
      const { fabricJson, templateId } = await renderBeeQuote(sizeId, result.quote);

      const post = await create({
        template_id: templateId,
        title: pick.editorial.name,
        platform: pick.platform,
        format: 'image',
        carousel_text: {
          quote: result.quote,
          caption: result.caption,
          headline_type: result.headline_type_used,
          analogy: result.analogy_used,
        },
        carousel_fabric_json: [fabricJson],
        caption: result.caption,
        metadata: {
          canvas_size: sizeId,
          editorial_slug: pick.editorial.slug,
          target_avatar: pick.targetAvatar,
          headline_type_used: result.headline_type_used,
          source: 'auto-pilot',
          auto_generated: true,
        },
      });

      toast.success(
        `Post pronto · ${pick.editorial.name} · ${pick.platform === 'instagram' ? 'Instagram' : 'LinkedIn'}`,
      );
      navigate(`/posts/${post.id}`);
    } catch (e) {
      console.error(e);
      toast.error(`Falha no automático: ${(e as Error).message.slice(0, 200)}`);
      setAutoRunning(false);
    }
  }

  // Deep-link: /posts/novo?auto=1 dispara o piloto automatico assim que carrega.
  useEffect(() => {
    if (autoFired.current) return;
    if (searchParams.get('auto') !== '1') return;
    if (editorials.length === 0 || avatars.length === 0) return; // espera dados
    autoFired.current = true;
    void handleAutoGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, editorials, avatars]);

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
        // As 5 saem numa unica chamada — vide edge.ts.
        variations,
      });

      const list = result.variations?.length ? result.variations : [result];

      // Grava o ORIGINAL antes de voce encostar nele. Sem isto nao ha o que
      // comparar depois, e a eficacia da IA vira achismo.
      const generation = await aiApi.createGeneration({
        editorial_slug: editorialSlug,
        target_avatar: targetAvatar,
        platform: targetPlatforms[0],
        briefing: briefing || undefined,
        arsenal_item_id: arsenalItemId,
        variations_count: list.length,
      });
      const rows = await aiApi.createVariations(
        generation.id,
        list.map((v, i) => ({
          idx: i + 1,
          quote: v.quote,
          caption: v.caption,
          headline_type: v.headline_type_used,
          analogy: v.analogy_used,
        })),
      );

      setPristine(rows.sort((a, b) => a.idx - b.idx));
      setEdits(rows.sort((a, b) => a.idx - b.idx).map((v) => ({ quote: v.quote, caption: v.caption })));
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

      const createdIds: string[] = [];
      let firstPost: { id: string } | null = null;

      // Cada variacao vira um post. Com 2 plataformas, vira um post por
      // plataforma — mas a variacao fica ligada a UM so (vide abaixo).
      for (let i = 0; i < pristine.length; i++) {
        const v = pristine[i];
        const edited = edits[i] ?? { quote: v.quote, caption: v.caption };
        let primeiroDaVariacao: string | null = null;

        for (const platform of targetPlatforms) {
          const sizeId = platform === 'instagram' ? 'square' : 'portrait';
          const { fabricJson, templateId } = await renderBeeQuote(sizeId, edited.quote);

          const sufixo = [
            pristine.length > 1 ? `#${i + 1}` : '',
            targetPlatforms.length > 1 ? (platform === 'linkedin' ? 'LI' : 'IG') : '',
          ].filter(Boolean).join(' ');

          const post = await create({
            template_id: templateId,
            title: sufixo ? `${baseTitle} [${sufixo}]` : baseTitle,
            briefing,
            platform,
            format: 'image',
            // Todo post gerado nasce esperando o seu Aprovar — que e o que mede
            // a eficacia da IA.
            status: 'pending_approval',
            carousel_text: {
              quote: edited.quote,
              caption: edited.caption,
              headline_type: v.headline_type ?? undefined,
              analogy: v.analogy ?? undefined,
            },
            carousel_fabric_json: [fabricJson],
            caption: edited.caption,
            metadata: {
              canvas_size: sizeId,
              editorial_slug: editorialSlug,
              arsenal_item_id: arsenalItemId,
              target_avatar: targetAvatar,
              adapted_from: referencePostId ?? null,
              variation_idx: v.idx,
              multi_platform_group: targetPlatforms.length > 1 ? targetPlatforms.join('+') : null,
            },
          });
          createdIds.push(post.id);
          if (!primeiroDaVariacao) primeiroDaVariacao = post.id;
          if (!firstPost) firstPost = post;
        }

        // A variacao aponta pra UM post so. O post irmao (outra plataforma) tem
        // o mesmo texto: medir os dois contaria a mesma tentativa duas vezes e
        // inflaria a amostra do portao.
        if (primeiroDaVariacao) {
          await aiApi.linkVariationToPost(v.id, primeiroDaVariacao);
        }
      }

      // Cross-link LI<->IG so quando foi 1 variacao em 2 plataformas. Com 5
      // variacoes os pares sao (2i, 2i+1) e o vinculo perderia o sentido de
      // "o mesmo post nas duas redes" — deixa sem.
      if (createdIds.length === 2 && pristine.length === 1) {
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
        createdIds.length === 1
          ? 'Post em "Pendente de aprovação" — aprove pra a IA aprender.'
          : `${createdIds.length} posts em "Pendente de aprovação" — aprove cada um pra a IA aprender.`,
      );
      // Com varios posts, o kanban e o destino que faz sentido (nao um deles).
      navigate(createdIds.length > 1 ? '/' : `/posts/${firstPost?.id}`);
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

      {/* Estado: piloto automatico rodando */}
      {autoRunning && (
        <Card className="border-accent/40">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Zap className="h-10 w-10 animate-pulse text-accent" />
            <p className="font-display text-lg font-semibold">Montando seu post no automático…</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A IA está escolhendo o editorial, o arsenal, a rede e escrevendo a frase + caption no estilo Bee. Leva ~10-20s.
            </p>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {!autoRunning && (
      <>
      {/* Piloto automatico — 1 botao entrega tudo pronto */}
      <Card className="border-accent/40 bg-accent/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="flex items-center gap-1.5 font-display font-semibold">
              <Zap className="h-4 w-4 text-accent" /> Piloto automático
            </p>
            <p className="text-xs text-muted-foreground">
              Deixa o sistema escolher tudo — editorial, arsenal, rede e avatar — e te entregar um post pronto.
            </p>
          </div>
          <Button variant="accent" onClick={() => void handleAutoGenerate()} disabled={editorials.length === 0}>
            <Zap className="h-4 w-4" /> Gerar post pronto
          </Button>
        </CardContent>
      </Card>

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

            {/* Quantos caminhos a IA abre. Sai tudo numa chamada so — escolher
                5 nao custa 5x; custa 5 revisoes suas. */}
            <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
              <Label className="text-xs">Quantas variações gerar</Label>
              <div className="flex gap-1.5">
                {VARIATION_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setVariations(n)}
                    className={cn(
                      'h-9 flex-1 rounded-md border text-sm font-semibold transition-colors',
                      variations === n
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border bg-card hover:border-accent/50',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                {variations === 1
                  ? 'Um caminho só. Vira 1 post pra você revisar.'
                  : `${variations} entradas diferentes no mesmo tema — cada uma com um ângulo próprio. Viram ${variations} posts pra revisar.`}
                {' '}Tudo numa única chamada: escolher {variations} não custa {variations}x.
              </p>
              {/* A regra do portao e por POST medido: quem gera de 1 em 1 precisa
                  de 30 gerações; de 5 em 5, precisa de 6. Vale saber antes. */}
              <p className="text-[10px] leading-snug text-muted-foreground">
                Cada post aprovado mede a IA · a campanha destrava com 30 posts de 6 gerações
                {variations < 5 && ` — no ritmo de ${variations}, são ${Math.ceil(30 / variations)} gerações`}
                {variations === 5 && ' — no ritmo de 5, são 6 gerações'}
                .
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
                  <><Loader2 className="h-4 w-4 animate-spin" /> Gerando {variations > 1 ? `${variations} variações` : ''}...</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> Gerar {variations > 1 ? `${variations} variações` : 'post'}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 — As 5 variacoes */}
      {step === 5 && pristine.length > 0 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {pristine.length === 1
                    ? 'Revise o post'
                    : `${pristine.length} caminhos pro mesmo tema`}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {pristine.length === 1 ? 'Vai' : 'Cada um vira um post e vai'} pra “Pendente de
                  aprovação”. Corrija o que precisar — a IA aprende com cada correção, e aprovar sem
                  mexer é o que prova que ela acertou.
                </p>
              </div>
              <Badge variant="outline">{editorial?.name}</Badge>
            </CardContent>
          </Card>

          {pristine.map((v, i) => {
            const e = edits[i] ?? { quote: v.quote, caption: v.caption };
            const quoteTocada = e.quote.trim() !== v.quote.trim();
            const captionTocada = e.caption.trim() !== v.caption.trim();
            const tocada = quoteTocada || captionTocada;
            return (
              <Card key={v.id} className={cn(tocada && 'border-amber-500/50')}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {pristine.length > 1 && (
                      <Badge variant="accent" className="font-mono text-[10px]">#{v.idx}</Badge>
                    )}
                    {v.headline_type && (
                      <Badge variant="secondary" className="text-[10px]">{v.headline_type}</Badge>
                    )}
                    {v.analogy && (
                      <Badge variant="secondary" className="text-[10px]">analogia: {v.analogy}</Badge>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {tocada ? '✏️ corrigida — a IA vai aprender' : '✓ como a IA escreveu'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Frase (aparece na imagem)</Label>
                    <Textarea
                      rows={2}
                      value={e.quote}
                      onChange={(ev) =>
                        setEdits((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, quote: ev.target.value } : x)),
                        )
                      }
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">{e.quote.length} chars</p>
                  </div>

                  <details className="group">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                      Caption ({e.caption.length} chars){captionTocada ? ' · corrigida' : ''}
                    </summary>
                    <Textarea
                      rows={12}
                      value={e.caption}
                      onChange={(ev) =>
                        setEdits((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, caption: ev.target.value } : x)),
                        )
                      }
                      className="mt-2 text-xs"
                    />
                  </details>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <Button variant="ghost" onClick={() => setStep(4)}>Voltar (regenerar)</Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {edits.filter((e, i) =>
                    e.quote.trim() !== pristine[i]?.quote.trim() ||
                    e.caption.trim() !== pristine[i]?.caption.trim()).length} de {pristine.length} corrigida(s)
                </span>
                <Button variant="accent" onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Criar {pristine.length * targetPlatforms.length}{' '}
                      {pristine.length * targetPlatforms.length === 1 ? 'post' : 'posts'}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </>
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
