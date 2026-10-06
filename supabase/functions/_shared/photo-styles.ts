// MOTOR FOTOGRÁFICO DA HIVE — camada 3: estilos F01–F04 (PURO, testável).
// Fonte: docs/fotografia/03–06 (F01 Presença autoral v1.0, F02 Pensamento em
// processo v1.0, F03 Campo relacional v1.1, F04 Movimento e horizonte v1.0).
import type { Crop, ExpressionId } from './photo-profile.ts';

export type StyleId = 'F01' | 'F02' | 'F03' | 'F04';

export interface Variant {
  id: string; style: StyleId; name: string; operation: string;
  scene: string;        // cena (prompt)
  framing: string;      // enquadramento (prompt)
  crop: Crop;
  expressions: ExpressionId[];
  gaze: 'camera' | 'off_camera' | 'person_out_of_frame' | 'interlocutor' | 'path';
  environments: string[];
  wardrobe: string[];
  avoid: string[];
  people?: string;      // F03: outras pessoas (editoriais, não identificáveis)
}

export interface Style {
  id: StyleId; name: string; essence: string; useCase: string; primaryRequest: string;
  lens: string; light: string; positive: string[]; negative: string[];
  gates: string[];      // perguntas de qualidade específicas (Q1–Q5)
  hardReject: string[];
  avoid: string[];
}

export const STYLES: Record<StyleId, Style> = {
  F01: {
    id: 'F01', name: 'Presença autoral', essence: 'O produtor não ilustra a ideia. Ele sustenta a ideia com sua presença.',
    useCase: 'photorealistic-natural · editorial portrait for social content',
    primaryRequest: 'create a plausible documentary-style portrait of the referenced producer, preserving his identity exactly and placing him in the approved F01 variation. Authentic editorial photography, visually indistinguishable from a real photograph, not advertising photography.',
    lens: '50–85mm equivalent (35–50mm for environmental), eye-level camera, natural perspective, moderate depth of field (background soft but recognizable, bokeh never dominant), natural not crispy sharpness, optional subtle grain',
    light: 'natural or apparently natural light, soft side or diffuse frontal, low-to-medium contrast, shadows with detail, neutral to slightly warm temperature, true skin, restrained saturation (greens, woods, greys, blues, natural neutrals), no teal-and-orange, no cinematic light',
    positive: ['primeira pessoa', 'posição', 'crença', 'provocação', 'experiência pessoal', 'princípio'],
    negative: [],
    gates: [
      'A imagem aproxima a pessoa da ideia — ou apenas usa o rosto para chamar atenção?',
      'Foto e produtor parecem pertencer à mesma fotografia (luz, nitidez e perspectiva coerentes)?',
    ],
    hardReject: ['rosto só semelhante', 'rejuvenescido', 'corpo diferente do A0', 'cabelo mais cheio', 'olhos saturados', 'barba uniforme/desenhada', 'pele plástica', 'sorriso publicitário', 'dentes idealizados', 'fundo de luxo', 'pose de guru/palestrante', 'expressão fora da biblioteca', 'mãos deformadas', 'texto/logo falso', 'nitidez rosto≠corpo', 'luz incompatível', 'aparência de IA'],
    avoid: ['generic corporate profile photo', 'celebrity shoot', 'performed authority', 'seductive advertising', 'emotional dramatization', 'glamour', 'solemnity'],
  },
  F02: {
    id: 'F02', name: 'Pensamento em processo', essence: 'A câmera encontra o produtor pensando; não o produtor representando que pensa.',
    useCase: 'identity-preserve · editorial producer photography',
    primaryRequest: 'show Marcos Piccini in the middle of a real intellectual process. The scene must feel observed rather than posed. Thought is conveyed through credible attention, body posture, one functional object and an inhabited environment — never through productivity clichés.',
    lens: '35–65mm equivalent, moderate depth of field, focus on the eyes or the eyes–object relation, camera at gaze or activity height, human perspective, no dramatic tilt',
    light: 'diffuse natural light or a plausible mix of window and ambient light, low-to-moderate contrast, preserved shadows, warm or neutral tones without orange filter, no cinematic rim light, halo or spiritual light',
    positive: ['compreender', 'elaborar', 'investigar', 'perceber', 'distinguir', 'estudar', 'escrever', 'integrar', 'revisar', 'perguntar', 'sentido', 'padrão', 'método', 'hipótese', 'aprendizagem'],
    negative: ['anunciar', 'convocar', 'celebrar', 'vender', 'reunir', 'conduzir grupo', 'caminhar', 'horizonte'],
    gates: [
      'A ação parece ter começado antes da fotografia? Olhos, mãos, objeto e postura contam a mesma ação? O objeto está sendo usado e não exibido?',
      'Há elaboração perceptível sem expressão caricata, sem propaganda de produtividade?',
      'Texto em páginas ou telas está ausente ou ilegível?',
    ],
    hardReject: ['identity_drift', 'current_body_mismatch', 'historical_body_transfer', 'additional_slimming', 'age_change', 'malformed_hands', 'incoherent_gaze', 'fake_readable_text', 'fake_client_or_event', 'productivity_theater', 'generic_stock_photo', 'luxury_status_scene', 'guru_or_spiritual_pose', 'beauty_retouching', 'excessive_props', 'visible_brand_or_watermark'],
    avoid: ['productivity theater', 'staged intelligence', 'hand on chin', 'posed pen', 'looking at camera while typing', 'luxury office', 'heroic horizon gaze', 'spiritual pose', 'excess props (one main object, at most two supporting)', 'invented glasses or watch', 'malformed fingers'],
  },
  F03: {
    id: 'F03', name: 'Campo relacional', essence: 'A relação não é cenário para a autoridade. É o lugar onde ela se revela.',
    useCase: 'identity-preserve · conceptual editorial producer photography',
    primaryRequest: 'show Marcos Piccini in a credible human interaction where authority is expressed through listening, dialogue, contribution, facilitation or a presentation sustained in relationship. The relational field is the subject. Marcos must not appear as a celebrity, unilateral lecturer or dominant center. FACTUAL STATUS: conceptual editorial scene only — do not imply a real client, company, team, event, class or documented engagement.',
    lens: '35–70mm equivalent, camera at participants height, depth of field enough to keep the relationship, foreground may include another person shoulder or gesture, no telephoto isolating Marcos, no wide angle deforming people at the edges',
    light: 'diffuse natural or plausible ambient light, moderate contrast, coherent skin tones across participants, nobody lit as protagonist, not corporate-event photography',
    positive: ['escutar', 'conversar', 'dialogar', 'cocriar', 'colaborar', 'confiar', 'relacionar', 'equipe', 'cultura', 'conflito', 'facilitar', 'coletivo', 'campo', 'encontro', 'vínculo'],
    negative: ['anunciar', 'estudar', 'escrever', 'caminhar', 'conquistar', 'celebrar evento real'],
    gates: [
      'Todos os olhares têm destino coerente? Os dois olhos de cada pessoa convergem naturalmente para o mesmo destino? Ninguém olha para a câmera?',
      'Corpos e distâncias respondem à mesma interação? Existe reciprocidade mesmo quando Marcos fala?',
      'Marcos escuta/participa/contribui/facilita conforme a variante, sem centralidade artificial, sem professor unilateral, guru ou palestrante?',
      'A imagem é claramente editorial e não prova de um trabalho real (nenhum cliente, marca, empresa, evento ou local sugerido)?',
    ],
    hardReject: ['identity_drift', 'current_body_mismatch', 'incoherent_mutual_gaze', 'malformed_hands_or_bodies', 'fake_client_team_or_event', 'identifiable_brand_or_location', 'unilateral_lecturer_or_guru_pose', 'crossed_or_incoherent_eyes', 'admiring_audience_or_applause', 'corporate_handshake', 'staged_brainstorming', 'dominant_center_composition', 'spiritual_or_therapy_scene', 'forced_stock_diversity', 'generic_corporate_stock_photo', 'historical_body_transfer', 'additional_slimming', 'visible_text_logo_badge_or_watermark'],
    avoid: ['fake client or team claim', 'unilateral lecture', 'elevated stage', 'spectacle lighting', 'applause', 'handshake', 'pointing finger', 'sales meeting', 'executive boardroom', 'everyone admiring Marcos', 'staged brainstorming', 'wall of post-its', 'readable flip-chart or slide content', 'forced diversity', 'constant smiles', 'spiritual circle', 'therapy scene', 'crossed or incoherent eyes', 'any participant looking at camera', 'badges, microphone or remote control'],
  },
  F04: {
    id: 'F04', name: 'Movimento e horizonte', essence: 'O futuro não aparece como promessa distante. Aparece como espaço que começa a ser percorrido.',
    useCase: 'identity-preserve · editorial producer photography',
    primaryRequest: 'show Marcos Piccini in a credible real-world transition or movement. The body is already engaged with a next step. The future is suggested by usable space and direction, never by epic landscape, heroic pose or obvious metaphor.',
    lens: '35–70mm equivalent, shutter fast enough to keep a natural gesture (slight residual motion only at the extremities, never the face), camera between waist and eye height, human perspective, no heroic low angle, no aerial view',
    light: 'natural light coherent with the time of day — morning, neutral late afternoon or open shade — moderate contrast, no excessive golden light, no symbolic light on the destination',
    positive: ['atravessar', 'avançar', 'seguir', 'começar', 'continuar', 'deslocar', 'transição', 'caminho', 'direção', 'possibilidade', 'futuro', 'próximo passo', 'passagem', 'movimento', 'abertura'],
    negative: ['explicar', 'estudar', 'escrever', 'conversar', 'reunir', 'celebrar', 'conquistar'],
    gates: [
      'O apoio dos pés é fisicamente possível? Braços, quadris e tronco respondem ao mesmo passo? A ação parece capturada e não posada?',
      'O espaço à frente comunica possibilidade sem destino glorioso? A metáfora permanece sutil?',
      'Nenhum lugar, viagem, cliente ou evento inexistente é sugerido como real?',
    ],
    hardReject: ['identity_drift', 'current_body_mismatch', 'historical_body_transfer', 'additional_slimming', 'elongated_legs', 'enlarged_shoulders', 'impossible_gait', 'malformed_feet_or_hands', 'heroic_pose', 'epic_landscape', 'sunset_cliche', 'tunnel_or_portal_metaphor', 'fake_travel_or_event', 'luxury_status_scene', 'generic_stock_photo', 'visible_brand_text_or_watermark'],
    avoid: ['heroic walk', 'fashion runway', 'motivational pose', 'arms open', 'sunset', 'mountain', 'empty road', 'tunnel light', 'portal symbolism', 'victory pose', 'luxury skyline', 'fake travel', 'dramatic loneliness', 'elongated legs', 'malformed feet', 'hands in pockets as a rule', 'backpack, briefcase or luggage without narrative function', 'excessive motion blur'],
  },
};

export const VARIANTS: Variant[] = [
  // ---------------- F01 ----------------
  { id: 'F01-A', style: 'F01', name: 'Presença direta', operation: 'posição + encontro',
    scene: 'Marcos looks into the lens with a serene expression, creating a direct encounter without confrontation. Neutral, real, low-information environment: window light, textured wall, soft bookshelf or discreet outdoor area — recognizable but not descriptive.',
    framing: 'open close-up, bust or short half-body; camera at eye level; face frontal or at most 15° off; direct gaze into the lens; shoulders slightly angled to avoid rigidity; negative space on one side',
    crop: 'bust', expressions: ['E01', 'E02'], gaze: 'camera',
    environments: ['parede_texturizada', 'estante_suave', 'janela_luz', 'jardim'], wardrobe: ['camiseta_preta', 'camisa_azul_marinho', 'camisa_azul_clara'],
    avoid: ['crossed arms as default', 'open smile', 'corporate background', 'dramatic light', 'excessive symmetric centering', 'CV headshot'] },
  { id: 'F01-B', style: 'F01', name: 'Pensamento presente', operation: 'autoria + elaboração',
    scene: 'Marcos does not look at the camera; an intermediate instant of thought, never the cliché "thinker" pose. Window, quiet café, library, workspace or outdoor area — the environment exists without narrating a specific action.',
    framing: 'bust or half-body; face in three-quarter; gaze to the side, slightly below or beyond the camera; visual space preserved in the direction of the gaze; Marcos off-center; hands absent or naturally resting',
    crop: 'bust', expressions: ['E01', 'E04'], gaze: 'off_camera',
    environments: ['janela_luz', 'cafe_silencioso', 'biblioteca_discreta', 'mesa_trabalho', 'jardim'], wardrobe: ['camiseta_preta', 'camisa_azul_marinho', 'camisa_azul_clara'],
    avoid: ['hand on chin', 'theatrical upward gaze', 'sad expression', 'window with luxury city view', 'extreme depth of field', 'stock "man thinking"'] },
  { id: 'F01-C', style: 'F01', name: 'Proximidade humana', operation: 'autoria + abertura',
    scene: 'Marcos appears closer, spontaneous and accessible; the image reduces distance without diluting authority. Contained warm natural light; table, café, garden, corridor or shared space; discreet secondary objects.',
    framing: 'close-up, bust or short half-body; close camera without wide angle; gaze to the camera or to someone out of frame; slightly asymmetric composition; small body movements allowed',
    crop: 'bust', expressions: ['E02', 'E03'], gaze: 'person_out_of_frame',
    environments: ['cafe_silencioso', 'jardim', 'corredor_luz_natural', 'mesa_trabalho'], wardrobe: ['camiseta_preta', 'camisa_azul_marinho'],
    avoid: ['mandatory smile', 'artificially perfect teeth', 'influencer pose', 'frozen laughter without context', 'unauthorized domestic intimacy', 'generic party setting'] },
  { id: 'F01-D', style: 'F01', name: 'Presença em contexto', operation: 'autoria + mundo real',
    scene: 'The environment gains space but Marcos remains the semantic center; no main action, a situated presence. Realistic workspace, discreet architecture, café, library, garden or calm urban area; no client, audience or fabricated event.',
    framing: 'wide half-body; Marcos occupies about 30–50% of the frame, environment 50–70%; direct or lateral gaze; body may lean or sit; planned negative space for the layout',
    crop: 'environmental', expressions: ['E01', 'E02', 'E04'], gaze: 'off_camera',
    environments: ['mesa_trabalho', 'biblioteca_discreta', 'cafe_silencioso', 'jardim', 'area_urbana_tranquila'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta', 'camisa_azul_clara'],
    avoid: ['environment as status symbol', 'epic landscape', 'tiny producer in frame', 'scenery more interesting than the person', 'fashion campaign posture', 'scenographic props without function'] },
  // ---------------- F02 ----------------
  { id: 'F02-A', style: 'F02', name: 'Escrita e elaboração', operation: 'writing_or_mapping · attention: notebook',
    scene: 'Seated at a realistic table, Marcos records or develops an idea in an open notebook with a functional pen; writing already in progress, not a pose with the pen; a laptop may exist closed or to the side without competing; hands visible only if anatomically reliable.',
    framing: 'lateral or three-quarter half-body, or over-the-shoulder without hiding the face entirely, or a wider detail of the face–hand–notebook relation; lateral negative space',
    crop: 'mid_body', expressions: ['E04'], gaze: 'off_camera',
    environments: ['mesa_trabalho', 'cafe_silencioso', 'janela_luz'], wardrobe: ['camiseta_preta', 'camisa_azul_clara'],
    avoid: ['legible invented handwriting', 'board full of formulas', 'pen suspended as a pose', 'perfectly organized desk', 'excess post-its', 'productivity-influencer aesthetic'] },
  { id: 'F02-B', style: 'F02', name: 'Leitura e investigação', operation: 'reading_or_reviewing · attention: material',
    scene: 'Reading seated in a silent environment, attentive contact with a book, report or a few pages of plausible scale; gaze truly on the page; a mark or fold may show use; the face remains recognizable.',
    framing: 'medium three-quarter, soft lateral, or environmental with table, armchair or discreet bench; close-up only if the material still belongs to the narrative',
    crop: 'mid_body', expressions: ['E01', 'E04'], gaze: 'off_camera',
    environments: ['biblioteca_discreta', 'janela_luz', 'cafe_silencioso', 'varanda'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta'],
    avoid: ['book as a prop only', 'visible invented titles or authors', 'luxurious monumental library', 'added glasses', 'hand on chin', 'professorial expression'] },
  { id: 'F02-C', style: 'F02', name: 'Trabalho em construção', operation: 'reviewing_and_connecting · attention: screen_and_notes',
    scene: 'Marcos reviews an idea between a laptop in use (no prominent brand) and a few sheets or a notebook; gaze alternating between screen and note; body slightly leaning into the activity; sober contemporary non-ostentatious environment. The center is the intellectual construction, not the computer.',
    framing: 'lateral or three-quarter wide half-body; camera at table height or slightly above; screen without legible content',
    crop: 'mid_body', expressions: ['E04'], gaze: 'off_camera',
    environments: ['mesa_trabalho', 'janela_luz'], wardrobe: ['camiseta_preta', 'camisa_azul_clara', 'camisa_azul_marinho'],
    avoid: ['generic typing looking at camera', 'multiple screens, decorative charts or dashboards', 'stock executive desk', 'coffee + phone + headphones cliché collection', 'urgency look', 'overly perfect home office'] },
  { id: 'F02-D', style: 'F02', name: 'Pausa de integração', operation: 'pausing_and_integrating · attention: internal_or_near_distance',
    scene: 'Thought continues while external action slows: seated by a table, window or light passage; a notebook, book or sheet stays in the field as a trace of the action; gaze displaced from the object for an instant; relaxed body without theatricality; a sense he will return to the activity.',
    framing: 'half-body with environment, three-quarter near the window, or soft profile with a discreet foreground; asymmetric breathing composition',
    crop: 'mid_body', expressions: ['E04'], gaze: 'off_camera',
    environments: ['janela_luz', 'mesa_trabalho', 'varanda', 'cafe_silencioso'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta'],
    avoid: ['epic horizon gaze', 'sad or exhausted face', 'hands joined in a spiritual pose', 'staged meditation', 'dramatic isolation', 'mystic nature'] },
  // ---------------- F03 ----------------
  { id: 'F03-A', style: 'F03', name: 'Escuta presente', operation: 'listening · group 2 · receiver',
    scene: 'One-to-one conversation in a neutral quiet environment; the interlocutor partially visible, from behind or three-quarter in the foreground; Marcos oriented to the person, not to the camera; attentive face without automatic smile; relaxed hands, body slightly available.',
    framing: 'over the interlocutor shoulder; three-quarter half-body; focus on Marcos with the other legibly present; intimate composition that does not look like therapy',
    crop: 'mid_body', expressions: ['E01', 'E04'], gaze: 'interlocutor', people: 'one adult interlocutor, non-identifiable editorial person, partially visible',
    environments: ['sala_conversa', 'cafe_silencioso', 'varanda', 'jardim'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta'],
    avoid: ['exaggerated torso lean', 'performed agreement', 'hand on chin', 'judging face', 'crying or vulnerable interlocutor', 'therapeutic setting'] },
  { id: 'F03-B', style: 'F03', name: 'Diálogo aberto', operation: 'dialoguing · group 2 · participant',
    scene: 'A balanced exchange at a table, armchairs or semi-open space; Marcos speaks with a contained plausible gesture while the interlocutor follows with natural attention; distance and objects create no barrier; neither dominates the composition.',
    framing: 'medium shot with both present, crossed lateral, or three-quarter of Marcos with the interlocutor in secondary focus; camera slightly off the conversation axis',
    crop: 'mid_body', expressions: ['E05', 'E02'], gaze: 'interlocutor', people: 'one adult interlocutor, non-identifiable editorial person',
    environments: ['sala_conversa', 'cafe_silencioso', 'varanda'], wardrobe: ['camisa_azul_marinho', 'camisa_azul_clara'],
    avoid: ['pointing finger', 'overly open hands', 'permanent smile', 'handshake', 'negotiation table', 'sales or interview look'] },
  { id: 'F03-C', style: 'F03', name: 'Construção compartilhada', operation: 'co_creating · group 3–4 · contributor',
    scene: 'A small group of three or four around a table or work surface; one notebook, a large sheet or a few cards as the shared center; Marcos participates without taking the center of the table; attention circulates between people and material; natural varied clothing.',
    framing: 'environmental three-quarter; camera at group height; asymmetric composition; at least three legible relational presences; hands only when anatomically reliable',
    crop: 'environmental', expressions: ['E01', 'E05', 'E02'], gaze: 'interlocutor', people: 'two or three adult participants, non-identifiable, natural varied clothing',
    environments: ['sala_aprendizagem', 'mesa_trabalho', 'sala_conversa'], wardrobe: ['camiseta_preta', 'camisa_azul_marinho'],
    avoid: ['wall covered with post-its', 'people pointing simultaneously', 'advertising laughter', 'catalog diversity', 'generic corporate meeting', 'readable invented text'] },
  { id: 'F03-D', style: 'F03', name: 'Presença no coletivo', operation: 'holding_collective_space · group 4–7 · facilitator',
    scene: 'A small circle or semicircle in a simple room; Marcos seated or standing at the same symbolic height as the group; one person speaks or the group holds a pause; the center remains relational, not performative; no stage, microphone, projection or brand.',
    framing: 'intimate wide shot; Marcos in three-quarter integrated into the circle; participants may appear partially; discreet architecture and natural light',
    crop: 'environmental', expressions: ['E01', 'E04'], gaze: 'interlocutor', people: 'three to six adult participants seated in a circle, non-identifiable',
    environments: ['sala_aprendizagem', 'sala_conversa'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta'],
    avoid: ['audience', 'teacher posture', 'everyone looking at Marcos', 'spiritualized circle', 'holding hands', 'stock corporate training', 'event simulation'] },
  { id: 'F03-E', style: 'F03', name: 'Facilitação em pé', operation: 'facilitating_standing · group 4–10 · facilitator · flip chart',
    scene: 'Marcos standing beside a simple flip chart or board; a small group seated or in a semicircle in the same room; explaining or questioning gesture directed at the people; the board holds only strokes, shapes or blurred illegible words; someone may respond; no company mark, program name or event identity.',
    framing: 'wide medium or full body; camera at participants height; Marcos off-center to preserve the group and the board; part of the group visible and relationally active',
    crop: 'full_body', expressions: ['E05', 'E01'], gaze: 'interlocutor', people: 'three to eight adult participants, partially visible, non-identifiable',
    environments: ['sala_aprendizagem'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta', 'camisa_azul_clara'],
    avoid: ['back fully turned to the group', 'pointing at invented legible text', 'wall of post-its', 'unilateral teacher posture', 'identifiable corporate room', 'performative training dynamic'] },
  { id: 'F03-F', style: 'F03', name: 'Apresentação dialogada', operation: 'presenting_dialogically · group 6–20 · presenter_in_relation',
    scene: 'Marcos standing before a near group without an elevated stage; a neutral wall, screen or blurred projection may support the talk; contained gesture and eye contact with one specific person; participants partially in the foreground or side; an amplified conversation, not a spectacle.',
    framing: 'medium or full body; camera slightly lateral to the audience; includes Marcos and at least two presences of the group; the screen never occupies the narrative center',
    crop: 'full_body', expressions: ['E05', 'E02'], gaze: 'interlocutor', people: 'five to twelve adult participants seated close, partially visible, non-identifiable',
    environments: ['sala_aprendizagem'], wardrobe: ['camisa_azul_marinho', 'camisa_azul_clara'],
    avoid: ['stage, spotlight, pulpit or grand auditorium', 'microphone unless indispensable', 'admiring audience or applause', 'motivational-speaker pose', 'slides, brands, titles or invented data', 'expansive performance gesture'] },
  // ---------------- F04 ----------------
  { id: 'F04-A', style: 'F04', name: 'Caminho em curso', operation: 'walking · everyday path',
    scene: 'Marcos walks through a real environment — tree-lined sidewalk, outdoor passage, courtyard or discreet path; a natural step captured laterally or in three-quarter; arms in spontaneous movement; gaze oriented to the path, not the camera; no mandatory object. Continuity, not a heroic departure.',
    framing: 'full body or wide medium shot; lateral or front three-quarter; negative space ahead of the movement',
    crop: 'full_body', expressions: ['E01', 'E04'], gaze: 'path',
    environments: ['area_urbana_tranquila', 'jardim', 'corredor_luz_natural'], wardrobe: ['camiseta_preta', 'camisa_azul_marinho'],
    avoid: ['model walk', 'hands in pockets as a rule', 'empty road', 'mountain, deserted beach or sunset', 'back to camera centered in an epic landscape', 'excessive motion blur'] },
  { id: 'F04-B', style: 'F04', name: 'Limiar', operation: 'crossing_threshold · doorway, corridor or passage',
    scene: 'Marcos crosses or approaches an architectural passage — wide door, corridor, portico or interior-exterior transition; body captured before or during the passage; light changes naturally between spaces; face visible in three-quarter or profile; discreet contemporary architecture.',
    framing: 'full body or three-quarter body; lateral composition; partial architectural frame; visible depth after the passage',
    crop: 'full_body', expressions: ['E01', 'E04'], gaze: 'path',
    environments: ['passagem_interior_exterior', 'corredor_luz_natural'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta'],
    avoid: ['bright door or fantastic portal', 'dark tunnel with light at the end', 'opening doors toward the camera', 'religious symbolism', 'monumental setting', 'frozen frontal pose at the doorframe'] },
  { id: 'F04-C', style: 'F04', name: 'Mudança de perspectiva', operation: 'ascending_or_repositioning · stairs, ramp or terrace',
    scene: 'Marcos goes along a wide low staircase, ramp, garden on levels or urban terrace; natural non-athletic body movement; camera to the side or diagonal; useful habitable environment; ascending direction may exist without meaning success.',
    framing: 'environmental full body; wide shot with soft architectural lines; rear three-quarter only if the face is still recognizable; free area in the direction of travel',
    crop: 'full_body', expressions: ['E01', 'E04'], gaze: 'path',
    environments: ['escada_rampa', 'varanda', 'jardim'], wardrobe: ['camiseta_preta', 'camisa_azul_marinho'],
    avoid: ['monumental staircase', 'heroic low angle', 'running or physical effort', 'lit summit as a reward', 'institutional advertising composition', 'identifiable corporate building'] },
  { id: 'F04-D', style: 'F04', name: 'Horizonte habitável', operation: 'observing_and_preparing_to_move · open but inhabited',
    scene: 'Marcos meets a wider field of view without leaving the near reality — balcony, square, garden, elevated street or wide window; standing or beginning a step; gaze at a medium distance, not infinity; near elements keep him inside the world; attentive expression without ecstasy.',
    framing: 'wide medium or full body; lateral three-quarter; horizon off-center; discreet foreground to avoid a postcard image',
    crop: 'full_body', expressions: ['E01', 'E04'], gaze: 'path',
    environments: ['varanda', 'area_urbana_tranquila', 'jardim', 'janela_luz'], wardrobe: ['camisa_azul_marinho', 'camiseta_preta'],
    avoid: ['open arms', 'looking at the sky', 'golden sunset', 'grand mountains', 'conquest pose', 'dramatic solitude', 'landscape that erases the producer'] },
];

export const variantById = (id: string): Variant | undefined => VARIANTS.find((v) => v.id === id);
