-- Arsenal de "Diagnóstico Sistêmico" — o editorial pão-e-manteiga da voz Bee.
-- Cada item é um PADRAO/FENOMENO corporativo reconhecivel que o Marcos costuma
-- diagnosticar, pra IA usar como ponto de partida da estrutura:
--   Fenomeno reconhecivel -> analogia da natureza -> virada sistemica -> "Ve?"
--
-- IMPORTANTE: rodar 1x apenas. Limpa antes se quiser re-seedar:
--   DELETE FROM bee_arsenal WHERE editorial_slug = 'diagnostico-sistemico';

INSERT INTO public.bee_arsenal (editorial_slug, type, title, summary, details, position) VALUES

('diagnostico-sistemico', 'pattern',
 'Líder que faz reunião pra todas as decisões',
 'O sintoma da centralização disfarçada de "alinhamento".',
 'Reuniao excessiva nao e processo — e medo de confiar. Cada decisao precisa de validacao porque o sistema nao foi desenhado pra autonomia. A liderança acredita que "está ouvindo" mas na pratica esta criando dependencia. Analogia possivel: arvore que nao deixa luz chegar no chao — nada cresce embaixo dela.',
 1),

('diagnostico-sistemico', 'pattern',
 'Time que diz "sim" em reunião e faz diferente fora',
 'A falsa coesão como sintoma de cultura performatica.',
 'O time aprendeu que discordar tem custo, entao concorda na frente e age conforme sua propria convicçao depois. Nao e desonestidade — e adaptação ao sistema que pune divergencia. O lider acha que "alinhou" e fica intrigado quando o resultado nao vem. Analogia: rio que parece calmo na superficie mas tem correntezas opostas no fundo.',
 2),

('diagnostico-sistemico', 'pattern',
 'OKR que vira ritual sem sentido',
 'Forma sem fundo — tecnologia de gestao colonizando o vinculo.',
 'A organizacao adotou OKR pra "trazer foco" mas em 2 trimestres virou planilha que ninguem olha. O ritual permanece porque alguem precisa preencher; o sentido morreu. Acontece quando se importa a ferramenta sem importar o pre-requisito sistemico que a sustenta. Analogia: planta exotica num solo que nao a recebe — sobrevive, mas nao floresce.',
 3),

('diagnostico-sistemico', 'pattern',
 'Pesquisa de clima que não muda nada',
 'Diagnostico sem prescricao — escutar pra dizer que escutou.',
 'A organizacao faz pulse survey trimestral, lê os resultados, faz uma reuniao "sobre os achados" e nada muda concretamente. O time aprende que falar nao gera consequencia. Na proxima rodada, ou nao respondem ou respondem o que e politicamente seguro. O instrumento ainda existe; a confianca, nao. Analogia: animal que para de avisar o predador quando descobre que ninguem vem.',
 4),

('diagnostico-sistemico', 'pattern',
 'Plano estratégico de 50 slides que ninguém usa',
 'Estrategia como exibicionismo, nao como bussola.',
 'O deck e perfeito, foi apresentado no leadership offsite, todos aplaudiram. Em 60 dias, ninguem mais o consulta. O plano nao foi cocriado — foi entregue. Ninguem se sente dono porque ninguem foi convocado a construir. A virada sistemica: planos que duram sao os que emergem do sistema, nao os que sao impostos a ele.',
 5),

('diagnostico-sistemico', 'pattern',
 'Liderança que delega responsabilidade mas centraliza decisão',
 'A infantilizacao sistemica disfarçada de "empowerment".',
 'O lider diz "voce decide" mas, na hora da decisao, intervem. Ou pior: deixa decidir e depois critica o resultado. O time aprende que autonomia e armadilha. Reduz iniciativa, espera ordem. Resultado: o lider reclama que "ninguem toma frente". Analogia: filhote que nao aprende a caçar porque a mae continua trazendo a presa.',
 6),

('diagnostico-sistemico', 'pattern',
 'Cultura como cartaz na parede e processo sem alma',
 'O abismo entre o que se diz ser e o que se vive.',
 'Os valores estao impressos no lobby, no manual, no protetor de tela. Mas a pratica diaria nega cada um deles. O time entende rapidamente que o cartaz e ritual, nao norma. A cultura real e a soma dos comportamentos que sao tolerados e dos que sao punidos — nao a soma do que esta escrito. Analogia: especie que diz ser uma coisa no rotulo e se comporta como outra no habitat.',
 7),

('diagnostico-sistemico', 'pattern',
 'Reuniões 1:1 que viraram check-in burocrático',
 'O vinculo substituido por status update.',
 'O lider faz 1:1 semanal porque "tem que fazer". Vira lista de tarefas, atualizacao de status, microgerencia disfarçada. O proposito original — espaco pra desenvolvimento e relacao — desapareceu. O liderado sai sentindo que cumpriu tabela. Analogia: ritual antigo cuja origem foi esquecida, mas que continua sendo feito porque "sempre foi assim".',
 8),

('diagnostico-sistemico', 'pattern',
 'A organização que confunde velocidade com pressa',
 'Movimento sem direcao como ilusao de produtividade.',
 'A urgencia virou estado permanente. Ninguem mais pergunta "isso e urgente mesmo?" porque tudo e tratado como urgente. O sistema premia quem corre, nao quem pensa. Decisoes nao sao tomadas — sao reagidas. Analogia: cardume em panico fugindo de uma sombra que nao existe.',
 9),

('diagnostico-sistemico', 'pattern',
 'Líder que tira "ferias trabalhando"',
 'O sistema que aprendeu a nao deixar a pessoa sair de verdade.',
 'O lider tira ferias mas continua respondendo email, aprovando coisa, entrando em call "rapido". Nao porque queira — porque o sistema nao foi desenhado pra funcionar sem ele. A organizacao infantilizou seu proprio time e agora paga o preco: o lider nao descansa, o time nao cresce. Analogia: matriarca que nunca pode parar, senao a colmeia inteira desorganiza.',
 10),

('diagnostico-sistemico', 'pattern',
 'A reunião que dura 1h mas decide em 5 minutos',
 'O ritual onde a verdade so aparece nos ultimos minutos.',
 '50 minutos de exposicao, perguntas politicas, defesas. Nos ultimos 10, alguem fala o que precisava ser falado. A decisao acontece. Acontece sempre. O sistema aprendeu que precisa "aquecer" antes de dizer a verdade — ou nunca aprendeu a dizer a verdade direto. Analogia: animal que circula a presa antes de atacar.',
 11);
