// Sidebar esquerda com icones — navegacao entre paineis (estilo Canva).

import { LayoutTemplate, Palette, Shapes, Type, Upload, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PanelKey = 'templates' | 'slots' | 'text' | 'elements' | 'uploads' | 'brand' | null;

interface SidebarLeftProps {
  active: PanelKey;
  onChange: (key: PanelKey) => void;
  templateMode?: boolean;
}

type Item = { key: Exclude<PanelKey, null>; icon: typeof Type; label: string };

const ITEMS: Item[] = [
  { key: 'templates', icon: LayoutTemplate, label: 'Templates' },
  { key: 'text', icon: Type, label: 'Texto' },
  { key: 'elements', icon: Shapes, label: 'Elementos' },
  { key: 'uploads', icon: Upload, label: 'Uploads' },
  { key: 'brand', icon: Palette, label: 'Marca' },
];

// No editor de templates a galeria nao faz sentido (voce esta editando UM
// template); no lugar dela entra a lista de campos dinamicos.
const TEMPLATE_ITEMS: Item[] = [
  { key: 'slots', icon: Zap, label: 'Campos' },
  ...ITEMS.filter((i) => i.key !== 'templates'),
];

export function SidebarLeft({ active, onChange, templateMode = false }: SidebarLeftProps) {
  const items = templateMode ? TEMPLATE_ITEMS : ITEMS;
  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card/40 py-3">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(isActive ? null : item.key)}
            className={cn(
              'flex w-full flex-col items-center gap-1 rounded-md px-1.5 py-2 text-[10px] font-medium transition-all',
              isActive
                ? 'bg-accent/20 text-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            title={item.label}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'bg-transparent',
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
