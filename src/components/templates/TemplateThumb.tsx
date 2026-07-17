// Preview de um template. Renderiza do template_config no cliente, pelo mesmo
// caminho da geracao — o que voce ve e o que a IA produziria.

import { useEffect, useState } from 'react';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import { renderTemplateThumb, thumbKey } from '@/lib/templates/thumbnail';
import type { PostTemplate } from '@/types';
import { cn } from '@/lib/utils';

export function TemplateThumb({ t, className }: { t: PostTemplate; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cfg = t.template_config;

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (!cfg) { setFailed(true); return; }
    void renderTemplateThumb(thumbKey(t), cfg).then((url) => {
      if (cancelled) return;
      if (url) setSrc(url);
      else setFailed(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id, t.updated_at]);

  const ratio = cfg ? cfg.width / cfg.height : 0.8;

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden bg-white',
        className,
      )}
      style={{ aspectRatio: String(ratio) }}
    >
      {src ? (
        <img src={src} alt={t.name} className="h-full w-full object-contain" />
      ) : failed ? (
        <LayoutTemplate className="h-8 w-8 text-muted-foreground/30" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
      )}
    </div>
  );
}
