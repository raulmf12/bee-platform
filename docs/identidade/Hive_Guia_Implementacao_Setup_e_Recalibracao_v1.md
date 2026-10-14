# Hive — Guia de implementação do setup e da recalibração

Complemento operacional para Raul · v1.0 · 7 de outubro de 2026

Documento principal: `Hive_Identidade_Contextos_Setup_e_Evolucao_v1.md`, revisão interna v1.1. Este guia fixa o comportamento de produto já definido e fornece um ponto de partida para implementação. Nomes técnicos e organização de tabelas devem ser ajustados ao schema real; decisões editoriais pendentes permanecem identificadas.

## 1. Entrega que Marcos precisa receber

Após a implementação, Marcos entra na Hive, escolhe **Revisar identidade e frentes de atuação**, vê a configuração atual da Bee, informa o que mudou, configura Consulting e Academy com a ajuda da Hive, revisa os perfis e editorias, calibra com conteúdos e ativa os perfis para produção.

Esse percurso deve funcionar na interface. Formulários técnicos, migrations e prompts isolados não constituem essa entrega. A IA conduz a descoberta e propõe; Marcos corrige, revisa e decide o que ativar.

## 2. Decisões já definidas

| Decisão | Aplicação |
| --- | --- |
| Aproveitar o que existe | Carregar Genesis, voz, diretrizes, fontes, editorias e aprendizado atuais antes de perguntar. |
| Uma identidade Bee com frentes distintas | Criar Consulting e Academy sob a mesma marca; configurar diferenças por perfil. |
| Separar quem fala | Marcos e voz institucional são emissores distintos, com autoria apropriada. |
| Separar público de estado | “Transformadores/líderes” são recortes de atuação; “identificado/incomodado” são lentes opcionais do interlocutor. |
| Canal não define a frente | A mesma conta pode distribuir peças de perfis diferentes. |
| Recalibração delimitada | Alterar público/posicionamento sem obrigar a repetir o setup da identidade inteira. |
| Aprovação por versão | Propostas não sobrescrevem configuração ativa até ativação explícita. |
| Novos clientes com identidade própria | Não preencher Bee, Marcos, líderes ou lentes 6D por padrão. |
| Editorias depois do entendimento | Propor territórios com propósito e exemplos a partir do perfil, para revisão. |
| Aprendizado com escopo | Guardar onde uma decisão vale, sem transformar ajuste local em norma global. |
| Configuração assistida e editável | Conversa guiada e edição direta usam o mesmo estado estruturado. |
| Criação avulsa e campanha | Ambas selecionam perfil; o contexto acompanha conteúdo, peça, revisão e publicação. |

## 3. Entradas na interface

Acrescentar **Minha identidade** à navegação, integrando as telas de Genesis/diretrizes existentes. Manter acesso à edição detalhada; o novo caminho é a entrada assistida para entender e mudar a configuração.

| Situação | Ação de entrada | Resultado |
| --- | --- | --- |
| Cliente novo | Configurar minha identidade | Sessão inicial sem identidade Bee implícita. |
| Bee já configurada | Revisar identidade e frentes de atuação | Resumo atual e seleção do que mudou. |
| Marca com nova atividade | Adicionar frente de atuação | Nova frente que herda o núcleo revisado e propõe suas diferenças. |
| Perfil existente | Recalibrar | Sessão focada em público, posicionamento, expressão, oferta ou outro alvo selecionado. |
| Sessão interrompida | Continuar configuração | Retomada no mesmo ponto e com as respostas preservadas. |
| Produção | Perfil de comunicação | Seletor com resumo de quem fala, frente e público. |

Rotas sugeridas: `/identidade`, `/identidade/configurar`, `/identidade/sessoes/:id`, `/identidade/perfis/:id`. São sugestões de navegação, não rotas já existentes. Raul pode adequá-las ao router atual, mantendo os rótulos e o percurso.

## 4. Telas e comportamento

| Tela/etapa | Conteúdo e ações | Condição para avançar |
| --- | --- | --- |
| 1. Visão atual | Marca, Alma/Mente/Expressão, emissores, frentes, perfis e fontes. Mostrar o que foi herdado e o que falta revisar. | Escolher configuração inicial ou mudança desejada. |
| 2. O que mudou? | Público; frente; posicionamento; oferta; voz/visual; identidade. Seleção pode ser múltipla. | Registrar alvos e preservar camadas não afetadas. |
| 3. Conversa guiada | Uma questão relevante por vez, com campos/resumo quando útil. Permitir voltar, editar respostas e continuar depois. | Informação suficiente para propor o bloco; lacunas explícitas. |
| 4. Materiais | Links, arquivos, amostras e contas disponíveis; distinguir histórico da referência atual desejada. | Materiais opcionais; ausência não bloqueia entrevista nem implica invenção. |
| 5. O que a Hive entendeu | Propostas por bloco com origem, diferenças e hipóteses. Editar, aceitar bloco ou pedir ajuste. | Configuração mínima revisada para calibrar. |
| 6. Perfis | Marca, emissor, frente, público prioritário, posicionamento e expressão. | Perfil identificado, com escopo coerente e sem campos críticos inventados. |
| 7. Editorias | Propostas com propósito, território, público, perguntas, material e exemplo. Aceitar/editar/remover/acrescentar. | Conjunto inicial aprovado para teste. |
| 8. Calibração | Conteúdos-mãe representativos por perfil; feedback sobre pensamento, linguagem, público e lugar de fala. | Feedback registrado, configurações propostas revistas; teste feito ou etapa dispensada explicitamente. |
| 9. Ativar | Resumo das mudanças e impactos sobre campanhas, peças, fontes e aprendizado. | Ativação explícita da versão; escolher o alcance da adoção. |
| 10. Pronto para produzir | Perfis ativos e acesso à criação avulsa/campanha. | Produção usa o perfil escolhido e snapshot correspondente. |

Não exigir que Marcos revisite a história da Bee se o pedido é adicionar Consulting. A conversa adapta as perguntas ao conhecimento já existente e aos alvos escolhidos. Mostrar por que uma informação adicional é necessária quando isso não for evidente.

## 5. Sessão inaugural da Bee: preenchimento inicial

**Intenção já informada:** revisar a identidade Bee e preparar a operação simultânea de Consulting e Academy. Academy deve priorizar transformadores; líderes permanecem um recorte relevante. Consulting trabalha temas organizacionais e institucionais. A Hive será configurável para outros clientes.

| Elemento | Ponto de partida | Situação |
| --- | --- | --- |
| Marca | Bee | Informado; associar aos dados existentes. |
| Alma/Mente/Expressão | Genesis, diretrizes e referências atuais | Importar como base legada; apresentar para revisão, sem reescrever automaticamente. |
| Natureza da contribuição | Bee como tecnologia de transformação | Orientação atual do Marcos; usar para revisar o posicionamento. |
| Emissor autoral | Marcos Piccini | Informado; aproveitar voz existente. |
| Emissor institucional | Bee Consulting | Capacidade requerida; quando usá-la permanece decisão de curadoria. |
| Frente | Bee Consulting | Criar contexto com temas organizacionais/institucionais. |
| Frente | Bee Academy | Recalibrar prioridade de público para transformadores. |
| Oferta Academy | Masterclass e FLS | Ofertas conhecidas; manter cadastro vigente, sem pressupor CTA em toda peça. |
| Contas | Contas disponíveis na Hive | Ler dados reais e permitir associação; não assumir uma frente exclusiva por conta. |
| Público Academy | Transformadores, incluindo líderes pertinentes | Prioridade informada; núcleo concreto ainda precisa ser definido. |
| Públicos Consulting | Pessoas e papéis envolvidos em questões organizacionais | Hipótese ampla para entrevista; não criar segmentação final por conta própria. |
| Editorias | Existentes mais propostas por perfil | Revisar pertinência; não apagar nem aprovar novos territórios automaticamente. |

Perguntas que já podem abrir a sessão:

1. “O que do Genesis e da voz atual continua representando a Bee, e o que ficou preso ao foco anterior da Academy?”
2. “Entre as pessoas que atuam em transformação, quem você quer priorizar primeiro e que situação elas vivem?”
3. “Na Consulting, com quais interlocutores e questões organizacionais você quer conversar primeiro?”
4. “Em quais situações a Consulting fala como Marcos e em quais fala institucionalmente?”
5. “Quais textos ou casos atuais representam bem cada frente?”

Fazer as perguntas na ordem das lacunas da sessão; não repetir o que estiver confirmado. Não é necessário definir antecipadamente listas extensas de cargos ou um novo manifesto para começar.

## 6. Recalibração futura

Entrada: abrir perfil → **Recalibrar** → escolher o que mudou → conversar/editar → comparar → testar conteúdos quando útil → ativar nova versão.

Oferecer alvos como público, posicionamento, expressão e oferta. Uma mudança de identidade da marca tem alcance maior e deve mostrar os perfis afetados. Adicionar uma frente preserva as demais e reutiliza explicitamente o núcleo compartilhado.

O resumo final apresenta: campos mantidos, campos alterados, fontes e lições a revisar, perfis/campanhas afetados e data da nova versão. Peças agendadas não mudam automaticamente.

## 7. Estados e contrato mínimo da sessão

Separar o estado da entrevista da ativação da identidade/perfil:

- Sessão: em andamento, pronta para revisão, em calibração, concluída ou arquivada.
- Versão proposta: rascunho, revisada, ativa ou substituída.
- Editorias e fontes: estado de curadoria independente do status da publicação original.

Persistir ID de sessão, modo (setup/revisão/adicionar frente/recalibrar), workspace, marca, perfis-alvo, versão-base, alvos da mudança, respostas, fontes, propostas por bloco, revisões, etapa atual e resultado de ativação.

Cada resposta/proposta registra a classificação relevante: informação declarada, evidência, hipótese ou decisão aprovada. Guardar escopo e data. Uma proposta não comprovada não vira fato biográfico.

Operações de serviço sugeridas, sem impor transporte ou nomes finais de API:

| Operação | Responsabilidade |
| --- | --- |
| Iniciar/retomar sessão | Autorizar acesso e carregar base correta; retornar estado salvo. |
| Registrar resposta ou material | Persistir entrada, proveniência e alvos; manter mudanças em rascunho. |
| Recomendar próximo passo | Escolher pergunta/bloco segundo as lacunas e mudanças. |
| Propor configuração | Gerar saída estruturada restrita aos alvos selecionados, com diferenças e hipóteses. |
| Revisar bloco | Aplicar edição/aceite no rascunho, preservando outros blocos. |
| Calibrar conteúdo | Resolver contexto proposto e criar amostra identificada como calibração. |
| Ativar versão | Conferir versão-base, validações e acesso; registrar atomicamente versão ativa e escopo de adoção. |

## 8. Integração no código existente

1. Centralizar a resolução do perfil/contexto. Todas as telas e functions recebem ou resolvem o mesmo perfil e versão.
2. Adaptar Genesis/diretrizes existentes à leitura e edição por marca/perfil, preservando a edição detalhada e o histórico.
3. No `generate-content`, substituir persona/Academy/biografia fixas por emissor e contexto aprovado; trocar a seleção limitada de avatar por público e lente opcional.
4. Propagar perfil/snapshot em campanha, pauta, conteúdo-mãe, desdobramento, QA e revisão. Preferência por frase+texto para validar o pensamento não define a plataforma final.
5. Revisar prompts de persona/estratégia/QA e perfil fotográfico para remover pressupostos Bee/Marcos/líder dos caminhos genéricos.
6. Acrescentar escopo às fontes, lições, ativos e exemplos; preservar curadoria atual e separar referência histórica de voz vigente.
7. Configurar acesso por workspace/marca, inclusive nas functions com credenciais de serviço. Não abrir para novos clientes com Genesis global compartilhado.
8. Implementar candidatos e preservação pelo serviço comum do documento de ajustes; reutilizar o mesmo mecanismo na revisão de blocos do setup quando aplicável.

O guia não presume que trocar apenas os textos dos prompts conclua a implementação. O percurso deve ligar interface, persistência, contexto resolvido e produção.

## 9. Ordem de execução recomendada

**Primeira entrega:** perfis/contexto e percurso completo da Bee, com importar legado, adicionar Consulting, recalibrar Academy, propor editorias, calibrar e ativar. Aprendizado e fontes passam a ter escopo. Usar material manual caso a integração não forneça leitura suficiente.

**Segunda entrega:** setup inicial neutro para outro produtor, com isolamento validado, entrevista adaptativa e identidade própria. As bases de workspace/escopo devem nascer na primeira entrega para não exigir reconstrução.

**Evolução posterior:** ampliar análise automática de fontes, recomendações e novos renderizadores. Conexões sociais avançadas e criação visual fora dos templates não bloqueiam o caminho manual funcional.

As normas de ajustes podem ser implementadas em paralelo por sequência de desenvolvimento do Raul, mas devem respeitar perfil/snapshot. Conteúdos sequenciais usam essa mesma base.

## 10. Roteiro de demonstração e aceite

Raul deve conseguir demonstrar, usando dados reais autorizados da Bee:

1. Abrir **Minha identidade** e mostrar a configuração legada identificada como Bee.
2. Iniciar **Revisar identidade e frentes de atuação**, sem questionário do zero.
3. Adicionar Consulting e recalibrar Academy, sem alterar a identidade ativa durante a conversa.
4. Salvar, sair e retomar a sessão mantendo respostas e propostas.
5. Mostrar perfis, público separado de estado, e diferenças entre voz Marcos/institucional.
6. Propor editorias e gerar amostras a partir do contexto em rascunho.
7. Registrar feedback no escopo correspondente e revisar o perfil.
8. Ativar os perfis e gerar conteúdo avulso/campanha em cada um, incluindo uso da mesma conta quando autorizado.
9. Recalibrar apenas Academy e comprovar que Consulting e peças agendadas permanecem com suas versões anteriores.
10. Criar um produtor de teste sem referências Bee implícitas e comprovar que ele não acessa dados Bee.

O item 10 é obrigatório antes de liberar clientes externos; os demais definem o percurso funcional inicial de Marcos.

## 11. O que permanece a definir

Marcos: núcleo inicial dos transformadores, interlocutores prioritários da Consulting, uso de emissor institucional e curadoria final de editorias/exemplos.

Raul: migrations após inspeção do banco, organização técnica dos serviços, composição das telas com o design existente, capacidades reais das integrações e plano de deploy/testes.

O produto já tem definidos os pontos de entrada, etapas, preservação, resultados e critérios acima. As decisões editoriais serão tomadas dentro do percurso, sem exigir que Raul as invente antes de implementá-lo.
