-- =====================================================================
-- BEE: avatars, example_posts, hashtags, novas style_rules + recategorizacao
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BEE_AVATARS (2 avatares)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_avatars (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  state               TEXT,
  dor                 TEXT,
  desafio_comunicacao TEXT,
  gatilhos            TEXT[],
  beneficios          TEXT[],
  example_phrases     TEXT[],
  position            INT DEFAULT 0
);

INSERT INTO public.bee_avatars (slug, name, state, dor, desafio_comunicacao, gatilhos, beneficios, example_phrases, position) VALUES
('identificado', 'O Identificado',
 'Inconsciente do problema. Sucesso aparente. Piloto automático. Imerso no fazer-fazer-fazer.',
 'Preço oculto: esgotamento crescente, vazio sutil, desconexão com o propósito real. A ilusão de sucesso o impede de enxergar o aprisionamento.',
 'Romper a barreira da autopercepcao de sucesso. Provocativa, nao acusatoria. Plantar a duvida sobre a sustentabilidade e o real sentido — sem desvalorizar conquistas.',
 ARRAY['Curiosidade', 'Otimizacao', 'Antecipacao', 'Paradigma Disruptivo'],
 ARRAY['Descoberta da dor oculta e clareza', 'Sustentabilidade do sucesso e otimizacao de esforco', 'Redefinicao de proposito e sentido', 'Visao expandida e inovacao', 'Liberdade genuina e autorrealizacao'],
 ARRAY['E se o sucesso que voce busca tiver um preco oculto que voce ainda nao ve?',
       'Chega de bater metas sem sentido. Lidere com mais sentido, menos esforco e mais impacto.',
       'Aprenda a quebrar o padrao antes que ele quebre voce.',
       'Voce esta preparado para a proxima virada de chave na sua carreira e na sua vida?'],
 1),
('incomodado', 'O Incomodado',
 'Ja reconhece o problema. Sente que as abordagens tradicionais nao funcionam. Solidao na busca por solucoes.',
 'Incongruencia entre valores e realidade organizacional. Solidao. Esgotamento de tentar consertar sistemas fundamentalmente quebrados.',
 'Validacao e empoderamento. Reconhecer dor e inquietacao. Oferecer mapa claro. Reforcar que nao esta sozinho.',
 ARRAY['Validacao', 'Mapa Claro', 'Libertacao', 'Pertencimento'],
 ARRAY['Validacao profunda e direcionamento claro', 'Empoderamento e protagonismo ativo', 'Ferramentas e solucoes reais e sistemicas', 'Conexao e pertencimento', 'Catalisador de transformacao sistemica'],
 ARRAY['Voce nao esta sozinho nessa busca por mais sentido.',
       'As 6 Dimensoes: suas chaves para um novo caminho na lideranca.',
       'Quebre a espiral de subperformance e lidere sistematicamente.',
       'Junte-se a lideres ressonantes que estao transformando o caos em fluxo.'],
 2)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.bee_avatars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bee_avatars_read" ON public.bee_avatars;
CREATE POLICY "bee_avatars_read" ON public.bee_avatars FOR SELECT TO authenticated USING (TRUE);

-- ---------------------------------------------------------------------
-- 2. BEE_EXAMPLE_POSTS (7 posts validados extraidos do "Conteudos Claude")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_example_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  editorial_slug  TEXT REFERENCES public.bee_editorials(slug) ON DELETE SET NULL,
  avatar_slug     TEXT REFERENCES public.bee_avatars(slug) ON DELETE SET NULL,
  image_quote     TEXT NOT NULL,
  caption         TEXT NOT NULL,
  why_good        TEXT,
  headline_type   TEXT,
  analogy         TEXT,
  source          TEXT,
  position        INT DEFAULT 0
);

INSERT INTO public.bee_example_posts (editorial_slug, avatar_slug, image_quote, caption, why_good, headline_type, analogy, source, position) VALUES
-- Post 1: Diagnóstico Sistêmico
('diagnostico-sistemico', NULL,
 'Sistemas vivos sao autorregulaveis. O medo impede que isso ocorra.',
 E'A maioria das iniciativas de transformacao falha antes de comecar.\nNao na implementacao. Na pergunta.\n"Como fazemos para mudar?" eh a pergunta errada.\nPorque ela pressupoe que o problema ja foi visto. Que a causa raiz ja foi identificada. Que o que falta eh apenas o caminho.\nE quase nunca eh isso.\nO que encontramos consistentemente nas organizacoes nao eh falta de competencia para mudar. Eh um ponto cego coletivo — algo que o sistema inteiro, de forma sincronizada, decidiu nao ver.\nNao por ma-fe. Por medo.\nMedo do que ver implica. Medo da responsabilidade que o ver traz. Medo de que, uma vez visto, nao seja mais possivel fingir que nao estava la.\nE entao o sistema desenvolve uma capacidade extraordinaria: a de olhar diretamente para o problema e desviar o olhar no ultimo segundo.\nIsso tem nome na biologia: escotoma. O ponto cego do olho humano existe porque o cerebro simplesmente preenche o vazio com o que espera ver — nao com o que esta la.\nAs organizacoes fazem o mesmo.\nPreenchem os pontos cegos com dados que confirmam o que ja acreditam. Com iniciativas que parecem resposta mas sao ruido. Com movimento que simula transformacao sem tocar no que de fato precisa mudar.\nA virada nao comeca com um novo plano.\nComeca quando alguem tem a coragem de perguntar: o que estamos ativamente escolhendo nao ver — e por que temos tanto medo de ver?\nVe?',
 'Excelente analogia biologica (escotoma). Sequencia emocional perfeita. Fechamento Ve? cumprido.',
 'metafora-que-nomeia', 'Escotoma (ponto cego do olho)',
 'Conteudos Claude · Post 1', 1),

-- Post 2: Historia Pessoal Vulneravel
('historia-pessoal-vulneravel', NULL,
 'Uma crise pode ser negada. A Verdade, nunca.',
 E'Era o quinto dia util do mes.\nE eu nao sabia como ia pagar a folha no dia seguinte.\nNao era a primeira vez. Nem seria a ultima. Por quase dois anos, gerenciei um laboratorio em crise financeira aguda — derrubado por um cliente que simplesmente parou de pagar e sorriu quando pedimos explicacao.\nO que eu tinha era simples: a verdade.\nSentei com cada fornecedor. Com cada colaborador. Com o presidente de uma multinacional que nos fornecia insumos essenciais — sem proposta concreta, sem garantia nenhuma, apenas com o historico de quem nunca havia mentido.\nDisse a ele exatamente o que estava acontecendo. Que nao sabia quando pagaria. Que se ele parasse de fornecer, eu parava — e a chance de ele receber deixava de ser uma duvida e virava certeza.\nSai com um acordo de continuidade.\nA pergunta que me perseguiu por anos depois nao era "como sobrevivemos?"\nEra: quantas pessoas pediram demissao naquele periodo?\nZero.\nNao porque o salario era garantido. Em varios meses, nao era.\nMas porque todos sabiam o que estava acontecendo. Todos eram tratados como adultos capazes de lidar com a realidade. Todos tinham um lugar na conversa.\nVinte anos depois, com clientes das maiores organizacoes do mundo, aprendi que esse principio nao muda de escala.\nA confianca nao nasce do controle.\nNasce da verdade dita no momento em que eh mais dificil dize-la.',
 'Cena especifica (laboratorio), vulnerabilidade real, transicao para principio universal. Estrutura classica de historia pessoal.',
 'contradicao-direta', NULL,
 'Conteudos Claude · Post 2', 2),

-- Post 3: Provocação de Crença
('provocacao-de-crenca', NULL,
 'Estrategia clara, realidade oculta.',
 E'Existe um ritual nas organizacoes que consome meses de energia, centenas de horas de lideranca e volumes impressionantes de dados.\nO Planejamento Estrategico.\nE existe algo que raramente se fala sobre ele.\nQuanto mais sofisticado, quanto mais detalhado, quanto mais robusto na aparencia — mais frequentemente eh uma forma organizada de evitar a conversa que realmente importa.\nPorque planejar eh seguro. Planejar tem metodologia. Planejar tem consultoria. Planejar tem entregavel.\nVer eh diferente.\nVer eh sentar diante da realidade do sistema sem o filtro das metricas e perguntar: o que esta acontecendo de verdade aqui? O que estamos construindo que nao deveria existir? O que estamos evitando nomear?\nEssas perguntas nao tem template.\nE eh exatamente por isso que nao entram no planejamento.\nO resultado eh uma organizacao com um plano estrategico brilhante e uma realidade que ele nao consegue tocar — porque foi construido para descrever o futuro desejado, nao para encarar o presente real.\nJa vi organizacoes perderem decadas assim.\nCom planos cada vez mais sofisticados. Com a realidade cada vez mais distante.\nO problema nao estava na estrategia.\nEstava na coragem de ver o que a estrategia estava sendo usada para esconder.\nVe?',
 'Desconstroi a crenca "mais planejamento = mais resultado". Provoca sem acusar. Fechamento Ve? cumprido.',
 'contradicao-direta', NULL,
 'Conteudos Claude · Post 3', 3),

-- Post 4: Depoimento Narrativizado
('depoimento-narrativizado', NULL,
 'Respostas prontas ou Perguntas certas (qual sua escolha?)',
 E'Ela sabia liderar.\nResultados consistentes. Time que entregava. Linguagem de negocios afiada. O tipo de profissional que as organizacoes disputam.\nE uma angustia especifica que os numeros nao explicavam.\nAlgo entre fazer tudo certo e sentir que faltava algo. Entre ter as respostas nas reunioes e sair delas com o estomago apertado. Entre a ambicao genuina e uma exaustao que nao combinava com o sucesso visivel.\nO que a travessia revelou nao era uma falha de competencia.\nEra a confusao entre crescer e precisar provar.\nEntre liderar por escolha e liderar porque temia parar.\nQuando essa distincao ficou clara — algo mudou que nenhuma metrica captura bem.\nEla passou a cobrar menos e confiar mais.\nA narrar menos o que deviam fazer e mais quais eram os desafios.\nA entender que muitos "naos" geravam mais valor que muitos "sims".\nO time comecou a perceber.\nComecaram a chegar com o que antes escondiam. A discordar onde antes concordavam por cansaco. A trazer o problema real, nao a superficie.\nMeses depois ela resumiu a pequena grande mudanca:\n"Eu confiei, e eles me surpreenderam."\nExperimente narrar mais "porques", do que "o ques".\nE veja a magica acontecer.',
 'Depoimento sem citar nome do alumni. Conta a transformacao como narrativa, nao testimonio. Pergunta que implica.',
 'pergunta-que-implica', NULL,
 'Conteudos Claude · Post 4', 4),

-- Post 5: Case Anonimizado
('case-anonimizado', NULL,
 'Lider toxico: O que sustenta o padrao?',
 E'Fomos chamados para um problema claro.\nUm lider senior estava destruindo o time. Todos sabiam. A evidencia era abundante. O pedido oculto era para confirmar o diagnostico e recomendar um caminho.\nComecamos pela escuta.\nE o que apareceu nao era o que esperavamos.\nSim, havia um padrao destrutivo. Mas havia tambem algo mais sutil — e mais revelador.\nO time havia desenvolvido, ao longo de anos, uma danca perfeitamente coreografada com aquele lider.\nQuando ele explodia, eles recuavam. Quando ele avancava, eles cediam. Quando ele errava, eles cobriam. Quando ele precisava de dados, eles escolhiam os que nao o irritariam.\nNinguem havia planejado isso.\nHavia acontecido organicamente, como todo padrao sistemico acontece — uma resposta de cada vez, ate que um padrao se instalou.\nFizemos um encontro presencial. Todos presentes.\nA pergunta que incomodou nao foi sobre o lider.\nFoi sobre o time.\n"Que escolhas cada um tem feito que permite que esse padrao continue existindo?"\nO silencio durou tempo suficiente para ser desconfortavel.\nDepois, alguem falou. E a conversa que se seguiu foi diferente de tudo que haviam tido antes.\nNao porque o lider havia mudado.\nPorque o time havia reconhecido algo novo. Algo que dependia apenas de cada um, e nao do lider.\nMeses depois, um novo encontro.\nUm dos integrantes compartilhou com o time.\n"Tomei uma decisao interna. Que ninguem tem o poder de controlar minha vida."\nA resposta do lider?\nIsso pouco importa.\nVe?',
 'Inverte o foco: nao eh o lider toxico, eh o sistema que sustenta. Cocriacao. Autorresponsabilidade. Ve? cumprido.',
 'pergunta-que-implica', 'Danca coreografada (organica)',
 'Conteudos Claude · Post 5', 5),

-- Post 6: Bastidor da Bee
('bastidor-da-bee', NULL,
 '"Nao sei o que voces fizeram", foi o feedback mais potente que recebemos.',
 E'Por muito tempo, quando clientes perguntavam o que faziamos de diferente, eu nao sabia responder.\nNao por falta de conteudo. Por excesso de honestidade.\nA verdade eh que a Bee nao chegou aos clientes com uma metodologia pronta. Chegou com uma postura: pagina em branco. Cada empresa um organismo unico. Cada problema uma realidade que precisava ser escutada antes de ser respondida.\nO que parecia limitacao virou o diferencial.\nPorque o que descobrimos, ao longo de mais de 10 anos de intervencoes, eh que os sistemas ja tem a resposta dentro deles. O que falta quase sempre nao eh um novo diagnostico externo. Eh um espaco onde a verdade que todos sabem finalmente pode ser dita sem custo.\nQuando criamos esse espaco, as coisas destravam de uma forma que nenhuma iniciativa de change management consegue replicar.\nNao porque sejamos mais inteligentes que os outros.\nPorque paramos de fingir que somos.\nLevamos anos para entender o que estavamos fazendo. Mais alguns para conseguir nomear.\nHoje chamamos de leitura de campo. De leitura sistemica. De Ver Coletivo. De sentir o Proximo Movimento Potente Possivel.\nMas no fundo eh mais simples do que qualquer nome:\nEscutamos o que o sistema ja sabe. E confiamos que ele tem o que precisa para se mover.\nVe?',
 'Revela o como da Bee sem virar pitch. Humildade que vira diferenciacao. Termos proprios (pagina em branco, PMPP) integrados.',
 'metafora-que-nomeia', NULL,
 'Conteudos Claude · Post 6', 6),

-- Post 7: Reflexão Filosófica
('reflexao-filosofica-curta', NULL,
 'Mudar sem mudar - um vicio corporativo',
 E'Existe um pedido que recebo em versoes diferentes ha mais de vinte anos.\nAs vezes vem como "precisamos transformar nossa cultura." As vezes como "queremos ser mais ageis." As vezes como "o problema eh o engajamento do time."\nA embalagem muda. O pedido, no fundo, eh sempre o mesmo:\nMude o que precisa mudar — mas nao mexa no que sustenta tudo isso.\nNao eh ma-fe. Eh o modelo mental mais enraizado do mundo corporativo — a crenca sincera de que eh possivel mudar o resultado sem mudar o modelo mental que o produz.\nTrocar o lider sem mudar a cultura que o formou. Implementar agilidade numa estrutura que pune quem erra. Pedir inovacao num ambiente que recompensa conformidade. Entregar os numeros em um ambiente em que eh proibido questiona-los.\nO sistema esta perfeitamente desenhado para produzir os resultados que produz.\nMudar o resultado exige mudar o sistema.\nMudar o sistema exige mudar quem o habita.\nE mudar quem o habita — essa eh a parte que nenhuma iniciativa de transformacao organizacional consegue terceirizar.\nEh o trabalho mais dificil.\nE o unico que muda — e que dura.\nVe?',
 'Densidade filosofica. Toca em modelo mental. Fechamento curto e potente. Citacao implicita do livro O Lobo ("De nada adianta mudar sem mudar").',
 'metafora-que-nomeia', NULL,
 'Conteudos Claude · Post 7', 7);

ALTER TABLE public.bee_example_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bee_example_posts_read" ON public.bee_example_posts;
CREATE POLICY "bee_example_posts_read" ON public.bee_example_posts FOR SELECT TO authenticated USING (TRUE);

-- ---------------------------------------------------------------------
-- 3. BEE_HASHTAGS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_hashtags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag             TEXT UNIQUE NOT NULL,
  required        BOOLEAN DEFAULT FALSE,
  topic           TEXT,
  position        INT DEFAULT 0
);

INSERT INTO public.bee_hashtags (tag, required, topic, position) VALUES
('#LiderancaSistemica', TRUE, NULL, 1),
('#CocriandoNovasRealidades', TRUE, NULL, 2),
('#CocriandoasOrganizacoesdoFuturo', TRUE, NULL, 3),
('#epossivel', TRUE, NULL, 4),
('#TACC', TRUE, NULL, 5),
('#CulturaOrganizacional', FALSE, 'cultura', 10),
('#Transformacao', FALSE, 'mudanca', 11),
('#GestaoDeMudanca', FALSE, 'mudanca', 12),
('#DesafiosDeLideranca', FALSE, 'lideranca', 13),
('#Inovacao', FALSE, 'inovacao', 14),
('#ResistenciaAMudanca', FALSE, 'mudanca', 15),
('#SistemasVivos', FALSE, 'paradigma', 16),
('#Autorresponsabilidade', FALSE, 'autorresponsabilidade', 17),
('#NovaConsciencia', FALSE, 'consciencia', 18),
('#6Dimensoes', FALSE, 'framework', 19)
ON CONFLICT (tag) DO NOTHING;

ALTER TABLE public.bee_hashtags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bee_hashtags_read" ON public.bee_hashtags;
CREATE POLICY "bee_hashtags_read" ON public.bee_hashtags FOR SELECT TO authenticated USING (TRUE);

-- ---------------------------------------------------------------------
-- 4. NOVAS STYLE_RULES (Pagina em branco + outros principios)
-- ---------------------------------------------------------------------
INSERT INTO public.bee_style_rules (category, rule, rationale, position) VALUES
('general', 'Principio Pagina em Branco: Nunca proponha solucao antes de revelar o sistema', 'A Bee nao chega com metodologia pronta. Postura de escuta antes de proposta.', 10),
('general', 'O sistema ja tem a resposta — escute o que ele sabe e confie', 'Principio operacional Bee. Ferramenta nao eh diagnostico, eh espaco seguro.', 11),
('general', 'A confianca nasce da verdade dita no momento em que eh mais dificil dize-la', 'Principio comportamental Bee. Pode ser citado em posts sobre lideranca.', 12),
('dont', 'NAO acuse o sistema de fora — fale de dentro dele, com a autoridade de quem tambem foi parte', 'Voz Bee fala de dentro, nao de cima. Sem moralismo.', 10),
('dont', 'NAO simplifique o que eh complexo — simplifique a forma de VER o que eh complexo', 'Manter profundidade. Posts rasos perdem identidade.', 11);

-- ---------------------------------------------------------------------
-- 5. RECATEGORIZACAO de knowledge_documents
-- (move conteúdos exemplos para a categoria correta)
-- ---------------------------------------------------------------------
UPDATE public.knowledge_documents
SET metadata = jsonb_set(metadata, '{category}', '"exemplos-posts"')
WHERE title IN (
  'Conteúdos Claude',
  'Conteúdos Linkedin MP',
  'Conteúdos Sugeridos CTA Masterclass',
  'Carrosel',
  'Revisão Conteúdos 1 a 5',
  'Revisão Conteúdos 25nov2025'
);

-- Estilo MP v2 e Guia de Conteudo MP -> brand-voice
UPDATE public.knowledge_documents
SET metadata = jsonb_set(metadata, '{category}', '"brand-voice"')
WHERE title IN ('Estilo MP v2', 'Guia de Conteúdo MP');

-- Temas e Visões de Mundo Bee -> pilares-conteudo
UPDATE public.knowledge_documents
SET metadata = jsonb_set(metadata, '{category}', '"pilares-conteudo"')
WHERE title = 'Temas e Visões de Mundo Bee';

-- Logicas Desconstrutivas -> regras-do-fazer
UPDATE public.knowledge_documents
SET metadata = jsonb_set(metadata, '{category}', '"regras-do-fazer"')
WHERE title = 'Lógicas Desconstrutivas';
