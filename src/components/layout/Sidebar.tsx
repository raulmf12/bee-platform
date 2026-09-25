import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
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
  Brain,
  MessagesSquare,
  MessageSquarePlus,
  Users,
  ChevronDown,
  ChevronRight,
  Lock,
  Library,
  Database,
  ScrollText,
  DollarSign,
  Layers,
  Plus,
  Workflow,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeeLogo } from '@/components/shared/BeeLogo';

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

// Menu da estrutura de campanhas: o fluxo principal solto no topo (Início →
// Campanhas → Produção → Pipeline → Agenda); a base de conhecimento e a
// inteligência em grupos. Saíram "Campanha de conteúdo" (linhas) e "Post
// individual" — "Um conteúdo" agora nasce em Criar.
const NAV_GROUPS: NavGroup[] = [
  { label: 'Início', to: '/', icon: LayoutDashboard },
  { label: 'Campanhas', to: '/campanhas', icon: CalendarClock },
  { label: 'Produção', to: '/producao', icon: Layers },
  { label: 'Pipeline', to: '/pipeline', icon: Workflow },
  { label: 'Agenda', to: '/agenda', icon: CalendarDays },
  { label: 'Desempenho', to: '/desempenho', icon: BarChart3 },
  {
    label: 'Base Hive',
    icon: Library,
    items: [
      { to: '/genesis', label: 'Genesis', icon: BrainCircuit },
      { to: '/diretrizes', label: 'Diretrizes de Criação', icon: ScrollText },
      { to: '/editoriais', label: 'Editoriais', icon: BookOpen },
      { to: '/arsenal', label: 'Arsenal', icon: Boxes },
      { to: '/produtos', label: 'Produtos', icon: Package },
      { to: '/conhecimento', label: 'Conhecimento', icon: Database },
      { to: '/templates', label: 'Templates', icon: Paintbrush },
      { to: '/biblioteca', label: 'Biblioteca', icon: ImageIcon },
      { to: '/podcasts', label: 'Vídeos', icon: Mic },
    ]
  },
  {
    label: 'Inteligência',
    icon: Brain,
    items: [
      { to: '/aprendizado', label: 'Aprendizado', icon: Brain },
      { to: '/curadoria', label: 'Curadoria', icon: Sparkles },
      { to: '/feedback', label: 'Feedback contínuo', icon: MessageSquarePlus },
      { to: '/coach', label: 'Coach de voz', icon: MessagesSquare },
      { to: '/personas', label: 'Simular público', icon: Users },
      { to: '/custos', label: 'Custos de API', icon: DollarSign },
      { to: '/labs/imagens', label: 'Teste de imagem', icon: ImageIcon },
    ]
  },
  { label: 'Configurações', to: '/configuracoes', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Cadeado de itens `gated` (nenhum no menu atual — a antiga "Campanha de conteúdo" saiu).
  const unlocked = true;

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

      <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
        <NavLink to="/criar" data-testid="nav-create"
          className="mb-3 flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90">
          <Plus className="h-4 w-4" /> Criar
        </NavLink>
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
