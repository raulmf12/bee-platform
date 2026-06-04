import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { BeeLogo } from '@/components/shared/BeeLogo';

export function Login() {
  const { signIn, loading, error } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signIn(email.trim(), password);
      navigate('/');
    } catch {
      // erro fica em useAuthStore.error e ja eh exibido abaixo
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-bee-cream via-background to-bee-cream-dark px-6 py-12 dark:from-bee-navy-dark dark:via-background dark:to-bee-navy">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BeeLogo showTagline />
          <p className="mt-6 max-w-sm text-sm text-muted-foreground">
            Plataforma interna para criacao e publicacao de conteudos da Bee Consulting.
          </p>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-lg font-semibold">Entrar</h2>
                <p className="text-sm text-muted-foreground">
                  Use o email cadastrado pelo administrador.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="frank@bee.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="accent"
                className="w-full"
                size="lg"
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Nao tem conta? Pede pro administrador criar no painel.
        </p>
      </div>
    </div>
  );
}
