// Gera a Biblioteca ACJ estruturada a partir dos .md canônicos (docs/acj/ACJ-0[1-5]*.md).
// Os .md são a fonte; este script só transcreve as seções do Template Canônico
// para dados (prompts das edges + seed da tabela acj_definitions).
//   node scripts/acj-build-library.mjs
// Saídas:
//   supabase/functions/_shared/acj-library.ts   (gerado — não editar à mão)
//   supabase/migrations/20261007000002_acj_definitions_seed.sql
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/acj';
const files = readdirSync(DIR).filter((f) => /^ACJ-0[1-5]_.*\.md$/.test(f)).sort();

// Camada de apresentação (Imagem Resumo ACJ) + compatibilidade editorial sugerida
// (caminhos da imagem ↔ bee_editorials). Sugestão, nunca regra fixa.
const PRESENTATION = {
  'ACJ-01': { short: 'Eu vejo.', purpose: 'Tornar visível e nomeável algo que já está acontecendo.', effect: 'É isso. Agora consigo ver e nomear.', color: '#D4A017',
    paths: ['Diagnóstico sistêmico', 'Ver sistêmico / espelhamento da realidade', 'Provocação de crença', 'Cases', 'Educação / conceitos'],
    editorials: ['diagnostico-sistemico', 'provocacao-de-crenca', 'case-anonimizado'] },
  'ACJ-02': { short: 'Eu me vejo.', purpose: 'Fazer a realidade percebida encontrar a experiência concreta da pessoa.', effect: 'Isso está acontecendo comigo.', color: '#5E9B3A',
    paths: ['Histórias pessoais', 'Situações do líder', 'Cases', 'Depoimentos', 'Diagnóstico sistêmico próximo do cotidiano'],
    editorials: ['historia-pessoal-vulneravel', 'depoimento-narrativizado', 'case-anonimizado', 'diagnostico-sistemico'] },
  'ACJ-03': { short: 'Eu me aproximo.', purpose: 'Criar vínculo com Marcos/Bee a partir de algo verdadeiro e compartilhável.', effect: 'Isso me toca. Quero continuar perto desse pensamento e desse lugar.', color: '#DC4C5A',
    paths: ['Histórias pessoais', 'Bastidores Bee', 'Cases vividos', 'Escolhas e dilemas reais', 'Reflexões pessoais', 'Trechos de livro contextualizados'],
    editorials: ['historia-pessoal-vulneravel', 'bastidor-da-bee', 'case-anonimizado', 'reflexao-filosofica-curta', 'trecho-livro-contextualizado'] },
  'ACJ-04': { short: 'Eu vejo diferente.', purpose: 'Permitir que a pessoa experimente, ainda que brevemente, outra maneira de perceber.', effect: 'Nunca tinha olhado dessa forma.', color: '#2F7FC1',
    paths: ['6 Dimensões aplicadas', 'Educação sistêmica', 'Releitura de situações / cases', 'Perguntas que mudam a observação', 'Contraste mecanicista × sistêmico'],
    editorials: ['diagnostico-sistemico', 'case-anonimizado', 'provocacao-de-crenca', 'reflexao-filosofica-curta'] },
  'ACJ-05': { short: 'Eu quero ir além.', purpose: 'Transformar interesse em desejo de compreender e viver mais profundamente aquela abordagem.', effect: 'Quero ir além. Quero compreender e viver isso.', color: '#8562B8',
    paths: ['Educação mais estruturada', '6 Dimensões', 'Conteúdos da Masterclass / FLS', 'Cortes de aulas / conversas', 'Cases aprofundados', 'Bastidores de experiências Bee'],
    editorials: ['diagnostico-sistemico', 'case-anonimizado', 'bastidor-da-bee', 'trecho-livro-contextualizado'] },
};

const clean = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  for (const line of (m?.[1] ?? '').split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^"|"$/g, '');
  }
  return out;
}

// Texto de uma seção (do título até o próximo título de nível ≤ ao dela).
function section(md, title) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^#{1,3} ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l));
  if (start < 0) return '';
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+) /);
    if (h && h[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

const bullets = (txt) => txt.split('\n').filter((l) => /^- /.test(l)).map((l) => clean(l.slice(2)).replace(/;$|\.$/, ''));
const paragraphs = (txt) => txt.split('\n\n').map((p) => p.trim()).filter((p) => p && !p.startsWith('|') && !p.startsWith('-') && !p.startsWith('```') && !p.startsWith('>'));
function table(txt) {
  const rows = txt.split('\n').filter((l) => l.trim().startsWith('|'));
  if (rows.length < 2) return [];
  const head = rows[0].split('|').slice(1, -1).map(clean);
  return rows.slice(2).map((r) => {
    const cells = r.split('|').slice(1, -1).map(clean);
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
  });
}

const library = files.map((f) => {
  const md = readFileSync(join(DIR, f), 'utf8');
  const fm = frontmatter(md);
  const id = fm.id;
  const mech = Object.fromEntries(table(section(md, '4 Mecanismo de conexão')).map((r) => [r['Elemento'], r['Descrição']]));
  const results = table(section(md, '7 Resultados esperados')).map((r) => ({ level: r['Nível'], signal: r['Sinal esperado'], indicator: r['Indicador possível'], window: r['Janela'], limitation: r['Limitação'] }));
  const purpose = section(md, '2 Propósito');
  return {
    id, name: fm.name, version: fm.version, status: fm.status, document_ref: `docs/acj/${f}`,
    primary_question: fm.primary_question, state_from: fm.state_from, state_to: fm.state_to, mechanism: fm.mechanism,
    central_phrase: clean((md.match(/> \*\*Frase central:\*\*(.*)/) ?? [])[1] ?? ''),
    definition: paragraphs(section(md, '1 Definição')).map(clean).join(' '),
    purposes: bullets(purpose),
    indications: bullets(section(md, '3.1 Indicações')),
    preconditions: bullets(section(md, '3.2 Pré-condições')),
    contraindications: bullets(section(md, '3.3 Contraindicações')),
    timing: bullets(section(md, '3.4 Contexto temporal')),
    mechanism_steps: {
      origin: mech['Estado de origem'] ?? '', operation: mech['Operação relacional'] ?? '', experience: mech['Experiência favorecida'] ?? '',
      shift: mech['Deslocamento esperado'] ?? '', early_signals: mech['Sinais iniciais'] ?? '',
    },
    manifestations: table(section(md, '5 Manifestações possíveis')).map((r) => ({ nature: r['Natureza'], options: r['Manifestações possíveis'], note: r['Observações'] })),
    examples: bullets(section(md, '5.1 Exemplos abstratos de formulação')).map((s) => s.replace(/^“|”$/g, '')),
    is_not: bullets(section(md, `6.1 O que ${fm.name} não é`)),
    boundaries: table(section(md, '6.2 Confusões com outras ACJs')).map((r) => ({ acj: (r['ACJ relacionada'].match(/ACJ-0\d/) ?? [''])[0], difference: r['Diferença essencial'] })),
    failure_modes: table(section(md, '6.3 Falhas e simulações do movimento')).map((r) => ({ deviation: r['Desvio'], class: r['Classe do problema'], alert: r['Sinal de alerta'] })),
    saturation_signals: bullets(section(md, '6.4 Saturação e riscos de integridade').split('Riscos de integridade')[0]),
    integrity_risks: bullets(section(md, '6.4 Saturação e riscos de integridade').split('Riscos de integridade')[1] ?? ''),
    results,
    learning_questions: bullets(section(md, '8.1 Perguntas de aprendizagem')),
    confounders: bullets(section(md, '8.3 Fatores de confusão')),
    hypotheses: table(section(md, '8.4 Hipóteses testáveis iniciais')).map((r) => ({ hypothesis: r['Hipótese'], variable: r['Variável'], control: r['Controle'], signal: r['Sinal esperado'], decision: r['Critério de decisão'] })),
    transitions: bullets(section(md, '9.1 Transições prováveis, não obrigatórias')),
    ...PRESENTATION[id],
  };
});

for (const a of library) {
  const missing = ['definition', 'indications', 'contraindications', 'is_not', 'boundaries', 'failure_modes', 'results', 'transitions']
    .filter((k) => !a[k] || (Array.isArray(a[k]) && a[k].length === 0));
  if (missing.length) throw new Error(`${a.id}: seções vazias ${missing.join(', ')}`);
  if (!a.mechanism_steps.origin) throw new Error(`${a.id}: mecanismo não lido`);
}

const ts = `// GERADO por scripts/acj-build-library.mjs a partir de docs/acj/ACJ-0[1-5]*.md — NÃO EDITAR À MÃO.
// Biblioteca ACJ (Arquiteturas de Conexão e Jornada) estruturada para os prompts da Hive.
// ACJ-00 é governança: nunca aparece aqui como arquitetura selecionável.
export const ACJ_LIBRARY = ${JSON.stringify(library, null, 2)} as const;
export type AcjId = 'ACJ-01' | 'ACJ-02' | 'ACJ-03' | 'ACJ-04' | 'ACJ-05';
export const ACJ_IDS: AcjId[] = ['ACJ-01', 'ACJ-02', 'ACJ-03', 'ACJ-04', 'ACJ-05'];
export const ACJ_LIBRARY_VERSION = '${library.map((a) => `${a.id}@${a.version}`).join(',')}';
`;
writeFileSync('supabase/functions/_shared/acj-library.ts', ts);

// Versão enxuta para o app (rótulos, cores, movimento e fronteiras).
const front = library.map((a) => ({
  id: a.id, name: a.name, version: a.version, status: a.status, short: a.short, purpose: a.purpose, effect: a.effect, color: a.color,
  paths: a.paths, editorials: a.editorials, primary_question: a.primary_question, state_from: a.state_from, state_to: a.state_to,
  mechanism: a.mechanism, central_phrase: a.central_phrase, boundaries: a.boundaries, transitions: a.transitions,
  audience_signal: a.results.find((r) => r.level === 'Audiência')?.signal ?? '',
}));
writeFileSync('src/lib/acj/library.generated.ts', `// GERADO por scripts/acj-build-library.mjs a partir de docs/acj — NÃO EDITAR À MÃO.
export const ACJ_LIBRARY_FRONT = ${JSON.stringify(front, null, 2)} as const;
`);

const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const sql = `-- GERADO por scripts/acj-build-library.mjs — definições ACJ-01..05 (v0.1, em validação).
-- A tabela guarda o necessário para seleção, validação, rastreabilidade e analytics;
-- o texto completo continua nos .md (document_ref).
INSERT INTO public.acj_definitions (acj_id, version, status, name, short_phrase, purpose, desired_effect, primary_question,
  state_from, state_to, mechanism, color, editorial_hints, data, document_ref, effective_from)
VALUES
${library.map((a) => `  (${lit(a.id)}, ${lit(a.version)}, ${a.status === 'in_validation' ? `'in_validation'` : `'active'`}, ${lit(a.name)}, ${lit(a.short)}, ${lit(a.purpose)}, ${lit(a.effect)}, ${lit(a.primary_question)},
   ${lit(a.state_from)}, ${lit(a.state_to)}, ${lit(a.mechanism)}, ${lit(a.color)}, ARRAY[${a.editorials.map(lit).join(',')}]::text[], ${lit(JSON.stringify(a))}::jsonb, ${lit(a.document_ref)}, now())`).join(',\n')}
ON CONFLICT (acj_id, version) DO UPDATE SET
  status = EXCLUDED.status, name = EXCLUDED.name, short_phrase = EXCLUDED.short_phrase, purpose = EXCLUDED.purpose,
  desired_effect = EXCLUDED.desired_effect, primary_question = EXCLUDED.primary_question, state_from = EXCLUDED.state_from,
  state_to = EXCLUDED.state_to, mechanism = EXCLUDED.mechanism, color = EXCLUDED.color, editorial_hints = EXCLUDED.editorial_hints,
  data = EXCLUDED.data, document_ref = EXCLUDED.document_ref;
`;
writeFileSync('supabase/migrations/20261007000002_acj_definitions_seed.sql', sql);
console.log(library.map((a) => `${a.id} ${a.name}: ind=${a.indications.length} contra=${a.contraindications.length} falhas=${a.failure_modes.length} fronteiras=${a.boundaries.length} sinais=${a.results.length} trans=${a.transitions.length}`).join('\n'));
