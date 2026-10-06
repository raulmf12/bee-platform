// MOTOR FOTOGRÁFICO DA HIVE — camada 1 e 2 (PURO, sem Deno; testável).
// Fonte: docs/fotografia/01 Constituição Fotográfica Global v1.0 e
//        02 Perfil Visual do Produtor · Marcos Piccini v1.1.
// Precedência: Constituição > Perfil > Estilo > Campanha > Formato.

export const CONSTITUTION_VERSION = 'hive_constituicao_fotografica_global_v1.0';
export const PRODUCER_ID = 'marcos_piccini';
export const PROFILE_VERSION = 'marcos_piccini_v1.1';

export type RefPriority = 'A0' | 'A' | 'B' | 'C' | 'D';
export type ExpressionId = 'E01' | 'E02' | 'E03' | 'E04' | 'E05';
export type Crop = 'close' | 'bust' | 'mid_body' | 'environmental' | 'full_body';
export type TextSpace = 'left' | 'right' | 'top' | 'bottom' | 'none';
export type Origin = 'real' | 'adaptada' | 'gerada';

// §6 Biblioteca de expressões (perfil v1.1).
export const EXPRESSIONS: Record<ExpressionId, { name: string; prompt: string; refs: string[] }> = {
  E01: { name: 'Atenção serena', prompt: 'calm attentive expression, mouth closed, steady but not hard gaze, eyebrows in natural position; conveys presence and discernment', refs: ['HAR_0472', 'HAR_0476', 'HAR_0489'] },
  E02: { name: 'Proximidade discreta', prompt: 'small genuine smile, relaxed jaw, gaze direct or slightly off camera; openness without advertising', refs: ['HAR_0474', 'HAR_0486', 'HAR_0616'] },
  E03: { name: 'Alegria espontânea', prompt: 'open spontaneous smile showing upper teeth, cheeks lifted, eyes naturally narrowed, head and body may tilt slightly', refs: ['HAR_0479', 'HAR_0484', 'HAR_0490', 'HAR_0615', 'HAR_0617', 'HAR_0716'] },
  E04: { name: 'Reflexão', prompt: 'reflective expression, gaze off camera, concentrated but not sad, mouth relaxed, head slightly tilted', refs: ['HAR_0720', 'HAR_0721', 'OPENHIVE_61', 'OPENHIVE_62'] },
  E05: { name: 'Fala engajada', prompt: 'engaged speech: mouth in natural articulation, gaze directed at a person or group, concentrated expression, low intensity, with a plausible restrained hand gesture', refs: ['OPENHIVE_61', 'OPENHIVE_62'] },
};

// §8 Vestuário aprovado (núcleo das referências).
export const WARDROBE: Record<string, { prompt: string; fits: string[] }> = {
  camiseta_preta: { prompt: 'plain black crew-neck t-shirt worn untucked, real fit, natural folds, with dark jeans or dark trousers when the body shows', fits: ['retrato', 'processo', 'bastidor', 'movimento'] },
  camisa_azul_marinho: { prompt: 'plain navy blue button shirt, sleeves possibly rolled, real fit, untucked or casually worn', fits: ['relacao', 'externo', 'retrato', 'movimento'] },
  camisa_azul_clara: { prompt: 'plain light blue dress shirt, open collar, no tie, real fit', fits: ['formal', 'institucional', 'relacao', 'processo'] },
  colete_cinza: { prompt: 'grey padded vest over a light shirt, as in the real reference', fits: ['externo_frio'] },
};

// §9 Ambientes compatíveis (genéricos e plausíveis — nunca biografia falsa).
export const ENVIRONMENTS: Record<string, string> = {
  parede_texturizada: 'neutral textured wall with soft window light, real but not descriptive',
  estante_suave: 'soft out-of-focus real bookshelf, modest, not luxurious',
  janela_luz: 'beside a window with soft natural daylight, a quiet interior',
  cafe_silencioso: 'a quiet café with low circulation, warm wood, no brand or readable signage',
  mesa_trabalho: 'a realistic contemporary work table, lived-in but organized, non-ostentatious',
  biblioteca_discreta: 'a discreet realistic library corner, not monumental',
  jardim: 'a protected garden or green courtyard, everyday, not epic',
  area_urbana_tranquila: 'a calm urban sidewalk or square with trees and discreet architecture, low circulation',
  corredor_luz_natural: 'a corridor or passage with natural light, contemporary discreet architecture',
  passagem_interior_exterior: 'a wide doorway or passage between interior and exterior, light changing naturally',
  escada_rampa: 'a small wide low staircase or ramp in a contemporary everyday space',
  varanda: 'an inhabitable balcony or terrace with a near foreground and a medium-distance view',
  sala_conversa: 'a neutral conversation room with simple armchairs or a small table, no brand',
  sala_aprendizagem: 'a simple learning or workshop room without corporate identity, small group scale',
};

// §11–12 Manifesto de referências (nome-base do arquivo → nível + papéis).
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

// §13 Contrato de identidade (estrutural, vai em TODO prompt).
export const IDENTITY_CONTRACT = [
  'IDENTITY LOCK (strict) — producer: Marcos Piccini, profile marcos_piccini_v1.1.',
  'Reference roles: the reference photos define the exact face, apparent age (51), hair, beard and skin texture. A0 references (2026-09-23), when present, prevail for weight, waist, silhouette and body proportions; otherwise the half-body library photos define the torso. A references define facial identity and approved expressions. B/C references support posture, clothing and natural light. D references are historical anatomy/speech support only — never their longer hair, fuller beard or older body volume.',
  'Appearance: man, 51; short naturally textured hair that is predominantly DARK BROWN, with natural gray concentrated at the temples/sides (the top stays mostly dark brown — never an overall gray or silver head), short on the sides, short-to-medium and lightly textured on top (never longer or messier than the references), exact hairline from references; short trimmed brown beard with natural gray, naturally irregular, fuller at the chin than the cheeks, moustache integrated; light eyes that read green/grey/blue depending on light (never intensified); face medium-to-wide, between oval and slightly rectangular, broad forehead, present but not angular jaw, rounded chin, natural cheek volume; natural skin with pores, forehead and eye lines, no beauty retouch; average current build, leaner than older photos, natural waist and abdomen volume, no athletic definition, natural shoulders.',
  'Preserve exactly: face geometry and proportions, eye shape and spacing, nose width/length/projection, mouth, jaw, ears, hairline, gray hair, beard distribution, apparent age, small natural asymmetries, current body proportions.',
  'Tone: quiet authority, low performance, high naturalism, documentary feel — an experienced presence that observes before asserting and approaches without losing depth.',
].join(' ');

export const HARD_AVOID = [
  'facial reconstruction', 'rejuvenation or aging', 'eye color enhancement', 'denser hair or changed hairline', 'darker uniform or drawn beard',
  'sharpened jaw', 'face or body slimmer or heavier than the current references', 'historical body volume', 'athletic definition', 'enlarged shoulders',
  'plastic or retouched skin', 'idealized teeth', 'generic executive pose', 'motivational speaker pose', 'guru pose', 'celebrity portrait',
  'luxury setting or status symbols', 'fake event, fake client, fake audience', 'readable invented text', 'logos, brands, badges', 'watermark',
  'HDR, cinematic or teal-and-orange grading', 'excessive bokeh', 'film border, frame or vignette edges', 'signage or lettering in the background', 'epic or heroic lighting', 'stock-photo look', 'visibly AI-generated look',
];

// §4–5: crops que exigem o corpo atual (A0). Sem A0, a Regra de insuficiência
// (Constituição §4.4) manda escolher cenas de menor reconstrução.
export const BODY_CROPS: Crop[] = ['mid_body', 'environmental', 'full_body'];

// Formatos-base (Constituição §8.3).
export const FORMATS: Record<string, { aspect: string; w: number; h: number }> = {
  instagram_feed: { aspect: '4:5', w: 1080, h: 1350 },
  instagram_story: { aspect: '9:16', w: 1080, h: 1920 },
  linkedin_feed: { aspect: '4:5', w: 1200, h: 1500 },
  quadrado: { aspect: '1:1', w: 1080, h: 1080 },
  horizontal: { aspect: '16:9', w: 1200, h: 627 },
};
