// Fonte única da verdade sobre "em que ponto do wizard um post parou".
// Um post de imagem gerado nasce em `pending_approval` e passa por DUAS etapas:
//   1) aprovação de TEXTO (título + legenda) — metadata.review_stage = 'texto'
//   2) DESIGN (imagem) — metadata.review_stage = 'design'
// O status no banco (`pending_approval`) é o mesmo nas duas; quem diferencia é
// o `review_stage` no metadata. Isso permite RETOMAR a aprovação de textos de
// posts que ficaram pra trás (em vez de cair direto no editor de canvas).

import type { UserPost } from '@/types';

// Post de imagem cujo título+legenda ainda NÃO foram aprovados (não avançou pro
// design). É o que pode — e deve — ser retomado na tela de aprovação de textos.
// review_stage ausente conta como 'texto' (posts gerados nascem nessa etapa).
export function isTextPending(p: UserPost): boolean {
  const meta = p.metadata as { review_stage?: string } | undefined;
  return (
    p.status === 'pending_approval' &&
    p.format === 'image' &&
    (meta?.review_stage ?? 'texto') !== 'design'
  );
}

// Rota certa ao clicar num post no Kanban/Dashboard: se o texto ainda está
// pendente, abre a FILA de aprovação de textos já focada nele; senão, o editor.
export function postClickRoute(p: UserPost): string {
  return isTextPending(p) ? `/posts/novo?retomar=1&post=${p.id}` : `/posts/${p.id}`;
}
