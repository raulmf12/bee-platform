# Hive — F03 · Campo relacional

**Versão:** 1.1  
**Status:** validação final  
**Família:** fotografia do produtor  
**Herda:** `hive_constituicao_fotografica_global_v1.0`  
**Perfil de teste:** `marcos_piccini_v1.1`

---

## 0. Função do estilo

F03 torna visível a qualidade de presença que surge entre pessoas: escutar, dialogar, construir e sustentar um campo coletivo.

O produtor não aparece como centro absoluto da cena. Sua autoridade é percebida pela forma como ele se relaciona com o outro e com o conjunto.

> **A relação não é cenário para a autoridade. É o lugar onde ela se revela.**

```yaml
style_id: F03
style_name: campo_relacional
function: tornar_visivel_o_modo_de_estar_com_outros
global_tone: autoridade_tranquila
performance_level: low
relational_presence: high
documentary_feel: high
identity_profile: marcos_piccini_v1.1
```

---

## 1. Regra de integridade factual

F03 é uma linguagem editorial para conteúdos conceituais sobre relações, equipes, escuta, cultura e cocriação.

As pessoas e situações geradas **nunca podem ser apresentadas como clientes, equipes, eventos, turmas ou trabalhos que realmente aconteceram**.

### Usar imagem real obrigatoriamente quando o texto afirmar

- “hoje estivemos com…”;
- “nesta reunião…”;
- “com a equipe da empresa…”;
- “na turma…”;
- “no evento…”;
- “este projeto…”;
- qualquer cliente, organização, local ou ocasião identificável.

### Imagem gerada pode acompanhar

- reflexão conceitual sobre escuta;
- dinâmica humana nas organizações;
- cocriação;
- confiança e conflito;
- papel do facilitador;
- inteligência coletiva;
- cultura, liderança e relações;
- presença em grupos.

```yaml
factual_claim_policy:
  conceptual_content: generated_allowed
  real_client_or_event_claim: real_photo_required
  identifiable_brand_or_organization: prohibited
```

---

## 2. Campo semântico

### Usar quando o conteúdo expressa

- escuta genuína;
- diálogo e construção de sentido;
- confiança;
- tensão relacional tratada com maturidade;
- colaboração;
- cocriação;
- inteligência coletiva;
- facilitação;
- cultura vivida entre pessoas;
- liderança como relação;
- presença em grupo;
- percepção do campo.

### Não usar quando o centro do conteúdo é

- posicionamento individual: usar F01;
- elaboração intelectual solitária: usar F02;
- transição, jornada ou futuro: usar F04;
- prova de trabalho realizado: usar fotografia real;
- celebração social ou networking: utilizar linguagem específica.

### Palavras-sinal para seleção

```yaml
positive_signals:
  - escutar
  - conversar
  - dialogar
  - cocriar
  - colaborar
  - confiar
  - relacionar
  - equipe
  - cultura
  - conflito
  - facilitar
  - coletivo
  - campo
  - encontro
  - vínculo

negative_signals:
  - anunciar
  - estudar
  - escrever
  - caminhar
  - conquistar
  - celebrar_evento_real
```

---

## 3. Princípio narrativo

A relação precisa ser lida por meio de reciprocidade, não apenas pela proximidade física.

### Sinais relacionais necessários

- olhares com destino coerente;
- corpos orientados uns aos outros;
- turnos de fala perceptíveis;
- distância interpessoal plausível;
- gestos que respondem ao momento;
- centro de atenção compartilhado;
- ausência de pose coletiva.

### O que deve permanecer ausente

- plateia admirando o produtor;
- grupo sorrindo para a câmera;
- aperto de mãos corporativo;
- liderança como comando;
- falsa intimidade;
- euforia de brainstorming;
- diversidade tratada como decoração visual.

---

## 4. Variantes do F03

### F03-A — Escuta presente

O produtor recebe a fala do outro sem preparar visivelmente uma resposta.

```yaml
variant_id: F03-A
relational_action: listening
group_size: 2
producer_role: receiver
energy: attentive
```

**Cena**

- conversa individual em ambiente neutro e silencioso;
- interlocutor parcialmente visível, de costas ou em ¾ no primeiro plano;
- Marcos orientado à pessoa, não à câmera;
- rosto atento, sem sorriso automático;
- mãos relaxadas e corpo levemente disponível.

**Enquadramentos**

- sobre o ombro do interlocutor;
- meio corpo ¾;
- foco em Marcos com presença legível do outro;
- composição íntima sem parecer terapia.

**Evitar**

- inclinação exagerada do tronco;
- concordância performática;
- mão no queixo;
- semblante de julgamento;
- interlocutor chorando ou vulnerável;
- cenário terapêutico.

---

### F03-B — Diálogo aberto

O produtor participa de uma troca equilibrada. Ele fala, mas a cena mantém o outro como presença real.

```yaml
variant_id: F03-B
relational_action: dialoguing
group_size: 2
producer_role: participant
energy: engaged
```

**Cena**

- conversa à mesa, em poltronas ou em espaço semiaberto;
- gesto de fala contido e plausível;
- interlocutor acompanha a fala com atenção natural;
- distância e objetos não criam barreira;
- nenhum dos dois domina a composição.

**Enquadramentos**

- plano médio com ambos presentes;
- lateral cruzado;
- ¾ do produtor com interlocutor em foco secundário;
- câmera ligeiramente fora do eixo da conversa.

**Evitar**

- dedo apontado;
- mãos excessivamente abertas;
- sorriso permanente;
- aperto de mãos;
- mesa de negociação;
- aparência de venda ou entrevista.

---

### F03-C — Construção compartilhada

Três ou quatro pessoas organizam uma compreensão em torno de um material comum.

```yaml
variant_id: F03-C
relational_action: co_creating
group_size: 3_to_4
producer_role: contributor
energy: constructive
```

**Cena**

- pequeno grupo ao redor de mesa ou superfície de trabalho;
- um caderno, folha ampla ou poucos cartões como centro compartilhado;
- Marcos participa sem assumir o centro da mesa;
- atenção circula entre pessoas e material;
- roupas e perfis dos participantes parecem naturais e não uniformizados.

**Enquadramentos**

- plano ambiental ¾;
- câmera na altura do grupo;
- composição assimétrica;
- ao menos três rostos ou presenças relacionais legíveis;
- mãos apenas quando anatomicamente confiáveis.

**Evitar**

- parede coberta de post-its;
- pessoas apontando simultaneamente;
- risadas publicitárias;
- diversidade calculada como catálogo;
- reunião corporativa genérica;
- texto legível inventado.

---

### F03-D — Presença no coletivo

O produtor sustenta uma conversa em pequeno grupo sem ocupar o lugar de palestrante.

```yaml
variant_id: F03-D
relational_action: holding_collective_space
group_size: 4_to_7
producer_role: facilitator
energy: grounded
```

**Cena**

- pequeno círculo ou semicírculo em sala simples;
- Marcos sentado ou em pé na mesma altura simbólica do grupo;
- uma pessoa fala ou o grupo sustenta uma pausa;
- o centro permanece relacional, não performático;
- ausência de palco, microfone, projeção ou marca.

**Enquadramentos**

- plano amplo íntimo;
- Marcos visto em ¾, integrado ao círculo;
- participantes podem aparecer parcialmente;
- arquitetura discreta e luz natural.

**Evitar**

- plateia;
- postura de professor;
- todos olhando para Marcos;
- círculo espiritualizado;
- mãos dadas;
- treinamento corporativo de banco de imagem;
- simulação de evento.

---

### F03-E — Facilitação em pé

O produtor conduz uma elaboração coletiva com apoio de flip chart ou quadro, preservando a participação do grupo.

```yaml
variant_id: F03-E
relational_action: facilitating_standing
group_size: 4_to_10
producer_role: facilitator
support: flip_chart_or_board
energy: active_and_dialogical
```

**Cena**

- Marcos em pé ao lado de flip chart ou quadro simples;
- pequeno grupo sentado ou em semicírculo na mesma sala;
- gesto de explicação ou pergunta dirigido às pessoas;
- quadro contém apenas traços, formas ou palavras desfocadas e ilegíveis;
- uma pessoa pode responder ou complementar a fala;
- não há marca de empresa, nome de programa ou identidade de evento.

**Enquadramentos**

- plano médio amplo ou corpo inteiro;
- câmera na altura dos participantes;
- Marcos deslocado do centro para preservar o grupo e o quadro;
- pelo menos parte do grupo visível e relacionalmente ativa.

**Evitar**

- costas voltadas integralmente para o grupo;
- apontar para texto legível inventado;
- parede coberta de post-its;
- postura de professor que transmite conteúdo unilateralmente;
- sala corporativa identificável;
- dinâmica de treinamento performática.

---

### F03-F — Apresentação dialogada

O produtor apresenta uma ideia em pé, mantendo troca visual e proximidade com um grupo pequeno ou médio.

```yaml
variant_id: F03-F
relational_action: presenting_dialogically
group_size: 6_to_20
producer_role: presenter_in_relation
support: optional_neutral_screen
energy: clear_and_engaged
```

**Cena**

- Marcos em pé diante de grupo próximo, sem palco elevado;
- tela neutra, parede ou projeção desfocada pode apoiar a fala;
- gesto contido e contato visual com uma pessoa específica;
- participantes aparecem parcialmente em primeiro plano ou lateral;
- a composição mantém sensação de conversa ampliada, não espetáculo.

**Enquadramentos**

- plano médio ou corpo inteiro;
- câmera ligeiramente lateral à audiência;
- perspectiva inclui Marcos e ao menos duas presenças do grupo;
- tela nunca ocupa o centro narrativo.

**Evitar**

- palco, holofote, púlpito ou auditório grandioso;
- microfone quando não for indispensável;
- plateia admirativa ou aplausos;
- pose de palestrante motivacional;
- slides, marcas, títulos ou dados inventados;
- gesto expansivo de performance.

---

## 5. Lógica de seleção da variante

| Intenção dominante do texto | Variante preferencial |
| --- | --- |
| Receber, perceber ou compreender o outro | F03-A |
| Trocar perspectivas ou sustentar uma conversa | F03-B |
| Criar, organizar ou resolver conjuntamente | F03-C |
| Facilitar, incluir ou sustentar um grupo | F03-D |
| Conduzir elaboração prática com quadro ou flip chart | F03-E |
| Apresentar uma ideia mantendo relação com o grupo | F03-F |

### Desempate

1. Identificar quem age e quem recebe no texto.
2. Escolher o menor número de pessoas capaz de representar a ideia.
3. Preferir F03-A ou F03-B quando o conteúdo não exige grupo.
4. Usar F03-D somente quando a dimensão coletiva for essencial.
5. Usar F03-E quando o quadro participa da elaboração; usar F03-F quando a fala é o eixo.
6. Se o texto mencionar situação real, bloquear geração e solicitar fotografia real.

```yaml
selection_output:
  style: F03
  variant: F03-A | F03-B | F03-C | F03-D | F03-E | F03-F
  semantic_reason: string
  relational_verb: string
  producer_role: receiver | participant | contributor | facilitator | presenter_in_relation
  factual_status: conceptual | real_claim_blocked
```

---

## 6. Gramática fotográfica

### Câmera

- lente equivalente entre 35 mm e 70 mm;
- câmera na altura dos participantes;
- profundidade de campo suficiente para preservar a relação;
- primeiro plano pode incluir ombro ou gesto de outra pessoa;
- evitar teleobjetiva que isole Marcos do grupo;
- evitar grande angular que deforme pessoas nas bordas.

### Composição

- linhas de olhar formam a estrutura principal;
- Marcos não deve ocupar sempre o centro;
- participantes não são moldura decorativa;
- espaços vazios entre corpos devem parecer naturais;
- objetos compartilhados permanecem secundários à relação;
- cortar parcialmente uma pessoa é aceitável quando reforça o ponto de vista documental.

### Luz

- natural difusa ou luz ambiente plausível;
- contraste moderado;
- tons de pele coerentes entre participantes;
- nenhuma pessoa artificialmente iluminada como protagonista;
- evitar aparência de fotografia de evento corporativo.

### Gestos e olhares

- cada olhar precisa ter um destino;
- gestos respondem ao turno de fala;
- mãos não podem competir com rostos;
- expressões do grupo devem variar naturalmente;
- ninguém olha para a câmera;
- risos e sorrisos somente quando a cena justificar.

---

## 7. Ambientes e pessoas

### Ambientes compatíveis

- sala de conversa neutra;
- mesa de trabalho pequena;
- biblioteca discreta;
- varanda ou jardim protegido;
- café silencioso;
- sala de aprendizagem sem marca;
- sala de workshop sem identidade corporativa;
- espaço de apresentação próximo e sem palco elevado;
- espaço contemporâneo de baixa formalidade.

### Recursos compatíveis

- flip chart sem conteúdo legível;
- quadro branco ou parede de apoio com poucos traços;
- tela neutra ou projeção desfocada sem marca;
- caneta de quadro;
- cadeiras em semicírculo;
- mesa lateral discreta.

### Participantes editoriais

- adultos com aparência profissional plausível;
- roupas variadas, discretas e coerentes com o ambiente;
- diversidade pode existir quando natural à cena, nunca como checklist visual;
- nenhuma pessoa deve parecer celebridade ou cliente reconhecível;
- participantes não recebem nomes, cargos ou organizações.

### Incompatíveis

- sala de conselho luxuosa;
- palco elevado, auditório grandioso ou iluminação de espetáculo;
- recepção de empresa identificável;
- equipe uniformizada;
- evento com crachás;
- cenário terapêutico;
- retiro espiritual;
- confraternização ou networking.

---

## 8. Identidade, corpo e vestuário

O estilo herda integralmente `marcos_piccini_v1.1`.

```yaml
current_identity_and_body: priority_A0
expression_and_gesture: priority_A
speech_support: priority_D
historical_body_use: prohibited
```

### Regras específicas

- rosto, peso, pescoço, cintura e silhueta seguem A0;
- expressões de escuta utilizam E01 e E04;
- expressão de fala utiliza E05 com baixa intensidade;
- preservar assimetrias, idade, pele, cabelo e barba;
- camiseta preta, camisa azul-marinho ou azul-clara conforme a cena;
- roupas não devem sugerir cargo ou hierarquia;
- não adicionar crachá, microfone, controle remoto ou acessórios de palestrante;
- postura deve demonstrar relação, não domínio.
- na facilitação ou apresentação, preservar contato visual coerente e gestos contidos;
- o olhar deve permanecer alinhado ao interlocutor ou ao grupo, sem convergência ou desvio ocular artificial;

---

## 9. Contrato de prompt

```text
Use case: identity-preserve
Asset type: conceptual editorial producer photography
Style: F03 Campo relacional
Variant: <F03-A | F03-B | F03-C | F03-D | F03-E | F03-F>

Primary request: show Marcos Piccini in a credible human interaction where authority is expressed through listening, dialogue, contribution, facilitation or a presentation sustained in relationship. The relational field is the subject. Marcos must not appear as a celebrity, unilateral lecturer or dominant center.

Factual status: conceptual editorial scene only. Do not imply a real client, company, team, event, class or documented engagement.

Input images: A0 references define exact current identity, weight, waist, silhouette and body proportions. HAR and approved speech references define expression and gesture only.

Relational action: <listening | dialoguing | co_creating | holding_collective_space | facilitating_standing | presenting_dialogically>
Producer role: <receiver | participant | contributor | facilitator | presenter_in_relation>
Participants: <number and non-identifiable editorial roles>
Scene: <neutral compatible environment>
Framing: <camera position and relational composition>
Lighting: plausible soft natural light, documentary grade
Wardrobe: <approved clothing consistent with scene>

Constraints: exact recognizable identity and current proportions; coherent mutual gaze; plausible interpersonal distance; anatomically correct hands; every gesture responds to the relational moment; no participant looks at camera; no readable invented text; no logos, brands, badges or watermark.

Avoid: fake client or team claim, unilateral lecture, elevated stage, spectacle lighting, applause, handshake, pointing finger, sales meeting, executive boardroom, everyone admiring Marcos, motivational-speaker pose, staged brainstorming, wall of post-its, readable invented flip-chart or slide content, forced diversity, constant smiles, spiritual circle, therapy scene, altered age, historical body volume, additional slimming, athletic definition, malformed hands, crossed or incoherent eyes, incoherent mutual gaze, generic corporate stock photography, plastic skin, excessive bokeh.
```

---

## 10. Portões de qualidade

### Q1 — Identidade

- Marcos é imediatamente reconhecível?
- rosto e corpo correspondem às referências A0?
- idade, cabelo, barba e textura de pele foram preservados?

### Q2 — Relação

- todos os olhares têm destino coerente?
- os dois olhos de cada pessoa convergem naturalmente para o mesmo destino?
- corpos e distâncias respondem à mesma interação?
- existe reciprocidade, mesmo quando Marcos fala?
- o grupo parece estar no mesmo momento?

### Q3 — Papel do produtor

- Marcos escuta, participa, contribui ou facilita conforme a variante?
- sua autoridade aparece sem centralidade artificial?
- a cena evita professor unilateral, guru, vendedor ou palestrante motivacional?
- quando em pé, Marcos continua em relação com pessoas concretas e não com uma plateia abstrata?

### Q4 — Realismo

- mãos, braços, cadeiras, mesa e objetos são anatomicamente coerentes?
- participantes parecem pessoas reais e distintas?
- luz e foco preservam o campo relacional?
- o ambiente parece habitado e não cenográfico?

### Q5 — Integridade factual

- a imagem é claramente editorial e não prova de um trabalho real?
- nenhum cliente, marca, empresa, evento ou local é sugerido?
- a legenda pretendida permanece conceitual?

Qualquer falha em Q1, Q2 ou Q5 implica rejeição automática.

---

## 11. Motivos de rejeição automática

```yaml
hard_reject:
  - identity_drift
  - current_body_mismatch
  - incoherent_mutual_gaze
  - malformed_hands_or_bodies
  - fake_client_team_or_event
  - identifiable_brand_or_location
  - unilateral_lecturer_or_guru_pose
  - crossed_or_incoherent_eyes
  - admiring_audience_or_applause
  - corporate_handshake
  - staged_brainstorming
  - dominant_center_composition
  - spiritual_or_therapy_scene
  - forced_stock_diversity
  - generic_corporate_stock_photo
  - historical_body_transfer
  - additional_slimming
  - visible_text_logo_badge_or_watermark
```

---

## 12. Prancha de validação

A validação final deve apresentar seis painéis sem textos ou legendas:

1. **F03-A:** Marcos ouvindo uma pessoa em conversa individual;
2. **F03-B:** diálogo equilibrado entre Marcos e um interlocutor;
3. **F03-C:** construção compartilhada com três ou quatro pessoas em torno de um material;
4. **F03-D:** pequeno grupo em círculo ou semicírculo, Marcos sustentando o campo sem palestrar.
5. **F03-E:** facilitação em pé com flip chart ou quadro e pequeno grupo ativo;
6. **F03-F:** apresentação dialogada em pé, sem palco elevado e com presença do grupo.

Todos os painéis devem:

- preservar identidade e proporções A0;
- apresentar relações visuais coerentes;
- variar papel, número de pessoas e ambiente;
- validar alinhamento ocular especialmente em F03-B, F03-E e F03-F;
- evitar qualquer marca corporativa;
- parecer cenas editoriais humanas, não registros falsos de clientes ou eventos.

---

## 13. Metadados de saída

```yaml
asset_metadata:
  producer_id: marcos_piccini
  identity_profile: marcos_piccini_v1.1
  photographic_style: F03
  variant: F03-A | F03-B | F03-C | F03-D | F03-E | F03-F
  semantic_reason: string
  relational_verb: string
  producer_role: receiver | participant | contributor | facilitator | presenter_in_relation
  participant_count: integer
  factual_status: conceptual_editorial
  environment: string
  framing: string
  wardrobe: string
  reference_ids: array
  identity_status: approved | rejected
  relational_status: approved | rejected
  realism_status: approved | rejected
  factual_integrity_status: approved | rejected
  reviewer_notes: string
```

---

## 14. Síntese operacional

> **F03 mostra autoridade em relação: o produtor não ocupa a cena; ajuda a relação a ganhar qualidade.**
