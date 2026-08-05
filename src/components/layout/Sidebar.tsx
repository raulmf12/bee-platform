import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PenLine,
  Image as ImageIcon,
  Settings,
  Sparkles,
  BrainCircuit,
  Package,
  CalendarClock,
  CalendarDays,
  BookOpen,
  Mic,
  Boxes,
  Paintbrush,
  Heart,
  Brain,
  MessagesSquare,
  Users,
  ChevronDown,
  ChevronRight,
  Lock,
  PenTool,
  Library,
  Database,
  UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeeLogo } from '@/components/shared/BeeLogo';
import { aiApi } from '@/lib/api';

type SubItem = {
  to: string;
  label: string;
  icon: any;
  // Mostra cadeado enquanto a IA nao provar que escreve na voz da casa.
  // A trava de verdade e na pagina e no cron — aqui e so o aviso.
  gated?: boolean;
};

type NavGroup = {
  label: string;
  icon?: any;
  to?: string;
  items?: SubItem[];
};

const NAV_GROUPS: NavGroup[] = [
  { 
    label: 'Dashboard', 
    to: '/', 
    icon: LayoutDashboard 
  },
  {
    label: 'Produção de conteúdo',
    icon: PenTool,
    items: [
      { to: '/linhas', label: 'Campanha de conteúdo', icon: CalendarClock, gated: true },
      { to: '/posts/novo', label: 'Post individual', icon: PenLine },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays },
      { to: '/podcasts', label: 'Posts Vídeos', icon: Mic },
      { to: '/templates', label: 'Templates', icon: Paintbrush },
      { to: '/biblioteca', label: 'Biblioteca', icon: ImageIcon },
    ]
  },
  {
    label: 'Estrutura de conteúdo',
    icon: Library,
    items: [
      { to: '/editoriais', label: 'Editoriais', icon: BookOpen },
      { to: '/arsenal', label: 'Arsenal', icon: Boxes },
    ]
  },
  {
    label: 'Inteligência',
    icon: BrainCircuit,
    items: [
      { to: '/aprendizado', label: 'Aprendizado', icon: Brain },
      { to: '/coach', label: 'Coach de voz', icon: MessagesSquare },
      { to: '/personas', label: 'Simular público', icon: Users },
      { to: '/conhecimento', label: 'Conhecimento', icon: Database },
      { to: '/curadoria', label: 'Curadoria', icon: Sparkles },
    ]
  },
  {
    label: 'Perfil',
    icon: UserCircle,
    items: [
      { to: '/alma', label: 'Alma', icon: Heart },
      { to: '/produtos', label: 'Produtos', icon: Package },
    ]
  },
  { 
    label: 'Configurações', 
    to: '/configuracoes', 
    icon: Settings 
  },
];

export function Sidebar() {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // So pra decidir o cadeado. Falhou? Assume travado — e o estado inicial e
  // o unico seguro pra uma funcao que publica sozinha.
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void aiApi.gate()
      .then((g) => setUnlocked(!!g.destravada))
      .catch(() => setUnlocked(false));
  }, []);

  // Abre automaticamente o grupo que contém a rota ativa
  useEffect(() => {
    const currentPath = location.pathname;
    const newOpenGroups = { ...openGroups };
    let changed = false;

    NAV_GROUPS.forEach((group) => {
      if (group.items) {
        // Se a rota for exata ou um filho, abre a sanfona
        const hasActiveChild = group.items.some(item => 
          currentPath === item.to || currentPath.startsWith(item.to + '/')
        );
        if (hasActiveChild && !newOpenGroups[group.label]) {
          newOpenGroups[group.label] = true;
          changed = true;
        }
      }
    });

    if (changed) {
      setOpenGroups(newOpenGroups);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <BeeLogo showTagline />
      </div>

      <nav className="flex-1 overflow-y-auto space-y-2 px-3 py-4">
        {NAV_GROUPS.map((group) => {
          if (group.to) {
            // Item solto (Dashboard e Configurações)
            const Icon = group.icon;
            return (
              <NavLink
                key={group.label}
                to={group.to}
                end={group.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent/30 text-accent-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )
                }
              >
                {Icon && <Icon className="h-4 w-4" />}
                {group.label}
              </NavLink>
            );
          }

          // Grupo com itens (Sanfona)
          const isGroupOpen = openGroups[group.label];
          const GroupIcon = group.icon;

          return (
            <div key={group.label} className="space-y-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  'w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none',
                  'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-3">
                  {GroupIcon && <GroupIcon className="h-4 w-4" />}
                  <span className="font-semibold">{group.label}</span>
                </div>
                {isGroupOpen ? (
                  <ChevronDown className="h-4 w-4 opacity-50" />
                ) : (
                  <ChevronRight className="h-4 w-4 opacity-50" />
                )}
              </button>

              {isGroupOpen && (
                <div className="ml-5 space-y-1 border-l border-border pl-2 py-1">
                  {group.items?.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-accent/30 text-accent-foreground'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )
                        }
                      >
                        {ItemIcon && <ItemIcon className="h-4 w-4" />}
                        <span className="flex-1">{item.label}</span>
                        {item.gated && !unlocked && (
                          <Lock className="h-3 w-3 opacity-50" aria-label="Travado" />
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
