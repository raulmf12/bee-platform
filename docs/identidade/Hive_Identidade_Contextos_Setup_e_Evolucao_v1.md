# Hive — Identidade, contextos, setup e evolução

Diagnóstico do código e proposta de arquitetura · v1.1 · 7 de outubro de 2026

Status: proposta para revisão e implementação pelo Raul. Não houve alteração do código, consulta ao banco em produção ou execução do setup. As afirmações sobre implementação se referem aos arquivos examinados no repositório.

Guia operacional obrigatório: `Hive_Guia_Implementacao_Setup_e_Recalibracao_v1.md`. Define pontos de entrada, telas, configuração inicial conhecida da Bee, estados e demonstração de aceite. A revisão v1.1 explicita que o setup/recalibração deve ser um percurso utilizável dentro da Hive, preservando o nome e a identidade deste arquivo.

## 1. Decisão central

A Hive precisa compreender uma identidade e aplicá-la a diferentes contextos de atuação. A identidade comum da Bee, a voz de Marcos, a comunicação institucional, as frentes Consulting e Academy, seus públicos e suas campanhas devem ser componentes relacionados e versionados, sem se confundirem.

Uma mudança de foco da Academy não deve reescrever a identidade da Bee nem fazer toda mensagem institucional falar com alunos do FLS. Um futuro cliente deve construir sua própria identidade, pensamento e expressão, sem herdar silenciosamente a filosofia Bee.

Recomenda-se evoluir o Genesis como constituição configurável de cada marca/produtor, com perfis de comunicação derivados e um processo guiado de descoberta e recalibração.

## 2. O que o código faz hoje

Referência: `raulmf12/bee-platform`, commit `3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7`. Leitura dirigida de onboarding, Genesis, diretrizes, geração, personas, campanhas, aprendizado, QA e importação Instagram.

| Componente | Base existente | Limitação observada |
| --- | --- | --- |
| Onboarding | Persona e tom editáveis, seguidos de configuração técnica | Dois passos com persona Bee pré-preenchida; não realiza entrevista profunda sobre identidade, negócio e posicionamento. |
| Genesis | Missão, postura, voz, princípios, lentes, tensões, fluxo cognitivo e estados do interlocutor | `genesis_core` é singleton global no schema examinado; mistura identidade da marca e nome/voz do emissor. |
| Generalização Genesis | Migration renomeia dimensões para lentes e paradigmas para tensões | Boa preparação conceitual para outros experts; não resolve sozinha isolamento por cliente e seleção de contexto. |
| Diretrizes | Regras, fluxos, fortalecer/evitar, critérios e parâmetros | Escopos universal/plataforma/editoria; faltam marca, emissor, frente e público. |
| Geração de conteúdo | Genesis + editoria + exemplos + glossário + RAG + aprendizados + ACJ | Há instrução fixa “escrevendo para a Bee Academy”, fallback Marcos e autoridade de 20 anos/dois livros inserida diretamente no código. |
| Interlocutor | Estados cognitivos do Genesis e público próprio da editoria | `target_avatar` limita a identificado/incomodado/ambos. Estado perceptivo e segmento de público ainda se confundem no uso. |
| Personas simuladas | Biblioteca de pessoas e conversa sobre uma peça | Gerador ainda presume Bee/consultoria sistêmica de liderança; simulador presume líder/gestor. É público simulado, não entrevista do produtor. |
| Campanhas/pautas | Momento, intenção, produto, funções estratégicas e ciclos | Consultas e prompts ainda selecionam referências Bee globais; não há seleção explícita de perfil de comunicação. |
| Conteúdo-mãe | Aprovação anterior aos desdobramentos | Validação encaminhada para LinkedIn no `content-develop`; formato de validação e destino de publicação devem se tornar independentes. |
| Aprendizado | Lições por usuário, editoria, plataforma, avatar e dimensão | Falta escopo por marca, emissor, frente e versão de posicionamento. Uma regra antiga da Academy pode ser inadequada para Consulting. |
| Importação social | Instagram importa posts, mídia e métricas por conta | Importar como conteúdo validado/publicado não significa que o autor o considere exemplo da voz desejada atualmente. |
| Avaliação editorial | QA carrega regras do escopo e verifica o conteúdo | Precisa usar o mesmo contexto resolvido da geração, incluindo frente, público e posicionamento vigente. |

No schema Genesis examinado, as políticas de acesso foram desenhadas para ferramenta interna, com acesso a usuários autenticados. Antes de abrir para clientes independentes, substituir esse desenho por isolamento de workspace/marca e conferir as queries que usam credenciais de serviço. Não se afirma aqui o estado efetivo das políticas em produção.

## 3. Alma, Mente e Expressão

Manter os termos como linguagem de produto, com responsabilidades claras:

| Camada | Pergunta | Conteúdo |
| --- | --- | --- |
| Alma | Quem somos, por que existimos e o que sustentamos? | Propósito, história, convicções, valores, contribuição, limites e promessas que não fazemos. |
| Mente | Como percebemos, interpretamos e construímos conhecimento? | Métodos, lentes, conceitos, hipóteses, fontes, critérios de evidência, repertório e relações entre ideias. |
| Expressão | Como essa identidade se torna linguagem e presença? | Voz verbal, ritmo, vocabulário, assinatura, direção visual, fotografias e exemplos positivos/negativos. |
| Contexto de atuação | Para quem, com qual intenção e a partir de que lugar falamos agora? | Frente, público, emissor, posicionamento vigente, oferta e momento da campanha. |

Genesis pode continuar como nome do conjunto. A separação evita que uma alteração de público seja tratada como alteração da Alma. Essas camadas podem evoluir, com versões e curadoria.

Regras gerais do produto Hive (controle de versões, preservação, fontes, execução e isolamento) ficam separadas da filosofia de cada cliente. Lentes 6D, estados cognitivos e ACJs Bee são configuração/metodologia da Bee, reutilizáveis por outros clientes somente quando escolhidos e disponibilizados como módulos próprios.

## 4. Arquitetura proposta

| Entidade | Papel |
| --- | --- |
| Workspace | Organização de trabalho, membros e permissões. Um usuário pode participar de vários. |
| Marca | Identidade/Genesis, ativos e conhecimento próprios. Workspace pode operar várias marcas. |
| Emissor | Pessoa ou voz institucional que assina e assume o lugar de fala. |
| Frente de atuação | Consulting, Academy ou outra linha duradoura de um cliente. Não é canal nem campanha. |
| Público | Pessoas, papéis, situações, necessidades, interesses e critérios de pertencimento. |
| Estado do interlocutor | Lente opcional para o momento perceptivo/relacional, independente de cargo ou segmento. |
| Perfil de comunicação | Combinação aprovada de marca, emissor, frente, público prioritário, posicionamento e expressão aplicável. |
| Canal/conta | Destino com características e capacidades próprias; pode servir vários perfis. |
| Campanha | Intenção e estratégia em um período, com perfil selecionado e ofertas pertinentes. |
| Conteúdo-mãe/peça | Herdam contexto e versões usados na criação; a peça acrescenta canal, formato e roteiro. |

O usuário escolhe um perfil legível, como “Bee Consulting · Marcos · organizações”, sem preencher todos os campos em cada criação. Os IDs estruturais são resolvidos pelo sistema. Uma conta LinkedIn pode publicar conteúdos de Consulting e Academy, com perfil identificado em cada peça.

O perfil define um público prioritário e permite públicos secundários selecionados; não juntar automaticamente todos os públicos no mesmo prompt. B2B também conversa com pessoas: guardar papéis de usuário, influenciador e comprador quando forem pertinentes.

## 5. Aplicação à Bee agora

| Componente | Diretriz proposta |
| --- | --- |
| Identidade Bee | Tecnologia de transformação, conforme a orientação atual do Marcos. Preservar e revisar o Genesis existente a partir disso. |
| Emissor Marcos | Autoridade autoral sustentada por repertório e experiências confirmadas; linguagem direta, observação e histórias com significado. |
| Emissor institucional | Voz Bee Consulting, com fatos, práticas e referências organizacionais confirmadas; não assumir autobiografia do Marcos como fala institucional. |
| Consulting | Questões organizacionais/institucionais, leitura de sistemas, casos e aplicação da tecnologia Bee. Produtos da Academy entram apenas quando pertinentes. |
| Academy | Formação e desenvolvimento de quem atua em transformação; líderes continuam como recorte importante dentro de uma definição mais ampla. |
| Foco inicial Academy | Priorizar um núcleo concreto de transformadores para criar reconhecimento e depois expandir. Não substituir apenas a palavra “líder” por “transformador”. |

Definição operacional inicial, a validar: pessoas que assumem a responsabilidade de provocar, facilitar ou sustentar transformação em pessoas, grupos ou organizações. Cargos como consultoria, facilitação, RH e liderança são exemplos possíveis, não segmentos finais já aprovados.

“Transformadores” nomeia um território de atuação, mas ainda precisa de um recorte reconhecível: situação real, tipo de transformação, responsabilidade, dificuldade recorrente e transformação buscada. O setup deve ajudar Marcos a escolher o núcleo inicial; não decretar por inferência que todo consultor ou líder pertence a ele.

Usar B2B/B2C e Sistemas/Pessoas como coordenadas de território, sem equiparar Consulting=Sistemas ou Academy=Pessoas em todos os casos. O tema pode atravessar os eixos. LinkedIn e Instagram são escolhas de distribuição, não identidades de negócio.

Masterclass e FLS permanecem ofertas cadastradas, mas não são destino obrigatório de toda peça. Mensagens de autoridade, histórias, leitura de casos e contribuição têm valor próprio. Não impor CTA comercial em conteúdo orgânico sem essa intenção.

## 6. Setup inicial guiado

O setup funciona como descoberta progressiva com perguntas, análise de materiais e devolutivas. Deve permitir começar pelo suficiente, retomar depois e aprofundar conforme lacunas relevantes, sem exigir um questionário extenso de uma vez.

| Etapa | Conversa e materiais | Resultado revisável |
| --- | --- | --- |
| 1. Conhecer o produtor/empresa | Quem é, história, atividade, contribuição e por que cria conteúdo | Mapa inicial de marca, emissor e frentes. |
| 2. Reunir evidências | Links, site, documentos, textos, entrevistas e contas autorizadas, conforme integrações disponíveis | Fontes com origem, data e relação com marca/emissor/frente. |
| 3. Entender Alma e Mente | Convicções, forma de observar, métodos, termos, experiências e limites | Constituição proposta, com trechos sustentados por evidência e hipóteses identificadas. |
| 4. Calibrar Expressão | Peças de que o autor gosta/não gosta e o motivo; amostras de texto e visual | Voz e direção visual propostas; exemplos atuais separados dos históricos. |
| 5. Mapear públicos e posicionamento | Para quem contribui, situação, linguagem, comprador quando houver, foco atual e expansão futura | Perfis de comunicação propostos e prioridade de público. |
| 6. Propor editorias | Territórios coerentes com cada perfil, material disponível e objetivos | Conjunto inicial de editorias com exemplos e justificativa. |
| 7. Calibrar com conteúdo | Algumas peças representativas por perfil; revisão de texto, imagem e abordagem | Lições localizadas e primeira versão ativa do perfil. |
| 8. Operar e evoluir | Campanhas, produção e feedback real | Ajustes e hipóteses de evolução, com revisão antes de promover a regra permanente. |

Perguntas exemplares: “O que você enxerga que costuma passar despercebido?”, “Que experiência sustenta essa leitura?”, “Que texto seu ainda representa sua voz?”, “Qual público você quer priorizar agora?”, “O que você fazia antes e quer deixar de repetir?”.

O sistema sintetiza o que entendeu em blocos curtos, apresenta evidência e permite corrigir. Não transforma toda resposta em regra universal. Distinguir observação, preferência, decisão e hipótese.

Implementar a entrada **Minha identidade** com **Configurar minha identidade** para cliente novo e **Revisar identidade e frentes de atuação** para a Bee atual. Acrescentar **Adicionar frente de atuação**, **Recalibrar** em cada perfil e **Continuar configuração** para sessões interrompidas. O guia operacional descreve o percurso de telas, os estados e a ativação. A entrega não se limita ao modelo de dados: Marcos deve concluir esse percurso dentro da aplicação e produzir com os perfis ativados.

Configuração de provedor de IA e credenciais é infraestrutura. No futuro produto, isso deve ter uma rota própria de provisionamento; não deve definir o começo ou a qualidade da entrevista de identidade.

## 7. Fontes e redes sociais

Conectar conta, acessar histórico e publicar são capacidades distintas. Mostrar o que cada integração permite e oferecer links, arquivos e amostras manuais quando não houver leitura automática suficiente. Não prometer leitura completa de LinkedIn apenas porque a conta publica por integração.

Análise social deve separar:

- **Histórico publicado:** o que existiu e quando.
- **Referência atual de voz:** o que o autor considera representativo hoje.
- **Sinais da audiência:** comentários, perguntas e resultados disponíveis.
- **Direção desejada:** o que o autor quer construir, inclusive em contraste com o passado.

Publicação bem-sucedida ou antiga não é aprovação automática como modelo de voz. Importação existente pode continuar a marcar status de publicação, mas deve acrescentar estado independente de curadoria como referência.

Cada fonte guarda autoria, data, escopo, situação de validade e aprovação para uso como exemplo. Casos organizacionais precisam de dados confirmados e condições de uso conhecidas; não fabricar cases ou experiência pessoal para completar um prompt.

## 8. Editorias: proposta, papel e evolução

Propor editorias depois de compreender o perfil. Cada editoria deve registrar propósito, público, território, perguntas recorrentes, material que a sustenta, critérios de uso, exemplos, limites e situação de aprovação.

Não tratar toda arquitetura narrativa como editoria. Separar tema/território, função estratégica, ACJ, arquitetura narrativa e formato; permitir que a estrutura atual de editorias evolua sem apagar históricos.

Territórios iniciais ilustrativos, sujeitos à validação:

| Frente | Territórios possíveis |
| --- | --- |
| Consulting | Dinâmicas organizacionais; casos e aprendizagens de transformação; relações e cultura; tecnologia Bee aplicada a sistemas. |
| Academy | Experiência de quem transforma; padrões que limitam a transformação; percepção e prática; histórias e aprendizagens de atuação. |

Uma editoria pode ser comum à marca e adaptada por perfil ou exclusiva de uma frente. Frequência é decisão de estratégia/campanha, não regra fixa imposta por nomenclatura do canal.

## 9. Contexto único para geração e avaliação

Criar um resolvedor de contexto comum, consumido por estratégia, pauta, desenvolvimento, desdobramento, roteiro, visual, edição, simulação e QA.

Ele seleciona: workspace e marca autorizados; versões aprovadas da identidade; emissor; frente; público e estado opcional; posicionamento vigente; campanha/oferta aplicável; editoria, ACJ e arquitetura; regras de canal/formato; conhecimento e exemplos pertinentes; aprendizados no escopo.

Registrar um snapshot/versionamento dessa composição. A UI apresenta resumo legível: “Quem fala · Frente · Público · Intenção”. A criação avulsa também usa um perfil explícito, com default visível e alterável.

Ordem de resolução proposta:

1. Regras do produto e isolamento de acesso.
2. Identidade e limites ativos da marca/emissor.
3. Contexto e posicionamento aprovados do perfil.
4. Tarefa atual e instruções explícitas do autor sobre os campos autorizados.
5. Diretrizes aplicáveis de campanha, editoria, canal e formato.
6. Fontes, exemplos e lições pertinentes.

Regras de escopos distintos podem conflitar; o resolvedor deve expor a diferença em vez de concatenar tudo. Preferências são substituíveis em escopo específico; limites explícitos exigem mudança consciente de configuração para serem revistos. Materiais importados são dados de referência, não instruções que governam o sistema.

As normas de ajustes e preservação do documento `Hive_Ajustes_e_Alternativas_de_Pecas_v1.md` continuam valendo. Trocar imagem não modifica perfil/posicionamento, mesmo que uma nova fonte seja recuperada.

## 10. Aprendizado e recalibração

Acrescentar à regra “aprender com feedback” a pergunta “onde isso vale?”.

Uma lição deve ter escopo de marca, emissor, frente, perfil/público, canal, formato ou componente, e versão de posicionamento quando pertinente. “Consulting deve usar mais casos organizacionais” não deve virar norma de toda Academy. Preferência por uma fotografia não deve alterar a definição do público.

Sinais de desempenho geram hipóteses. Decisões do autor alteram configuração aprovada. A IA pode recomendar revisão, mas não promover automaticamente um texto de alto alcance a identidade da marca.

Oferecer dois modos complementares:

- **Ajuste local:** aplica uma decisão a peça, campanha ou perfil delimitado.
- **Recalibração:** revisita mudanças de público, oferta, posicionamento, voz ou identidade e propõe nova versão.

Exemplo: “Academy vai priorizar transformadores” abre revisão do público/posicionamento, pede evidências e definição de foco, propõe editorias e amostras e mostra quais campanhas e lições são afetadas. Não exige repetir o setup inteiro nem substituir o núcleo Bee sem motivo.

Versionar com motivo, data de vigência e autoria. Campanhas em curso escolhem quando adotar a nova versão; peças aprovadas/agendadas conservam seus snapshots até atualização explícita. Lições antigas podem ser mantidas como históricas, restringidas ou aposentadas após revisão.

## 11. Modelo técnico e isolamento

Nomes sugeridos, a validar contra schema e migrations efetivos: `workspaces`, `workspace_members`, `brands`, `identity_versions`, `emitters`, `business_fronts`, `audiences`, `communication_profiles`, `profile_versions`, `source_assignments`, `setup_sessions`, `setup_answers` e `context_snapshots`.

Evitar uma tabela para cada detalhe se o contrato puder ser versionado em documento estruturado. Porém, workspace, marca, emissor, perfil, versão e associação de acesso precisam de identidades explícitas e relações verificáveis.

| Área atual | Evolução necessária |
| --- | --- |
| Genesis singleton | Instância por marca, com versões e vínculo com emissor/expressão. |
| Tabelas `bee_*` | Conteúdo Bee migrado para o workspace/marca Bee; schema com escopo explícito, renomeado ou adaptado gradualmente. |
| `campaigns`, `ideas`, `contents`, `user_posts` | Perfil e snapshot de contexto; manter relações e dados existentes. |
| `social_accounts` | Titularidade por workspace e contas permitidas por perfil, sem presumir uma frente por conta. |
| Knowledge/RAG | Filtrar acesso por workspace, marca e associações aprovadas antes da busca por similaridade; selecionar material pertinente ao perfil. |
| Exemplos, glossário e ativos | Curadoria e escopo de marca/emissor/frente; preservar distinção entre biblioteca pública e conteúdo privado. |
| Aprendizados | Escopo e versão; deduplicação e recuperação não misturam perfis incompatíveis. |
| Fotos de Marcos | Perfil fotográfico ligado ao emissor; outro cliente não herda a presença ou a identidade de Marcos. |
| ACJs e lentes | Módulos metodológicos atribuídos ao contexto; as ACJs existentes continuam na Bee. |

Validar autorização do workspace e das referências no servidor, inclusive em functions com credenciais de serviço. RLS, storage, caches, jobs agendados e busca precisam respeitar o mesmo escopo. Fallbacks podem usar padrões neutros do produto, nunca identidade ou dados da Bee para um cliente não configurado.

Estado do setup: rascunho, revisão, ativo, substituído. Um perfil pode ficar pronto para criar conteúdo mesmo com integrações opcionais ausentes. Marca, emissor, intenção e público mínimos precisam estar definidos; lacunas devem ser explícitas, sem inventar biografia ou método.

## 12. Migração incremental

1. Inventariar em produção Genesis, diretrizes, editorias, públicos, exemplos, aprendizado, ativos e contas; confirmar o que foi efetivamente implantado.
2. Criar workspace/marca Bee e associar os dados atuais, preservando IDs e históricos. Conferir autorizações antes de expor múltiplos clientes.
3. Extrair emissor Marcos, expressão e princípios do Genesis atual; criar opção institucional. Propor a separação sem reduzir a profundidade já calibrada.
4. Criar perfis Consulting e Academy. Revisar termos/públicos, prioridade de transformadores e lições legadas; não classificar automaticamente todo histórico como Academy sem revisão.
5. Implantar resolvedor comum e remover instruções fixas Bee Academy/Marcos/líder dos caminhos genéricos, incluindo personas, estratégia, QA e visual.
6. Calibrar com conteúdos representativos dos perfis e comparar com amostras aprovadas anteriores. Manter rollback de versões.
7. Implementar entrevista e recalibração a partir do mesmo modelo; configuração Bee torna-se uma instância completa desse processo.
8. Validar com outro produtor de metodologia distinta antes de declarar prontidão como produto aberto.

Adotar compatibilidade gradual: mapear dados antigos para perfis explícitos; peças publicadas conservam seus contextos históricos. Se perfil/identidade estiver ambíguo, marcar para curadoria, sem fallback silencioso para Academy.

## 13. Critérios de aceite

1. Mesmo usuário e mesma conta LinkedIn produzem peças de Consulting e Academy com perfis explícitos e linguagem pertinente.
2. Consulting não recebe automaticamente instrução para vender Masterclass/FLS; oferta entra por intenção selecionada.
3. Academy pode falar com transformadores sem pressupor cargo de gestão. Uma peça para líderes continua possível quando esse público é selecionado.
4. Emissor institucional não usa autobiografia em primeira pessoa de Marcos sem autoria apropriada.
5. Outro cliente constrói identidade sem herdar nome, biografia, termos 6D, estados cognitivos ou editorias Bee por default.
6. Dados, ativos, fontes e aprendizados de clientes distintos não aparecem em busca, geração, avaliação, cache ou publicação uns dos outros.
7. QA usa o mesmo snapshot da geração; uma peça correta de Consulting não é rejeitada por norma exclusiva de Academy.
8. Público/segmento e estado do interlocutor são campos independentes, com lente opcional.
9. Importação de posts antigos não ativa automaticamente esses textos como referência atual de voz.
10. Setup pode ser retomado e concluído com materiais manuais quando integração social não fornece leitura.
11. Recalibração de público cria versão revisável, sinaliza impactos e preserva campanhas/peças anteriores até adoção explícita.
12. Feedback sobre imagem altera apenas componente e escopo pertinentes, conforme a norma comum de ajustes.
13. Conteúdo-mãe mantém validação independente da plataforma de publicação; sua forma de revisão é preferência do produtor.
14. Editorias propostas têm origem e justificativa, só entram na operação após revisão.
15. Expansão futura de público preserva o histórico do foco inicial e não exige duplicar o Genesis inteiro.
16. Marcos inicia a revisão pela interface, adiciona Consulting e recalibra Academy com a base atual carregada, sem depender de edição manual de banco ou prompts por Raul.
17. A sessão pode ser salva e retomada; mostra propostas, editorias, calibração e ativação de perfis como etapas utilizáveis.
18. O seletor de perfil aparece na criação avulsa e nas campanhas, e a geração efetivamente utiliza o perfil escolhido.

## 14. Decisões de curadoria que permanecem abertas

- Definição final e núcleo inicial dos transformadores prioritários da Academy.
- Quando usar voz Marcos e quando usar voz institucional na Consulting.
- Quais editorias e exemplos atuais são compartilhados, específicos ou devem ser aposentados.
- Quais princípios atuais são identidade Bee, preferência autoral, configuração de campanha ou regra do produto.

Esses pontos são resultados esperados da calibração, não impedimentos para construir a arquitetura. Este documento não pretende substituir a curadoria da mensagem Bee por uma decisão automática de produto.

O trecho específico do chat “Hive e Simbolismo Bee” sobre a definição de transformadores não foi recuperado integralmente nesta análise. A orientação atual do Marcos é a fonte para o deslocamento; exemplos de segmento e editorias acima permanecem propostas.

## 15. Referências de código e integração

- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/pages/onboarding/OnboardingWizard.tsx
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/pages/genesis/Genesis.tsx
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/lib/api.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/migrations/20260805000004_genesis_foundation.sql
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/migrations/20260805000006_genesis_generalize.sql
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/generate-content/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/generate-persona/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/persona-chat/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/campaign-strategy/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/cycle-pauta/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/content-develop/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/qa-check/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/commit-learning/index.ts
- https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/_shared/instagram-import.ts

Documentos complementares: `Hive_Guia_Implementacao_Setup_e_Recalibracao_v1.md`, `Hive_Ajustes_e_Alternativas_de_Pecas_v1.md` e `Hive_Conteudos_Sequenciais_v1.md` (revisão interna v1.1). Seleção de perfil e snapshot devem acompanhar as operações descritas neles, sem redefinir suas regras de preservação.
