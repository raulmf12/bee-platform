import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Image as ImageIcon,
  Settings,
  Sparkles,
  BrainCircuit,
  Package,
  CalendarClock,
  BookOpen,
  Mic,
  Boxes,
  Paintbrush,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeeLogo } from '@/components/shared/BeeLogo';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/posts', label: 'Posts', icon: FolderKanban },
  { to: '/podcasts', label: 'Podcasts', icon: Mic },
  { to: '/editor', label: 'Editor', icon: Paintbrush },
  { to: '/editoriais', label: 'Editoriais', icon: BookOpen },
  { to: '/arsenal', label: 'Arsenal', icon: Boxes },
  { to: '/curadoria', label: 'Curadoria', icon: Sparkles },
  { to: '/linhas', label: 'Linhas editoriais', icon: CalendarClock },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/conhecimento', label: 'Conhecimento', icon: BrainCircuit },
  { to: '/biblioteca', label: 'Biblioteca', icon: ImageIcon },
  { to: '/configuracoes', label: 'Configuracoes', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <BeeLogo showTagline />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/30 text-accent-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-accent/15 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Etapa 1 — Fundacao
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Reset feito. Aguardando deploy das edge functions pra liberar IA.
          </p>
        </div>
      </div>
    </aside>
  );
}
