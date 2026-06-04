import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import * as DropdownPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useTheme } from '@/hooks/useTheme';

export function Topbar() {
  const { currentUser, signOut } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  if (!currentUser) return null;

  async function handleSignOut() {
    await signOut();
    setMenuOpen(false);
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-base font-semibold text-foreground">
          Plataforma Bee Consulting
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownPrimitive.Trigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary">
              <UserAvatar user={currentUser} size="sm" />
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-none">{currentUser.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{currentUser.role}</p>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownPrimitive.Trigger>
          <DropdownPrimitive.Portal>
            <DropdownPrimitive.Content className="fixed right-6 top-16 z-50 w-64 rounded-md border border-border bg-popover p-1 shadow-md focus:outline-none">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">{currentUser.name}</p>
                {currentUser.email && (
                  <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/configuracoes');
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-secondary"
              >
                <SettingsIcon className="h-4 w-4" />
                Configuracoes
              </button>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </DropdownPrimitive.Content>
          </DropdownPrimitive.Portal>
        </DropdownPrimitive.Root>
      </div>
    </header>
  );
}
