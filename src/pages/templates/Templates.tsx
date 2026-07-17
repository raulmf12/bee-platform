// Galeria de templates — /templates.
//
// Cada template define como a IA monta a imagem do post. Os de sistema sao os
// Bee Quote oficiais; os seus podem ser criados do zero ou duplicando um.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Copy, LayoutTemplate, Loader2, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { templateApi } from '@/lib/api';
import { templateFields } from '@/lib/templates/hydrate';
import { TemplateThumb } from '@/components/templates/TemplateThumb';
import type { PostTemplate } from '@/types';
import { toast } from 'sonner';

export function Templates() {
  const [items, setItems] = useState<PostTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      setItems(await templateApi.list());
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function duplicate(t: PostTemplate) {
    setBusy(t.id);
    try {
      const copy = await templateApi.createUser({
        name: `${t.name} (cópia)`,
        description: t.description,
        platform: t.platform,
        format: t.format,
        template_config: t.template_config,
      });
      toast.success('Cópia criada — pode editar à vontade');
      navigate(`/templates/${copy.id}`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao duplicar');
    } finally {
      setBusy(null);
    }
  }

  async function archive(t: PostTemplate) {
    if (!confirm(`Arquivar "${t.name}"?\n\nEle some da lista. Os posts já gerados não mudam.`)) return;
    setBusy(t.id);
    try {
      await templateApi.archive(t.id);
      setItems((cur) => cur.filter((x) => x.id !== t.id));
      toast.success('Template arquivado');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao arquivar');
    } finally {
      setBusy(null);
    }
  }

  const system = items.filter((t) => t.is_system);
  const mine = items.filter((t) => !t.is_system);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-accent" />
            <h1 className="font-display text-3xl font-bold">Templates</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            O molde da imagem de cada post. Você desenha o palco e marca os campos que a IA preenche —
            o texto se ajusta sozinho ao espaço, seja frase curta ou longa.
          </p>
        </div>
        <Button asChild variant="accent" size="lg">
          <Link to="/templates/novo">
            <Plus className="h-4 w-4" /> Novo template
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Section
            title="Templates Bee"
            hint="Os oficiais. Duplique pra criar uma variação sua sem mexer no original."
            items={system}
            busy={busy}
            onDuplicate={duplicate}
          />
          <Section
            title="Meus templates"
            hint="Criados por você."
            items={mine}
            busy={busy}
            onDuplicate={duplicate}
            onArchive={archive}
            empty="Nenhum ainda. Crie do zero ou duplique um template Bee."
          />
        </>
      )}
    </div>
  );
}

function Section({
  title, hint, items, busy, onDuplicate, onArchive, empty,
}: {
  title: string;
  hint: string;
  items: PostTemplate[];
  busy: string | null;
  onDuplicate: (t: PostTemplate) => void;
  onArchive?: (t: PostTemplate) => void;
  empty?: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">{empty ?? 'Nada aqui.'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              busy={busy === t.id}
              onDuplicate={() => onDuplicate(t)}
              onArchive={onArchive ? () => onArchive(t) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateCard({
  t, busy, onDuplicate, onArchive,
}: {
  t: PostTemplate;
  busy: boolean;
  onDuplicate: () => void;
  onArchive?: () => void;
}) {
  const cfg = t.template_config;
  const slots = cfg ? templateFields(cfg) : [];
  return (
    <Card className="group overflow-hidden transition-all hover:border-accent/40">
      <Link to={`/templates/${t.id}`} className="block">
        <TemplateThumb t={t} className="border-b border-border" />
      </Link>

      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {cfg ? `${cfg.width}×${cfg.height}` : '—'} · {t.platform}
            </p>
          </div>
          {t.is_system && <Badge variant="secondary" className="shrink-0 text-[9px]">Bee</Badge>}
        </div>

        <div className="flex flex-wrap gap-1">
          {slots.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">Sem campos dinâmicos</span>
          ) : (
            slots.map((f) => (
              <span
                key={f.content_key}
                className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium"
                title={f.description?.trim() || `A IA preenche "${f.display_name}" (sem descrição)`}
              >
                <Zap className="h-2.5 w-2.5 text-accent" />
                {f.display_name}
              </span>
            ))
          )}
        </div>

        <div className="flex gap-1 pt-0.5">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={`/templates/${t.id}`}>Editar</Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={onDuplicate} disabled={busy} title="Duplicar">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {onArchive && (
            <Button variant="ghost" size="icon" onClick={onArchive} disabled={busy} title="Arquivar">
              <Archive className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
