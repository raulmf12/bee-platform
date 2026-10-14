// Seletor de perfil de comunicação: "Quem fala · Frente · Público" — o contexto que a
// Hive usa para gerar, avaliar e editar (snapshot gravado em cada criação).
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { identityApi, profileSummary, type ProfileView } from '@/lib/identityApi';

export function ProfilePicker({ value, onChange, needsReview, label = 'Perfil de comunicação', disabled }: {
  value: string | null | undefined; onChange: (id: string) => void; needsReview?: boolean; label?: string; disabled?: boolean;
}) {
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  useEffect(() => { identityApi.profiles().then(setProfiles).catch(() => setProfiles([])); }, []);
  const current = profiles.find((p) => p.id === value);
  const usable = profiles.filter((p) => p.status === 'active' || p.id === value);
  return (
    <div className="space-y-1.5" data-testid="profile-picker">
      <label htmlFor="profile-select" className="text-sm font-medium">{label}</label>
      <select id="profile-select" value={value ?? ''} disabled={disabled} onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background p-2 text-sm">
        {!value && <option value="">— Definir perfil —</option>}
        {usable.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== 'active' ? ' (rascunho)' : ''}</option>)}
      </select>
      {current && <p className="text-xs text-muted-foreground" data-testid="profile-summary">{profileSummary(current)}{current.needs_recalibration ? ` · a recalibrar: ${current.needs_recalibration}` : ''}</p>}
      {(!value || needsReview) && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400" data-testid="profile-needs-review">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Perfil a definir: até escolher, a Hive usa o perfil padrão da marca e avisa.
        </p>
      )}
    </div>
  );
}
