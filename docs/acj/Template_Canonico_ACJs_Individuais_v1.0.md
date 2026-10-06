---
id: ACJ-TEMPLATE-CANONICAL
title: Template Canônico das Arquiteturas de Conexão e Jornada Individuais
library: Arquiteturas de Conexão e Jornada
document_type: canonical_template
status: consolidated
version: "1.0"
date: 2026-09-29
canonical: true
governed_by: ACJ-00
applies_to:
  - ACJ-01
  - ACJ-02
  - ACJ-03
  - ACJ-04
  - ACJ-05
---

# Template Canônico das ACJs Individuais

> **Decisão central:** todas as ACJs individuais devem possuir a mesma estrutura documental e operacional. A identidade de cada arquitetura muda; as regras de descrição, atribuição, observação e evolução permanecem comuns.

# 1 Finalidade

Este template define a estrutura obrigatória dos documentos ACJ-01 a ACJ-05. Ele permite que a Hive:

- diferencie com precisão cada movimento relacional;
- selecione a arquitetura adequada antes da criação da pauta;
- atribua uma ACJ primária e, quando necessário, uma secundária ao conteúdo-mãe;
- reconheça manifestações compatíveis sem reduzir a arquitetura a um formato;
- observe sinais coerentes com o movimento pretendido;
- distinga falha de arquitetura, conteúdo, execução, distribuição e contexto;
- registrar aprendizagens sem alterar prematuramente a biblioteca consolidada.

Este documento não define o conteúdo específico de cada ACJ. Ele define como esse conteúdo deve ser estruturado.

# 2 Decisões herdadas da ACJ-00

1. ACJ-00 é governança e não pode ser atribuída a um conteúdo.
2. Somente ACJ-01 a ACJ-05 participam do mix de campanha e ciclo.
3. As ACJs são movimentos relacionais, não editorias, temas, formatos ou etapas obrigatórias de um funil.
4. Todo conteúdo-mãe possui uma ACJ primária e pode possuir no máximo uma secundária.
5. As peças herdam a ACJ do conteúdo-mãe. Mudança de movimento exige nova variante de conteúdo.
6. Proporções e sequências são hipóteses ajustáveis, governadas pela ACJ-00.
7. Desempenho isolado não valida nem invalida uma arquitetura.
8. Mudanças estruturais exigem evidência, teste, aprovação e nova versão documental.

# 3 Unidade de descrição

Cada documento individual deve descrever uma única arquitetura em quatro camadas complementares:

| Camada | Pergunta |
|---|---|
| Identidade | Que movimento relacional esta arquitetura realiza? |
| Operação | Em que condições deve ser usada e por qual mecanismo atua? |
| Expressão | De quais formas pode se manifestar sem se confundir com um formato? |
| Aprendizagem | Que sinais permitem observar, testar e evoluir seu uso? |

# 4 Metadados obrigatórios

Cada ACJ individual deve iniciar com front matter YAML.

| Campo | Regra |
|---|---|
| id | Código único no padrão `ACJ-0X`. |
| name | Nome oficial da arquitetura. |
| movement | Movimento relacional expresso por um substantivo. |
| document_type | Sempre `relational_architecture`. |
| status | `draft`, `in_validation`, `consolidated` ou `deprecated`. |
| version | Versão semântica do documento. |
| date | Data da versão em `AAAA-MM-DD`. |
| canonical | `true` somente para a versão vigente aprovada. |
| governed_by | Sempre `ACJ-00`. |
| primary_question | Pergunta relacional respondida pela arquitetura. |
| state_from | Estado ou condição de origem que a arquitetura acolhe. |
| state_to | Deslocamento que a arquitetura pretende favorecer. |
| mechanism | Nome sintético do mecanismo de conexão. |

# 5 Estrutura obrigatória

Toda ACJ individual deve conter, nesta ordem:

1. definição;
2. propósito;
3. condições de uso;
4. mecanismo de conexão;
5. manifestações possíveis;
6. limites e desvios;
7. resultados esperados;
8. aprendizagem;
9. integração operacional;
10. portões de qualidade;
11. governança e versionamento.

# 6 Instruções por seção

## 6.1 Definição

A definição deve:

- dizer qual movimento relacional a arquitetura produz;
- explicitar entre quem ou o que esse movimento ocorre;
- indicar o deslocamento de `state_from` para `state_to`;
- distinguir a arquitetura das ACJs vizinhas;
- caber em um parágrafo sem recorrer a exemplos.

A definição não deve usar como sinônimos funções estratégicas, editorias, templates, formatos ou CTAs.

## 6.2 Propósito

O propósito deve explicar por que esse movimento é necessário na jornada. Deve relacionar:

- necessidade da audiência;
- qualidade de relação que se pretende construir;
- função da arquitetura no sistema da campanha;
- risco de sua ausência ou uso insuficiente.

## 6.3 Condições de uso

Esta seção deve separar quatro tipos de condição:

| Tipo | Conteúdo esperado |
|---|---|
| Indicações | Sinais de que o movimento é necessário agora. |
| Pré-condições | O que precisa existir para a arquitetura atuar com integridade. |
| Contraindicações | Situações em que outra ACJ ou outra intervenção é mais adequada. |
| Contexto temporal | Fase, proximidade de eventos, saturação ou histórico que altera sua prioridade. |

As condições não podem ser formuladas apenas a partir do desejo comercial da campanha.

## 6.4 Mecanismo de conexão

O mecanismo descreve **como** a arquitetura produz o movimento. Deve conter:

1. estado percebido de origem;
2. operação relacional realizada pelo conteúdo;
3. experiência favorecida na audiência;
4. deslocamento esperado;
5. sinais que sugerem que o mecanismo ocorreu.

O mecanismo não é uma técnica de copy, uma fórmula narrativa ou um formato visual. Esses recursos podem realizá-lo, mas não o definem.

## 6.5 Manifestações possíveis

As manifestações mostram como a arquitetura pode aparecer em conteúdos concretos. Devem ser organizadas por natureza, não apenas por canal.

Categorias recomendadas:

- gesto autoral;
- estrutura narrativa;
- tipo de pauta;
- experiência proposta;
- interação ou convite;
- expressão visual ou fotográfica compatível;
- adaptação por canal.

Exemplos são ilustrativos, não prescritivos. Nenhuma manifestação deve se tornar equivalência automática entre ACJ, M01–M04 ou F01–F04.

## 6.6 Limites e desvios

Esta seção deve registrar:

- o que a arquitetura não é;
- confusões prováveis com outras ACJs;
- usos prematuros, artificiais ou manipulativos;
- manifestações que simulam o movimento sem realizá-lo;
- sinais de saturação;
- riscos de desalinhamento com a identidade de Marcos e da Bee;
- fatores externos capazes de distorcer a leitura dos resultados.

Todo desvio deve indicar se tende a ser erro de atribuição, conteúdo, execução, distribuição ou contexto.

## 6.7 Resultados esperados

Os resultados devem ser descritos em três níveis:

| Nível | Resultado |
|---|---|
| Audiência | Sinais perceptivos, afetivos, cognitivos ou comportamentais coerentes com o movimento. |
| Jornada | Mudança de disponibilidade, vínculo, participação ou prontidão. |
| Negócio | Efeitos comerciais possíveis, tratados como consequência contextual, não prova isolada da ACJ. |

Cada resultado deve distinguir:

- sinal esperado;
- indicador possível;
- janela de observação;
- limitação da inferência.

## 6.8 Aprendizagem

A seção de aprendizagem deve orientar o que observar sem incorporar conclusões provisórias ao documento consolidado. Deve conter:

- perguntas de aprendizagem;
- evidências relevantes;
- comparações minimamente adequadas;
- fatores de confusão;
- hipóteses testáveis;
- critérios para ajuste de execução;
- critérios para investigar ajuste de arquitetura ou nova variante;
- ligação com o Registro Vivo de Aprendizagens ACJ.

Uma aprendizagem só altera esta seção depois de validada segundo a ACJ-00.

## 6.9 Integração operacional

Cada arquitetura deve declarar como informa os objetos da Hive sem assumir o papel deles.

| Objeto | Integração esperada |
|---|---|
| Campanha | Participa do mix ACJ governado pela ACJ-00. |
| Ciclo | Pode ser priorizada, reduzida ou ausente com justificativa. |
| Pauta | Orienta o movimento antes da formulação da ideia. |
| Conteúdo-mãe | Torna-se metadado canônico e contrato relacional. |
| Peças | É herdada; adaptações não podem mudar silenciosamente o movimento. |
| M01–M04 | Atua como contexto semântico, sem equivalência fixa. |
| F01–F04 | Atua como sinal de compatibilidade, sem substituir a constituição fotográfica. |
| Agenda | Informa ordem, espaçamento, reforço, lacuna e saturação. |
| Resultados | Permite relacionar resposta observada à hipótese relacional. |

# 7 Contrato operacional mínimo

| Bloco | Campos |
|---|---|
| Identidade | acj_id; name; version; status |
| Movimento | primary_question; state_from; state_to; mechanism |
| Uso | indications; preconditions; contraindications; temporal_context |
| Expressão | manifestation_types; compatible_patterns; non_equivalences |
| Limites | failure_modes; confusion_with; saturation_signals; integrity_risks |
| Resultado | expected_audience_signals; journey_results; business_effects; observation_window |
| Aprendizagem | learning_questions; evidence_requirements; confounders; test_hypotheses |
| Governança | governed_by; approved_by; approved_at; change_log |

# 8 Regras de redação

1. Usar linguagem descritiva e operacional, sem copy promocional.
2. Definir o movimento antes de apresentar exemplos.
3. Evitar conceitos circulares, como definir Conexão apenas como “conteúdo que conecta”.
4. Distinguir necessidade relacional de objetivo comercial.
5. Distinguir mecanismo de manifestação.
6. Distinguir sinal esperado de métrica disponível.
7. Não transformar correlação em causalidade.
8. Não presumir sequência linear entre ACJs.
9. Não fabricar precisão onde ainda existe hipótese.
10. Registrar ambiguidades relevantes para validação humana.

# 9 Portões de qualidade

| Portão | Pergunta de validação |
|---|---|
| Q0 Identidade | A arquitetura realiza um movimento próprio e distinguível? |
| Q1 Necessidade | As condições de uso partem da jornada, não apenas do objetivo comercial? |
| Q2 Mecanismo | Está claro como o conteúdo favorece o deslocamento esperado? |
| Q3 Fronteira | A diferença para as demais ACJs está explícita? |
| Q4 Manifestação | Os exemplos ampliam repertório sem virar receitas ou equivalências? |
| Q5 Integridade | Limites, simulações e riscos manipulativos foram identificados? |
| Q6 Evidência | Os sinais esperados são observáveis e proporcionais à inferência? |
| Q7 Aprendizagem | As hipóteses podem ser testadas sem alterar o documento consolidado? |
| Q8 Integração | A ACJ informa as demais estruturas sem substituí-las? |
| Q9 Governança | A versão e o nível de aprovação estão registrados? |

Nenhuma ACJ individual pode receber status `consolidated` sem aprovação em todos os portões.

# 10 Governança e versionamento

| Mudança | Tratamento |
|---|---|
| Correção textual sem mudança de sentido | Revisão editorial e incremento de patch. |
| Refinamento de condição, mecanismo, limite ou resultado | Hipótese no Registro Vivo, validação humana e nova versão. |
| Nova manifestação recorrente | Avaliar como exemplo adicional ou variante formal. |
| Alteração da identidade do movimento | Revisão estrutural sob governança da ACJ-00. |
| Padrão que não cabe na arquitetura | Investigar possível nova arquitetura; não expandir silenciosamente a definição. |

# 11 Bloco canônico para criação de uma ACJ

O bloco abaixo deve ser copiado para iniciar ACJ-01 a ACJ-05.

````markdown
---
id: ACJ-0X
name: "[PREENCHER: nome oficial]"
movement: "[PREENCHER: movimento relacional]"
document_type: relational_architecture
status: draft
version: "0.1"
date: AAAA-MM-DD
canonical: false
governed_by: ACJ-00
primary_question: "[PREENCHER]"
state_from: "[PREENCHER]"
state_to: "[PREENCHER]"
mechanism: "[PREENCHER]"
---

# ACJ-0X — [Nome]

> **Frase central:** [Síntese do movimento em uma frase.]

# 1 Definição

[Definição do movimento, fronteira e deslocamento realizado.]

# 2 Propósito

[Necessidade da jornada, qualidade relacional buscada e risco da ausência.]

# 3 Condições de uso

## 3.1 Indicações

- [PREENCHER]

## 3.2 Pré-condições

- [PREENCHER]

## 3.3 Contraindicações

- [PREENCHER]

## 3.4 Contexto temporal

- [PREENCHER]

# 4 Mecanismo de conexão

| Elemento | Descrição |
|---|---|
| Estado de origem | [PREENCHER] |
| Operação relacional | [PREENCHER] |
| Experiência favorecida | [PREENCHER] |
| Deslocamento esperado | [PREENCHER] |
| Sinais iniciais | [PREENCHER] |

# 5 Manifestações possíveis

| Natureza | Manifestações possíveis | Observações |
|---|---|---|
| Gesto autoral | [PREENCHER] | [PREENCHER] |
| Estrutura narrativa | [PREENCHER] | [PREENCHER] |
| Tipo de pauta | [PREENCHER] | [PREENCHER] |
| Experiência ou convite | [PREENCHER] | [PREENCHER] |
| Expressão visual | [PREENCHER] | [PREENCHER] |
| Adaptação por canal | [PREENCHER] | [PREENCHER] |

# 6 Limites e desvios

## 6.1 O que esta arquitetura não é

- [PREENCHER]

## 6.2 Confusões com outras ACJs

| ACJ relacionada | Diferença essencial |
|---|---|
| [PREENCHER] | [PREENCHER] |

## 6.3 Falhas e simulações do movimento

| Desvio | Classe do problema | Sinal de alerta |
|---|---|---|
| [PREENCHER] | atribuição, conteúdo, execução, distribuição ou contexto | [PREENCHER] |

## 6.4 Saturação e riscos de integridade

- [PREENCHER]

# 7 Resultados esperados

| Nível | Sinal esperado | Indicador possível | Janela | Limitação |
|---|---|---|---|---|
| Audiência | [PREENCHER] | [PREENCHER] | [PREENCHER] | [PREENCHER] |
| Jornada | [PREENCHER] | [PREENCHER] | [PREENCHER] | [PREENCHER] |
| Negócio | [PREENCHER] | [PREENCHER] | [PREENCHER] | [PREENCHER] |

# 8 Aprendizagem

## 8.1 Perguntas de aprendizagem

- [PREENCHER]

## 8.2 Evidências e comparações

- [PREENCHER]

## 8.3 Fatores de confusão

- [PREENCHER]

## 8.4 Hipóteses testáveis

| Hipótese | Variável | Controle | Sinal esperado | Critério de decisão |
|---|---|---|---|---|
| [PREENCHER] | [PREENCHER] | [PREENCHER] | [PREENCHER] | [PREENCHER] |

# 9 Integração operacional

[Descrever a relação com campanha, ciclo, pauta, conteúdo-mãe, peças, M01–M04, F01–F04, agenda e resultados.]

# 10 Portões de qualidade

| Portão | Status | Evidência ou pendência |
|---|---|---|
| Q0 Identidade | pendente | [PREENCHER] |
| Q1 Necessidade | pendente | [PREENCHER] |
| Q2 Mecanismo | pendente | [PREENCHER] |
| Q3 Fronteira | pendente | [PREENCHER] |
| Q4 Manifestação | pendente | [PREENCHER] |
| Q5 Integridade | pendente | [PREENCHER] |
| Q6 Evidência | pendente | [PREENCHER] |
| Q7 Aprendizagem | pendente | [PREENCHER] |
| Q8 Integração | pendente | [PREENCHER] |
| Q9 Governança | pendente | [PREENCHER] |

# 11 Governança e histórico

| Versão | Data | Mudança | Evidência | Aprovação |
|---|---|---|---|---|
| 0.1 | AAAA-MM-DD | Primeira formulação | Arquitetura inicial | pendente |
````

# 12 Decisões congeladas na versão 1

1. Todas as ACJs individuais usam a mesma estrutura obrigatória.
2. O documento consolidado descreve a arquitetura; hipóteses provisórias permanecem no Registro Vivo.
3. A ACJ deve ser definida pelo movimento, não por exemplos ou formatos.
4. Resultados de negócio não comprovam isoladamente que o movimento relacional ocorreu.
5. Nenhuma ACJ pode estabelecer equivalência fixa com editoria, narrativa, M01–M04 ou F01–F04.
6. A ACJ-00 governa proporção, sequência, aprendizagem e mudança estrutural.
7. Consolidação exige aprovação dos dez portões de qualidade.

# 13 Próximo passo

Aplicar este template à **ACJ-01 — Reconhecimento**, validando a estrutura antes de replicá-la para ACJ-02 a ACJ-05.
