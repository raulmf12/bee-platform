import type { CampaignStatus, CycleStatus, ContentStatus, IdeaStatus } from '@/types';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Rascunho', active: 'Ativa', paused: 'Pausada', ended: 'Encerrada',
};

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  not_started: 'Ainda não iniciado',
  planned: 'Planejamento confirmado',
  pauta_ready: 'Pauta pronta para revisão',
  pauta_approved: 'Pauta aprovada',
  developing: 'Validando conteúdos',
  producing: 'Produção visual',
  ready: 'Pronto para programação',
  done: 'Concluído',
};

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  backlog: 'Backlog', proposed: 'Proposta', approved: 'Aprovada', discarded: 'Descartada', developed: 'Desenvolvida',
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  developing: 'Em desenvolvimento', pending_validation: 'Aguardando validação', validated: 'Validado', discarded: 'Descartado',
};
