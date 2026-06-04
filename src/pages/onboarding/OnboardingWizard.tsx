// Onboarding Bee — 2 passos.
// 1. Confirma persona Bee (pre-preenchida).
// 2. Cola chave Gemini API.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Key, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Step = 'persona' | 'gemini';

const DEFAULT_PERSONA = 'Marcos Piccini / Bee Academy: alguem que viu de dentro. Que viveu o colapso antes de nomea-lo. Que passou pela propria travessia antes de convidar outros. Voz com autoridade que vem de 20 anos de cases reais e dois livros escritos.';
const DEFAULT_TONE = 'Direto, provocador, autentico. Linguagem forte sem ser agressiva. Provoca sem acusar.';

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useAuthStore();

  const [step, setStep] = useState<Step>(settings?.gemini_api_key ? 'gemini' : 'persona');
  const [persona, setPersona] = useState(settings?.persona ?? DEFAULT_PERSONA);
  const [tone, setTone] = useState(settings?.tone_of_voice ?? DEFAULT_TONE);
  const [geminiKey, setGeminiKey] = useState(settings?.gemini_api_key ?? '');
  const [saving, setSaving] = useState(false);

  async function saveAndNext() {
    if (step === 'persona') {
      setSaving(true);
      try {
        await updateSettings({ persona, tone_of_voice: tone });
        setStep('gemini');
      } catch (e) {
        console.error(e);
        toast.error('Falha ao salvar.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 'gemini') {
      if (!geminiKey || geminiKey.length < 10) {
        toast.error('Cola sua chave Gemini API.');
        return;
      }
      setSaving(true);
      try {
        await updateSettings({ gemini_api_key: geminiKey });
        toast.success('Pronto. Vamos cocriar.');
        navigate('/');
      } catch (e) {
        console.error(e);
        toast.error('Falha ao salvar.');
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Bem-vindo a Bee Consulting
          </h1>
          <p className="text-sm text-muted-foreground">
            2 passos rápidos para a plataforma falar com a voz Bee.
          </p>
        </header>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2">
          {(['persona', 'gemini'] as Step[]).map((s, i) => {
            const labels = ['Persona Bee', 'Chave Gemini'];
            const isActive = s === step;
            const isDone = s === 'persona' && step === 'gemini';
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                    isDone && 'bg-accent text-accent-foreground',
                    isActive && 'bg-primary text-primary-foreground',
                    !isActive && !isDone && 'bg-secondary text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-xs',
                    isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {labels[i]}
                </span>
                {i < 1 && <div className="h-px w-8 bg-border" />}
              </div>
            );
          })}
        </div>

        <Card>
          <CardContent className="p-6">
            {step === 'persona' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">Confirma a persona</h2>
                  <p className="text-sm text-muted-foreground">
                    Já preenchemos com a voz Bee oficial extraída do Guia de Voz. Ajuste se quiser.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="persona">Persona</Label>
                  <Textarea
                    id="persona"
                    rows={6}
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tone">Tom em uma linha</Label>
                  <Input id="tone" value={tone} onChange={(e) => setTone(e.target.value)} />
                </div>
              </div>
            )}

            {step === 'gemini' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    Cola sua chave Gemini API
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Modelo padrão: <strong>gemini-3.1-pro-preview</strong>. Embedding: <strong>gemini-embedding-001</strong>.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gemini">Chave</Label>
                  <Input
                    id="gemini"
                    type="password"
                    placeholder="AIzaSy..."
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pega no <a className="text-accent underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
                  </p>
                </div>
                <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-xs text-muted-foreground">
                  <Key className="mb-1 inline h-3 w-3 mr-1 text-accent" />
                  Voce paga o uso direto pro Google. A plataforma só envia os prompts em nome da sua chave.
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              {step === 'gemini' && (
                <Button variant="ghost" onClick={() => setStep('persona')}>Voltar</Button>
              )}
              <Button
                variant="accent"
                onClick={saveAndNext}
                disabled={saving}
              >
                {step === 'gemini' ? 'Finalizar' : 'Próximo'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
