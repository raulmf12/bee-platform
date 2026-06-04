-- =====================================================================
-- BEE EDITORIAL ARCHITECTURE
-- Extraído do "Guia de Voz e Editoriais" (Bee Academy v1 2026)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EDITORIAIS (8 tipos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_editorials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  frequency_hint      TEXT,
  structure_template  TEXT,
  emotional_sequence  TEXT[] DEFAULT ARRAY['Reconhecimento', 'Desconforto', 'Insight', 'Implicacao']::TEXT[],
  position            INT DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.bee_editorials (slug, name, description, frequency_hint, structure_template, position) VALUES
('diagnostico-sistemico', 'Diagnóstico Sistêmico',
 'Um padrão corporativo nomeado com precisão. Uma analogia da natureza. A virada sistêmica que recontextualiza tudo. O pão e manteiga da voz.',
 '1-2x por semana',
 'Fenômeno reconhecível → analogia da natureza → virada sistêmica → "Vê?" ou pergunta de implicação.',
 1),
('historia-pessoal-vulneravel', 'História Pessoal Vulnerável',
 'Voce como personagem. Uma decisão difícil, um momento de virada. Não como sucesso — como prova de que a travessia é real.',
 'pelo menos 1x por mês — maior alcance orgânico comprovado',
 'Cena específica → o que você sentia por dentro → a decisão → o que mudou → a pergunta que fica para o leitor.',
 2),
('depoimento-narrativizado', 'Depoimento Narrativizado',
 'A transformação de um alumni contada como história — não como citação. Prova social com emoção.',
 '1-2x por mês',
 'Quem era antes → o momento de virada → quem é agora → o que isso diz sobre o sistema que a pessoa lidera.',
 3),
('case-anonimizado', 'Case Anonimizado',
 'Um case real, empresa e pessoas anonimizadas. O sistema lendo a si mesmo. O PMPP emergindo da escuta.',
 '1x por mês — credibilidade corporativa',
 'Sintoma que todos viam → o que a escuta revelou → o movimento que emergiu → a pergunta sistêmica que fica.',
 4),
('provocacao-de-crenca', 'Provocação de Crença',
 'Uma crença que o leitor carrega sem perceber — geralmente uma frase que ele já disse ou pensou.',
 '1-2x por mês — desconforto produtivo',
 'Crença enunciada como frase reconhecível → de onde vem → o que produz no sistema → a virada → a pergunta.',
 5),
('bastidor-da-bee', 'Bastidor da Bee',
 'O que voce esta construindo, aprendendo, revendo. Reflexão honesta sobre o processo. Humaniza o produto sem vender.',
 '1x por mês',
 'O bastidor revelado → o que isso diz sobre como voces pensam → convite implícito para quem quer entender mais.',
 6),
('reflexao-filosofica-curta', 'Reflexão Filosófica Curta',
 'Uma ideia densa em poucas linhas. Mais próximo do Infinito do que do O Lobo. Pode falar de ego, escolha, medo, autoria da própria vida.',
 '1x por mês — o editorial mais diferenciador, usar com moderação',
 'Observação densa e direta → implicação para quem lidera → fechamento aberto, sem resolução.',
 7),
('trecho-livro-contextualizado', 'Trecho de Livro Contextualizado',
 'Um trecho curto de O Lobo ou do Infinito, contextualizado por uma situação real. Autoridade intelectual com datação.',
 '1x por mês',
 'Situação corporativa reconhecível → "escrevi sobre isso em [livro] há X anos" → trecho curto → o que isso significa hoje.',
 8)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  frequency_hint = EXCLUDED.frequency_hint,
  structure_template = EXCLUDED.structure_template,
  position = EXCLUDED.position,
  updated_at = NOW();

-- ---------------------------------------------------------------------
-- 2. ARSENAL (itens por editorial: histórias, alumni, cases, etc)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_arsenal (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  editorial_slug  TEXT NOT NULL REFERENCES public.bee_editorials(slug) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT,
  details         TEXT,
  source          TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  position        INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.bee_arsenal (editorial_slug, type, title, summary, position) VALUES
-- Historia Pessoal Vulneravel
('historia-pessoal-vulneravel', 'story', 'O laboratório (20 anos, 120 famílias)', '20 anos, 120 famílias, sem dinheiro para a folha, o presidente da Roche.', 1),
('historia-pessoal-vulneravel', 'story', 'A frase do tango', 'Saindo da McKinsey sem plano B, grávido da primeira filha.', 2),
('historia-pessoal-vulneravel', 'story', 'A Serra da Mantiqueira', 'O helicóptero, o BMW, o click, a decisão.', 3),
('historia-pessoal-vulneravel', 'story', 'O menino que reprovava', 'Duas reprovações, escola estadual, depois MIT.', 4),
('historia-pessoal-vulneravel', 'story', 'O Moacir', 'O mestre que não parecia mestre — Corinthiano roxo, cobrava sessão.', 5),
('historia-pessoal-vulneravel', 'story', 'Santiago de Compostela', '"sua missão está ligada à cura" — a mulher do albergue.', 6),
('historia-pessoal-vulneravel', 'story', 'O divórcio', 'A escolha mais dolorida, e o que ela revelou.', 7),
-- Depoimentos alumni
('depoimento-narrativizado', 'alumni', 'Maísa', 'De líder que não aceitava erros para "Buda" — o casamento que também mudou.', 1),
('depoimento-narrativizado', 'alumni', 'Cainara', 'Entrou cética, saiu levantando a mão onde todos concordavam em silêncio.', 2),
('depoimento-narrativizado', 'alumni', 'Luciana Vieira', '"é quase misturar uma terapia, mas com voce mesmo".', 3),
('depoimento-narrativizado', 'alumni', 'Roberto', 'A reunião difícil — escolheu acompanhar a dor em vez de ir agressivo.', 4),
('depoimento-narrativizado', 'alumni', 'Ketlin', 'Saiu de Harvard querendo algo que Harvard não deu.', 5),
('depoimento-narrativizado', 'alumni', 'Natalia', 'Parou de ver o casamento em preto e branco.', 6),
-- Cases anonimizados
('case-anonimizado', 'case', 'Time que protegia o líder tóxico', 'A pergunta que inverteu tudo.', 1),
('case-anonimizado', 'case', 'A organização sem plano local', '14 anos, $50MM perdidos. Nunca cocriou um plano local.', 2),
('case-anonimizado', 'case', 'A fábrica que ia fechar', '"resize to rise" emergindo do sistema.', 3),
('case-anonimizado', 'case', 'O presidente que disse "não sei como medimos amor"', 'E se emocionou.', 4),
('case-anonimizado', 'case', 'Time vivendo a loucura coletiva das metas impossíveis', 'Alta liderança em colapso silencioso.', 5),
-- Crenças (Provocação)
('provocacao-de-crenca', 'belief', '"Se der autonomia, as pessoas relaxam"', 'Crença comum. Desconstrução: revela ausência de propósito compartilhado.', 1),
('provocacao-de-crenca', 'belief', '"Cultura é responsabilidade de RH"', 'Crença comum. Desconstrução: cultura é cocriada por toda a liderança.', 2),
('provocacao-de-crenca', 'belief', '"Precisamos de mais dados antes de decidir"', 'Crença comum. Desconstrução: paralisia analítica como fuga.', 3),
('provocacao-de-crenca', 'belief', '"O problema é que as pessoas não têm senso de dono"', 'Crença comum. Desconstrução: infantilização sistêmica.', 4),
('provocacao-de-crenca', 'belief', '"Se funcionou antes, vai funcionar de novo"', 'Crença comum. Desconstrução: aplicativo novo, sistema operacional antigo.', 5),
-- Bastidor
('bastidor-da-bee', 'backstage', 'Por que a Bee não tem metodologia', 'E o que tem no lugar.', 1),
('bastidor-da-bee', 'backstage', 'O que é o PMPP na prática', 'Antes de ter nome.', 2),
('bastidor-da-bee', 'backstage', 'Por que demoramos tanto para chamar de 6 Dimensões', 'A nomenclatura emergiu, não foi inventada.', 3),
('bastidor-da-bee', 'backstage', 'Escalar sem perder essência', 'O que aprendemos tentando.', 4),
-- Reflexão filosófica
('reflexao-filosofica-curta', 'reflection', 'Mudar vs ser mudado', 'A diferença essencial.', 1),
('reflexao-filosofica-curta', 'reflection', 'Quando o "eu" para de lutar', 'O que acontece.', 2),
('reflexao-filosofica-curta', 'reflection', 'A dor como informação', 'Não inimigo.', 3),
('reflexao-filosofica-curta', 'reflection', 'Servir por medo vs servir por escolha', 'A diferença.', 4),
-- Trechos de livro
('trecho-livro-contextualizado', 'book-quote', '"De nada adianta mudar, sem mudar."', 'O Lobo — para posts sobre change management.', 1),
('trecho-livro-contextualizado', 'book-quote', '"Não vemos o que a mente nega existir."', 'O Lobo — para posts sobre modelos mentais.', 2),
('trecho-livro-contextualizado', 'book-quote', '"Escolha a verdade e lide com as consequências certas."', 'O Lobo — para posts sobre coragem.', 3),
('trecho-livro-contextualizado', 'book-quote', 'Orações aos pais (Infinito)', 'Para posts sobre maturidade e padrões herdados.', 4),
('trecho-livro-contextualizado', 'book-quote', '"Bateu, doeu, pega que é seu."', 'Infinito — para posts sobre autorresponsabilidade.', 5);

-- ---------------------------------------------------------------------
-- 3. GLOSSÁRIO PROPRIETÁRIO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_glossary (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term          TEXT UNIQUE NOT NULL,
  meaning       TEXT NOT NULL,
  usage_note    TEXT,
  must_appear   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.bee_glossary (term, meaning, usage_note, must_appear) VALUES
('TACC', 'Transtorno de Aprisionamento Cultural Corporativo', 'Termo proprietário. Pode aparecer com a sigla isolada ou com a expansão.', FALSE),
('Egomecânico', 'Modelo mecânico / sistema mecânico', 'Contraponto a Sistemas vivos.', FALSE),
('Sistemas vivos', 'Organização como organismo, não máquina', 'Termo central. Contraponto a Egomecânico.', FALSE),
('As 6 Dimensões', 'Essencialidade, Integralidade, Totalidade, Maturidade, Potencialidade, Vivacidade', 'Framework próprio Bee. Pode citar todas ou uma específica.', FALSE),
('Uma oitava acima', 'Operar de um lugar de maior consciência', 'Frase típica do estilo. Pode aparecer literalmente.', FALSE),
('Lobos', 'Elemento negado que poderia regenerar o sistema', 'Referência ao Lobo de Yellowstone (analogia central).', FALSE),
('Ponto de acupuntura', 'A intervenção mínima no lugar certo', 'Aparece em discussões de mudança eficaz.', FALSE),
('Infantilização sistêmica', 'Relações de pai/filho nas organizações', 'Padrão tóxico. Usar pra nomear dinâmicas hierárquicas.', FALSE),
('Loucura coletiva', 'Padrão insano normalizado coletivamente', 'Frase forte. Usar com precisão.', FALSE),
('Cocriar a realidade', 'Autorresponsabilidade sobre o que se vive', 'Mensagem central. Variações: "cocriacao", "cocriamos".', FALSE),
('Ver', 'Ato transformador — com maiúscula quando usado assim', 'Núcleo do estilo. "Ver" com V maiúsculo em momentos-chave.', FALSE),
('Vê?', 'Assinatura de fechamento — convite à cumplicidade', 'Fechamento mais característico. Usar quando o post chegou a uma revelação genuína.', TRUE),
('PMPP', 'Próximo Movimento Potente Possível', 'Termo proprietário Bee.', FALSE),
('Página em branco', 'Postura de escuta sem metodologia prévia', 'Princípio Bee.', FALSE);

-- ---------------------------------------------------------------------
-- 4. ANALOGIAS (só natureza/biologia)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_analogies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT UNIQUE NOT NULL,
  description     TEXT,
  domain          TEXT DEFAULT 'natureza',
  used            BOOLEAN DEFAULT FALSE,
  best_for        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.bee_analogies (name, description, domain, used, best_for) VALUES
('Lobo de Yellowstone', 'Elemento negado que regenera o ecossistema quando reintroduzido', 'biologia', TRUE, 'Negação sistêmica, conflito como vitalidade'),
('Câncer vs. alta performance', 'Crescimento sem propósito é doença, não saúde', 'biologia', TRUE, 'Crescimento sem direção, exaustão'),
('Coração que relaxa para impulsionar', 'Ciclos necessários — diástole antes da sístole', 'biologia', TRUE, 'Ciclos, descanso como produtividade'),
('Estações do ano / terra em pousio', 'Respeitar ciclos de inverno e renovação', 'natureza', TRUE, 'Pausa estratégica, ritmo'),
('Pitangueira no inverno', 'Morte aparente antes do florescimento', 'natureza', TRUE, 'Resistência à mudança visível'),
('Fígado vs. enxaqueca', 'Origem sistêmica vs. sintoma local', 'biologia', TRUE, 'Sintoma vs causa raiz'),
('Farol que não funciona de madrugada', 'Agir na origem, não no efeito', 'natureza', TRUE, 'Causalidade, intervenção certa'),
('Jardineiro que não grita para a planta crescer', 'Cultivo vs imposição', 'natureza', TRUE, 'Liderança como cultivo, paciência'),
-- Não usadas ainda (alto potencial)
('A raiz vs. o fruto', 'Mudar sem mudar — só o que se vê', 'natureza', FALSE, 'Mudança superficial vs profunda'),
('O peixe que não vê a água', 'Modelo mental invisível', 'biologia', FALSE, 'Crenças inconscientes, cegueira sistêmica'),
('A constelação', 'Padrões que só se revelam ao recuar', 'natureza', FALSE, 'Perspectiva, distância pra ver o todo'),
('O rio que encontra seu caminho', 'Fluxo vs. força bruta', 'natureza', FALSE, 'Flexibilidade, caminho natural'),
('A semente em solo tóxico', 'Talento vs. cultura', 'biologia', FALSE, 'Ambiente como fator de potencial');

-- ---------------------------------------------------------------------
-- 5. TIPOS DE TÍTULO (4 padrões)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_headline_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  examples      TEXT[],
  position      INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.bee_headline_types (slug, name, description, examples, position) VALUES
('contradicao-direta', 'Contradição direta',
 'Inverte o senso comum. Duas frases curtas em oposição.',
 ARRAY['A sua agenda lotada não é um troféu. É um pedido de socorro.',
       'O lucro é o sangue da empresa. Mas ninguém vive para ter sangue.'],
 1),
('diagnostico-imperativo', 'Diagnóstico imperativo',
 'Sentença que acusa um padrão. Em caixa alta quando a urgência é máxima.',
 ARRAY['PARE DE COBRAR FOCO DA SUA EQUIPE. O CAOS COMEÇA EM VOCE.'],
 2),
('pergunta-que-implica', 'Pergunta que implica',
 'Pergunta que o leitor não quer responder porque a resposta o envolve.',
 ARRAY['Voce está matando os lobos da sua empresa?',
       'A sua planilha pode mentir. O seu estômago, raramente.'],
 3),
('metafora-que-nomeia', 'Metáfora que nomeia',
 'Um fenômeno corporativo nomeado de forma inesperada.',
 ARRAY['Biologicamente, crescimento contínuo sem conexão tem nome: câncer.'],
 4);

-- ---------------------------------------------------------------------
-- 6. TEMAS (Senso Comum vs Olhar Bee) — 8 temas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_themes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  senso_comum       TEXT,
  olhar_bee         TEXT,
  analogies_keys    TEXT[],
  key_phrases       TEXT[],
  avoid_phrases     TEXT[],
  example_roteiro   TEXT,
  position          INT DEFAULT 0
);

INSERT INTO public.bee_themes (slug, name, senso_comum, olhar_bee, analogies_keys, key_phrases, avoid_phrases, position) VALUES
('mudanca-que-nao-acontece', 'Mudança que Não Acontece',
 'Acredita que a mudança falha por falta de comunicação, resistência, ou treinamento insuficiente.',
 'A falha acontece pela incompatibilidade entre novas estratégias e o "sistema operacional" mental das pessoas. Aplicativo novo em SO antigo.',
 ARRAY['A raiz vs. o fruto', 'O peixe que não vê a água'],
 ARRAY['regressa aos velhos padrões', 'mentalidade das pessoas', 'crenças profundamente enraizadas', 'incompatibilidade intrínseca', 'transformação de dentro para fora'],
 ARRAY['falta de vontade', 'resistência negativa', 'mais treinamento é a chave'],
 1),
('silencio-dos-talentosos', 'O Silêncio dos Talentosos',
 'Interpreta o silêncio como falta de engajamento, covardia ou medo de punição.',
 'O silêncio é protocolo social. As pessoas se calam porque "não é adequado". Custo invisível da omissão.',
 ARRAY['O peixe que não vê a água'],
 ARRAY['protocolo social', 'custo do silêncio é sempre maior', 'verdades não são percebidas como ameaça, mas direção', 'espaços seguros', 'inteligência coletiva minada'],
 ARRAY['falta de proatividade', 'covardia individual', 'mais canais de comunicação'],
 2),
('desconexao-apesar-do-sucesso', 'Desconexão apesar do Sucesso',
 'Atribui o vazio a cansaço, falta de equilíbrio vida-trabalho ou problemas pessoais.',
 'É uma crise de sentido profunda. Operar no piloto automático. "A conta chega".',
 ARRAY['Câncer vs. alta performance'],
 ARRAY['desconforto silencioso', 'piloto automático', 'a conta chega', 'sucesso no papel, vazio por dentro', 'preço oculto'],
 ARRAY['estresse', 'burnout', 'buscar um hobby', 'tirar férias'],
 3),
('exaustao-nao-eh-produtividade', 'Exaustão Não É Produtividade',
 'Vê a exaustão como falta de gestão de tempo, excesso de demanda ou burnout.',
 'Sinal de que o esforço está sendo direcionado ao lugar errado. Acelerar o carro na lama.',
 ARRAY['Coração que relaxa para impulsionar', 'O rio que encontra seu caminho'],
 ARRAY['esforço genuíno no lugar errado', 'uma oitava acima', 'impacto com muito menos esforço', 'roda girando sem sair do lugar'],
 ARRAY['gerenciar o tempo', 'mais organização', 'pausas estratégicas'],
 4),
('frustracao-com-interdependencias', 'Frustração com Interdependências',
 'Atribui a frustração a falta de colaboração, processos ineficientes ou silos.',
 'Visão fragmentada e mecânica. Cada um no seu quadrado ignora a natureza sistêmica.',
 ARRAY['Fígado vs. enxaqueca'],
 ARRAY['cada um no seu quadrado', 'células vivas do mesmo organismo', 'decisão pequena reverbera no todo'],
 ARRAY['mais reuniões', 'softwares de colaboração'],
 5),
('inquietacao-como-sinal', 'A Inquietação como Sinal de Inteligência',
 'Interpreta a sensação como crise pessoal, falta de resiliência ou vulnerabilidade.',
 'É um sinal de inteligência e prontidão para transformação. Bússola interna.',
 ARRAY['A constelação'],
 ARRAY['inquietação como bússola', 'percebe uma dissonância maior', 'rompendo o isolamento', 'sinal de prontidão'],
 ARRAY['crise pessoal', 'falta de resiliência', 'terapia'],
 6),
('empresa-nao-eh-maquina', 'Sua Empresa Não É Uma Máquina',
 'Vê a empresa como máquina a ser otimizada, com peças e processos.',
 'Organizações são sistemas vivos, orgânicos e complexos. Líder como jardineiro/acupunturista.',
 ARRAY['Jardineiro que não grita para a planta crescer', 'Ponto de acupuntura'],
 ARRAY['sistemas vivos', 'jardineiro', 'acupunturista do sistema', 'cultivar', 'dinâmicas sistêmicas'],
 ARRAY['otimização', 'consertar peças', 'processos eficientes'],
 7),
('caos-como-aliado', 'Seu Caos Pode Ser Seu Maior Aliado',
 'Considera o caos, incerteza e desordem como inimigos a serem eliminados.',
 'O caos é matéria-prima para inteligência emergente. Catalisador da evolução.',
 ARRAY['O rio que encontra seu caminho'],
 ARRAY['inteligência emergente', 'matéria-prima para cocriação', 'uma oitava acima', 'transformar a desordem em aliado'],
 ARRAY['controlar o caos', 'eliminar a incerteza', 'mais ordem'],
 8);

-- ---------------------------------------------------------------------
-- 7. LÓGICAS DESCONSTRUTIVAS (7 lógicas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_logics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  common_belief       TEXT,
  deconstructive_logic TEXT,
  position            INT DEFAULT 0
);

INSERT INTO public.bee_logics (slug, name, common_belief, deconstructive_logic, position) VALUES
('esforco-vs-impacto', 'Esforço vs. Impacto',
 'Para ter sucesso, preciso trabalhar incansavelmente, e o esforço é sempre o caminho para o resultado.',
 'A exaustão não é preço a pagar, é sintoma de que o esforço está sendo direcionado para o lugar errado, dentro de um sistema que pede uma nova abordagem.',
 1),
('autorresponsabilidade', 'Autorresponsabilidade',
 'Minhas frustrações e limitações são reflexo do sistema, do chefe, das circunstâncias externas.',
 'O poder real de transformar a realidade está mais perto do que se imagina. Reconhecer o próprio papel ativo na cocriação do presente.',
 2),
('caos-vs-aliado', 'Caos como Aliado',
 'A complexidade e o caos são inimigos a serem controlados ou eliminados.',
 'A desordem é inteligência emergente, convite para atuar uma oitava acima. Catalisador de evolução.',
 3),
('sucesso-vs-sentido', 'Sucesso Aparente vs. Sentido',
 'Minha carreira está no rumo certo se eu estou batendo metas, sendo promovido e tenho um bom cargo.',
 'O sucesso pode cobrar um preço oculto: esgotamento crescente, vazio, desconexão com o propósito real.',
 4),
('interdependencia', 'Interdependência',
 'Minha responsabilidade é limitada à minha área/equipe. Se o outro não faz a parte dele, não é problema meu.',
 'Somos células vivas do mesmo organismo. Ignorar as dores em outras partes limita o potencial do todo — e o seu.',
 5),
('resistencia-vs-potencia', 'Resistência vs. Potência',
 'A resistência às mudanças é um obstáculo a ser combatido, vindo de quem não quer colaborar.',
 'A energia por trás de toda resistência é informação vital, convite para desvendar o que precisa ser integrado.',
 6),
('conhecimento-tradicional-vs-nova-inteligencia', 'Conhecimento Tradicional vs. Nova Inteligência',
 'Meus anos de experiência e os modelos de gestão que me trouxeram até aqui são suficientes para os desafios do futuro.',
 'O futuro da liderança exige inteligência além do que já foi ensinado. O que te trouxe até aqui pode não ser suficiente para o mundo que se apresenta.',
 7);

-- ---------------------------------------------------------------------
-- 8. STYLE RULES (FAZ vs NÃO FAZ + regras imutáveis)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_style_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,
  rule          TEXT NOT NULL,
  rationale     TEXT,
  position      INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.bee_style_rules (category, rule, rationale, position) VALUES
-- DO
('do', 'Nomeia o que todos sentem mas ninguém fala em reunião', 'Cria reconhecimento imediato.', 1),
('do', 'Provoca sem acusar — o leitor se vê no diagnóstico, não é apontado por ele', 'Convite, não acusação.', 2),
('do', 'Usa natureza e biologia para iluminar o que é humano e organizacional', 'Domínio assinatura Bee.', 3),
('do', 'Termina com abertura, não com conclusão — convida o leitor a ver, não a concordar', 'Posts fechados não engajam.', 4),
('do', 'Fala de dentro do sistema, não de cima dele', 'Autoridade só funciona com humildade.', 5),
-- DONT
('dont', 'NÃO instrui com listas de "como fazer"', 'Listas tiram a identidade sistêmica.', 1),
('dont', 'NÃO se autoelogia — nunca usa "metodologia inovadora" ou similar', 'Soa como marketing genérico.', 2),
('dont', 'NÃO acusa o líder — revela o padrão que o aprisiona', 'Acusação fecha. Diagnóstico abre.', 3),
('dont', 'NÃO fecha com CTA comercial explícito — quando convida, convida pela narrativa', 'CTA mata a profundidade.', 4),
('dont', 'NÃO simplifica o que é complexo — simplifica a forma de ver o que é complexo', 'Manter a profundidade.', 5),
('dont', 'NÃO usa emojis nem hashtags na quote da imagem', 'Imagem Bee é austera e elegante.', 6),
('dont', 'NÃO usa analogias de tecnologia ou finanças — só natureza/biologia', 'Domínio é identidade.', 7),
('dont', 'NÃO multiplica ideias num post — uma ideia, desenvolvida com profundidade', 'Foco é potência.', 8),
('dont', 'NÃO extensão excessiva — a virada deve acontecer antes do "ver mais"', 'Captura antes do scroll.', 9),
-- GENERAL
('general', 'Sequência emocional obrigatória: Reconhecimento → Desconforto → Insight → Implicação', 'Quando um post não performa, geralmente pulou o passo 2 ou o passo 4.', 1),
('general', 'Caption LinkedIn entre 1300 e 2000 chars', 'Faixa ideal para alcance orgânico.', 2),
('general', 'Gancho nos primeiros 49 chars antes do "ver mais"', 'Limite do feed mobile.', 3),
('general', 'Hashtags obrigatórias: #LiderancaSistemica #CocriandoNovasRealidades #CocriandoasOrganizacoesdoFuturo #epossivel #TACC', 'Identidade Bee no LinkedIn.', 4);

-- ---------------------------------------------------------------------
-- RLS (read-only pra authenticated, gravacao via service-role)
-- ---------------------------------------------------------------------
ALTER TABLE public.bee_editorials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_arsenal         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_glossary        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_analogies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_headline_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_themes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_logics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bee_style_rules     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bee_editorials_read" ON public.bee_editorials;
DROP POLICY IF EXISTS "bee_arsenal_read" ON public.bee_arsenal;
DROP POLICY IF EXISTS "bee_glossary_read" ON public.bee_glossary;
DROP POLICY IF EXISTS "bee_analogies_read" ON public.bee_analogies;
DROP POLICY IF EXISTS "bee_headline_types_read" ON public.bee_headline_types;
DROP POLICY IF EXISTS "bee_themes_read" ON public.bee_themes;
DROP POLICY IF EXISTS "bee_logics_read" ON public.bee_logics;
DROP POLICY IF EXISTS "bee_style_rules_read" ON public.bee_style_rules;

CREATE POLICY "bee_editorials_read"     ON public.bee_editorials     FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_arsenal_read"        ON public.bee_arsenal        FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_glossary_read"       ON public.bee_glossary       FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_analogies_read"      ON public.bee_analogies      FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_headline_types_read" ON public.bee_headline_types FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_themes_read"         ON public.bee_themes         FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_logics_read"         ON public.bee_logics         FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "bee_style_rules_read"    ON public.bee_style_rules    FOR SELECT TO authenticated USING (TRUE);

-- ---------------------------------------------------------------------
-- USER_SETTINGS: adiciona persona Bee + remove archetype obrigatorio
-- (mantemos a coluna por compat, mas onboarding nao usa mais)
-- ---------------------------------------------------------------------
UPDATE public.user_settings SET
  persona = COALESCE(persona, 'Marcos Piccini / Bee Academy: alguem que viu de dentro. Que viveu o colapso antes de nomea-lo. Que passou pela propria travessia antes de convidar outros. Voz com autoridade que vem de 20 anos de cases reais e dois livros escritos.'),
  tone_of_voice = COALESCE(tone_of_voice, 'Direto, provocador, autentico. Linguagem forte sem ser agressiva. Provoca sem acusar.'),
  content_structure = COALESCE(content_structure, 'Ganho de scroll (primeiros 49 chars) -> abertura que aprofunda tensao -> diagnostico sistemico com analogia da natureza -> virada -> fechamento com Ve? ou pergunta de implicacao.'),
  image_style_prompt = COALESCE(image_style_prompt, 'Imagens austeras, contemplativas, com elementos de natureza (plantas, paisagens, animais selvagens). Paleta navy/honey/cream. Sem corporate stock photos. Sentido organico.');
