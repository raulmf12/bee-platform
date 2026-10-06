// Nomes dos estilos/variações do motor fotográfico (espelho de
// supabase/functions/_shared/photo-styles.ts — só os rótulos, pra UI).
export const STYLE_NAMES: Record<string, string> = {
  F01: 'Presença autoral', F02: 'Pensamento em processo', F03: 'Campo relacional', F04: 'Movimento e horizonte',
};
export const STYLE_ESSENCE: Record<string, string> = {
  F01: 'O produtor não ilustra a ideia. Ele sustenta a ideia com sua presença.',
  F02: 'A câmera encontra o produtor pensando; não o produtor representando que pensa.',
  F03: 'A relação não é cenário para a autoridade. É o lugar onde ela se revela.',
  F04: 'O futuro não aparece como promessa distante. Aparece como espaço que começa a ser percorrido.',
};
export const VARIANT_NAMES: Record<string, string> = {
  'F01-A': 'Presença direta', 'F01-B': 'Pensamento presente', 'F01-C': 'Proximidade humana', 'F01-D': 'Presença em contexto',
  'F02-A': 'Escrita e elaboração', 'F02-B': 'Leitura e investigação', 'F02-C': 'Trabalho em construção', 'F02-D': 'Pausa de integração',
  'F03-A': 'Escuta presente', 'F03-B': 'Diálogo aberto', 'F03-C': 'Construção compartilhada', 'F03-D': 'Presença no coletivo', 'F03-E': 'Facilitação em pé', 'F03-F': 'Apresentação dialogada',
  'F04-A': 'Caminho em curso', 'F04-B': 'Limiar', 'F04-C': 'Mudança de perspectiva', 'F04-D': 'Horizonte habitável',
};
// Variações que mostram corpo (exigem as referências A0 de aparência atual).
export const BODY_VARIANTS = new Set(['F01-D', 'F02-A', 'F02-B', 'F02-C', 'F02-D', 'F03-A', 'F03-B', 'F03-C', 'F03-D', 'F03-E', 'F03-F', 'F04-A', 'F04-B', 'F04-C', 'F04-D']);
export const STYLE_VARIANTS: Record<string, string[]> = {
  F01: ['F01-A', 'F01-B', 'F01-C', 'F01-D'], F02: ['F02-A', 'F02-B', 'F02-C', 'F02-D'],
  F03: ['F03-A', 'F03-B', 'F03-C', 'F03-D', 'F03-E', 'F03-F'], F04: ['F04-A', 'F04-B', 'F04-C', 'F04-D'],
};
export const EXPRESSION_NAMES: Record<string, string> = { E01: 'Atenção serena', E02: 'Proximidade discreta', E03: 'Alegria espontânea', E04: 'Reflexão', E05: 'Fala engajada' };

// Manifesto de referências (espelho de photo-profile.ts — um teste garante que são iguais).
export type RefPriority = 'A0' | 'A' | 'B' | 'C' | 'D';
export interface RefManifestItem { key: string; priority: RefPriority; roles: string[] }
export const REFERENCE_MANIFEST: RefManifestItem[] = [
  { key: '20260923_152032', priority: 'A0', roles: ['current_face_front', 'current_upper_body', 'tshirt_out'] },
  { key: '20260923_152113', priority: 'A0', roles: ['current_face_three_quarter', 'current_upper_body', 'tshirt_out'] },
  { key: '20260923_152200', priority: 'A0', roles: ['current_profile_left', 'current_torso', 'tshirt_out'] },
  { key: '20260923_152211', priority: 'A0', roles: ['current_profile_right', 'current_torso', 'tshirt_out'] },
  { key: '20260923_152253', priority: 'A0', roles: ['current_front', 'waist_definition', 'technical_tucked_shirt'] },
  { key: '20260923_152312', priority: 'A0', roles: ['current_three_quarter_left', 'waist_definition', 'technical_tucked_shirt'] },
  { key: '20260923_152321', priority: 'A0', roles: ['current_three_quarter_right', 'waist_definition', 'technical_tucked_shirt'] },
  { key: '20260923_152329', priority: 'A0', roles: ['current_front', 'current_torso', 'waist_definition'] },
  { key: '20260923_153259', priority: 'A0', roles: ['current_full_body_front', 'body_proportions', 'stance'] },
  { key: '20260923_153309', priority: 'A0', roles: ['current_full_body_profile_left', 'body_proportions'] },
  { key: '20260923_153320', priority: 'A0', roles: ['current_full_body_profile_right', 'body_proportions'] },
  { key: '20260923_153330', priority: 'A0', roles: ['current_full_body_three_quarter_left', 'body_proportions'] },
  { key: '20260923_153339', priority: 'A0', roles: ['current_full_body_three_quarter_right', 'body_proportions'] },
  { key: 'HAR_0472', priority: 'A', roles: ['face_front', 'neutral', 'hair', 'beard', 'skin'] },
  { key: 'HAR_0474', priority: 'A', roles: ['face_front', 'soft_smile', 'eyes'] },
  { key: 'HAR_0476', priority: 'A', roles: ['three_quarter', 'neutral', 'face_geometry'] },
  { key: 'HAR_0479', priority: 'A', roles: ['open_smile', 'teeth', 'cheek_motion'] },
  { key: 'HAR_0484', priority: 'A', roles: ['mid_body', 'open_smile', 'crossed_arms'] },
  { key: 'HAR_0486', priority: 'A', roles: ['mid_body', 'soft_smile', 'posture'] },
  { key: 'HAR_0489', priority: 'A', roles: ['mid_body', 'neutral', 'posture'] },
  { key: 'HAR_0490', priority: 'A', roles: ['laughter', 'body_inclination', 'spontaneity'] },
  { key: 'HAR_0615', priority: 'B', roles: ['black_tshirt', 'mid_body', 'open_smile'] },
  { key: 'HAR_0616', priority: 'B', roles: ['black_tshirt', 'three_quarter', 'soft_smile'] },
  { key: 'HAR_0617', priority: 'B', roles: ['black_tshirt', 'front', 'open_smile'] },
  { key: 'HAR_0716', priority: 'C', roles: ['outdoor', 'leaning', 'open_smile'] },
  { key: 'HAR_0719', priority: 'C', roles: ['outdoor', 'seated', 'mid_body'] },
  { key: 'HAR_0720', priority: 'C', roles: ['outdoor', 'close_portrait', 'reflection'] },
  { key: 'HAR_0721', priority: 'C', roles: ['outdoor', 'seated', 'three_quarter'] },
  { key: 'OPENHIVE_61', priority: 'D', roles: ['speech', 'eye_dynamics', 'older_visual_state'] },
  { key: 'OPENHIVE_62', priority: 'D', roles: ['speech', 'three_quarter', 'older_visual_state'] },
];

// Normaliza um nome de arquivo para a chave do manifesto (aceita "HAR_0476(1).jpg",
// "marcos_05_HAR_0476.jpg", "Open Hive_foto- Leandro Viola-61 (1)(2).jpg"...).
export function manifestKeyOf(fileName: string): string | null {
  const n = fileName.replace(/\.[a-z0-9]+$/i, '');
  const dated = n.match(/(2026\d{4}_\d{6})/);
  if (dated) return REFERENCE_MANIFEST.some((m) => m.key === dated[1]) ? dated[1] : null;
  const har = n.match(/HAR_(\d{4})/i);
  if (har) { const k = `HAR_${har[1]}`; return REFERENCE_MANIFEST.some((m) => m.key === k) ? k : null; }
  const oh = n.match(/Leandro Viola-(\d{2})/i) ?? n.match(/OPENHIVE_(\d{2})/i);
  if (oh) { const k = `OPENHIVE_${oh[1]}`; return REFERENCE_MANIFEST.some((m) => m.key === k) ? k : null; }
  return null;
}
