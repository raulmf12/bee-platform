// Cliente novo (Fase 6 · isolamento): cria o PRÓPRIO espaço de trabalho e marca — nada da Bee é
// herdado (sem Genesis, editorias, públicos, fotos ou sistema visual de outra marca). Em seguida
// abre a sessão "Configurar minha identidade" com perguntas neutras.
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/db';

export function CreateWorkspaceCard({ onCreated }: { onCreated: (brandId: string) => void }) {
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const id = await db.rpc<string>('create_my_workspace', { p_workspace: brand.trim(), p_brand: brand.trim() });
      onCreated(id);
    } catch (e) {
      toast.error((e as Error).message.replace(/^.*"message":"([^"]+)".*$/, '$1').slice(0, 200));
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-dashed p-8 text-center" data-testid="identity-no-brand">
      <p className="font-display text-xl font-semibold">Vamos configurar a sua identidade</p>
      <p className="text-sm text-muted-foreground">Comece pelo nome da sua marca. A Hive conduz a conversa a partir daí — nada é preenchido por padrão e nada de outra marca é usado.</p>
      <div className="flex gap-2">
        <Input aria-label="Nome da marca" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Nome da marca" />
        <Button variant="accent" disabled={busy || !brand.trim()} onClick={create} data-testid="workspace-create">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Começar
        </Button>
      </div>
    </div>
  );
}
