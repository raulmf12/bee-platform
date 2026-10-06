# Hive — F01 · Presença Autoral

**Versão:** 1.0  
**Status:** proposta para validação visual  
**Tipo:** estilo fotográfico selecionável pela Hive  
**Herda:** `hive_constituicao_fotografica_global_v1.0`  
**Perfil de teste:** `marcos_piccini_v1.1`

---

## 0. Essência

> **O produtor não ilustra a ideia. Ele sustenta a ideia com sua presença.**

F01 é um retrato autoral. Sua função é aproximar uma mensagem da pessoa que assume aquela posição, sem transformar o produtor em celebridade, modelo ou personagem.

Não é uma foto institucional convencional. Também não é um flagrante de ação. É uma presença humana, reconhecível e contextual, com força suficiente para acompanhar uma ideia autoral.

---

## 1. Função editorial

### Usar quando o conteúdo

- apresenta uma posição do produtor;
- parte de uma experiência pessoal;
- formula uma provocação;
- traz uma crença ou princípio;
- abre ou fecha uma campanha;
- precisa aproximar público e autoria;
- pede rosto e presença, mas não exige prova factual;
- possui força verbal própria e não precisa ser literalmente ilustrado.

### Não usar quando o conteúdo

- depende de prova de evento, cliente ou resultado;
- é predominantemente tutorial ou operacional;
- pede demonstração de processo;
- trata principalmente de relações ou dinâmica coletiva;
- exige movimento, horizonte ou transformação temporal;
- já utilizou retrato autoral repetidamente na janela recente;
- não pertence de fato ao produtor.

---

## 2. Assinatura visual

```yaml
style_id: F01
name: presenca_autoral
primary_function: autoria
secondary_functions: [proximidade, posicionamento, reconhecimento]
global_tone: autoridade_tranquila
documentary_feel: high
performance_level: low
identity_priority: maximum
action_level: low
environment_level: low_to_medium
```

### Deve transmitir

- presença;
- clareza;
- humanidade;
- autoria;
- inteligência silenciosa;
- confiança sem imposição;
- proximidade sem intimidade fabricada.

### Não deve transmitir

- foto de perfil corporativo genérica;
- ensaio de celebridade;
- autoridade performada;
- pose de guru;
- sedução publicitária;
- dramatização emocional;
- glamour;
- solenidade;
- superioridade.

---

## 3. Regra de seleção pela Hive

### Dimensões de entrada

```yaml
autoria: 0.0–1.0
forca_posicionamento: 0.0–1.0
intimidade: 0.0–1.0
densidade_conceitual: 0.0–1.0
relacionalidade: 0.0–1.0
energia_acao: 0.0–1.0
orientacao_futuro: 0.0–1.0
necessidade_evidencia: 0.0–1.0
valor_atmosfera: 0.0–1.0
```

### Regra-base

```text
SE autoria >= 0.70
E necessidade_evidencia < 0.45
E energia_acao < 0.60
ENTÃO F01 é candidato.
```

### Reforços positivos

- texto em primeira pessoa;
- frase-mãe com ponto de vista claro;
- assinatura pessoal relevante;
- campanha que precisa apresentar ou reapresentar o produtor;
- conteúdo que pede conexão humana antes de explicação.

### Penalidades

- F01 utilizado em dois dos três conteúdos anteriores;
- mesmo enquadramento recente;
- mesma roupa recente;
- mesma direção de olhar recente;
- conteúdo com alto valor relacional ou processual;
- tentativa de compensar texto fraco com rosto.

---

## 4. Variações

O F01 possui quatro variações. Elas não são filtros estéticos: cumprem funções editoriais diferentes.

---

### F01-A — Presença direta

**Operação:** posição + encontro.

O produtor olha para a câmera com expressão serena. A imagem cria um encontro direto sem confronto.

#### Usar quando

- a mensagem é uma afirmação forte;
- há uma pergunta ou provocação dirigida ao público;
- o produtor assume claramente uma posição;
- o post abre uma campanha;
- o rosto precisa funcionar como âncora de autoria.

#### Expressões

- E01 — Atenção serena;
- E02 — Proximidade discreta.

#### Enquadramento

- close aberto, busto ou meio corpo curto;
- câmera na altura dos olhos;
- rosto frontal ou desvio máximo de 15°;
- olhar direto para a lente;
- ombros levemente angulados para evitar rigidez;
- espaço negativo preferencial em um dos lados.

#### Ambiente

- neutro, real e pouco informativo;
- luz de janela, parede texturizada, estante suave ou área externa discreta;
- fundo reconhecível, mas não descritivo.

#### Evitar

- braços cruzados como padrão;
- sorriso aberto;
- fundo corporativo;
- luz dramática;
- centralização simétrica excessiva;
- retrato de currículo.

---

### F01-B — Pensamento presente

**Operação:** autoria + elaboração.

O produtor não olha para a câmera. A fotografia registra um instante intermediário de pensamento, sem usar a pose clichê de “pensador”.

#### Usar quando

- o conteúdo é conceitual;
- a frase convida à reflexão;
- existe tensão, dúvida ou elaboração;
- a mensagem não pede confronto direto;
- o texto possui alta densidade conceitual.

#### Expressões

- E01 — Atenção serena;
- E04 — Reflexão.

#### Enquadramento

- busto ou meio corpo;
- rosto em ¾;
- olhar lateral, ligeiramente abaixo ou além da câmera;
- espaço visual preservado na direção do olhar;
- produtor deslocado do centro;
- mãos ausentes ou naturalmente apoiadas.

#### Ambiente

- janela, café silencioso, biblioteca, espaço de trabalho ou área externa;
- o ambiente deve existir sem narrar uma ação específica.

#### Evitar

- mão no queixo;
- olhar teatral para cima;
- expressão triste;
- janela com cidade luxuosa;
- profundidade de campo extrema;
- “homem pensando” de banco de imagem.

---

### F01-C — Proximidade humana

**Operação:** autoria + abertura.

O produtor aparece mais próximo, espontâneo e acessível. A imagem reduz distância sem diluir autoridade.

#### Usar quando

- o conteúdo traz experiência pessoal;
- há agradecimento, celebração ou reconhecimento;
- a campanha pede acolhimento;
- o texto fala de relações, mas ainda é essencialmente autoral;
- a mensagem precisa humanizar o produtor.

#### Expressões

- E02 — Proximidade discreta;
- E03 — Alegria espontânea.

#### Enquadramento

- close, busto ou meio corpo curto;
- câmera próxima, sem grande angular;
- olhar para a câmera ou para alguém fora do quadro;
- composição ligeiramente assimétrica;
- pequenos movimentos do corpo são permitidos.

#### Ambiente

- luz natural quente e contida;
- mesa, café, jardim, corredor ou ambiente de convivência;
- objetos secundários discretos.

#### Evitar

- sorriso obrigatório;
- dentes artificialmente perfeitos;
- pose de influenciador;
- risada congelada sem contexto;
- intimidade doméstica não autorizada;
- ambiente festivo genérico.

---

### F01-D — Presença em contexto

**Operação:** autoria + mundo real.

O ambiente ganha mais espaço, mas o produtor continua sendo o centro semântico. Não há ação principal; há presença situada.

#### Usar quando

- o contexto contribui para o significado;
- o post conecta visão pessoal e realidade;
- a campanha precisa variar enquadramentos;
- o conteúdo pede uma presença menos frontal;
- há necessidade de amplo espaço para texto.

#### Expressões

- E01 — Atenção serena;
- E02 — Proximidade discreta;
- E04 — Reflexão.

#### Enquadramento

- meio corpo amplo ou ¾ corporal somente quando houver referência suficiente;
- produtor ocupa aproximadamente 30%–50% da imagem;
- ambiente ocupa 50%–70%;
- olhar direto ou lateral;
- corpo pode estar apoiado ou sentado;
- espaço negativo planejado para o layout.

#### Ambiente

- espaço de trabalho realista;
- arquitetura discreta;
- café, biblioteca, jardim ou área urbana tranquila;
- nenhum cliente, plateia ou evento fabricado.

#### Evitar

- transformar o ambiente em símbolo de status;
- paisagem épica;
- produtor minúsculo no quadro;
- cenário mais interessante do que a pessoa;
- postura de campanha de moda;
- objetos cenográficos sem função.

---

## 5. Árvore de decisão entre variações

```text
O conteúdo pede encontro direto ou afirmação clara?
├─ SIM → F01-A
└─ NÃO
   O conteúdo pede reflexão ou elaboração conceitual?
   ├─ SIM → F01-B
   └─ NÃO
      O conteúdo pede calor, reconhecimento ou aproximação?
      ├─ SIM → F01-C
      └─ NÃO → F01-D
```

### Desempate

Quando duas variações forem semanticamente adequadas:

1. escolher a menos utilizada na janela recente;
2. preservar diversidade de olhar, roupa e enquadramento;
3. escolher a variação que melhor acomoda o texto no formato;
4. nunca sacrificar fidelidade facial para aumentar diversidade.

---

## 6. Gramática fotográfica

### Câmera e lente

```yaml
lens_equivalent:
  preferred: 50mm–85mm
  environmental: 35mm–50mm
  avoid: below_35mm_close_to_face
camera_height: eye_level
perspective: natural
depth_of_field: moderate
sharpness: natural_not_crispy
grain: subtle_optional
```

### Luz

- natural ou aparentemente natural;
- lateral suave ou frontal difusa;
- contraste baixo a médio;
- preservar textura da pele;
- sombras com detalhe;
- recorte de cabelo natural;
- temperatura neutra a levemente quente;
- evitar luz cinematográfica evidente.

### Cor

- pele verdadeira;
- verdes, madeiras, cinzas, azuis e neutros naturais;
- saturação baixa a média;
- preto e azul-marinho permitidos no vestuário;
- laranja da marca não precisa aparecer na fotografia;
- evitar gradação teal-and-orange.

### Profundidade

- fundo suave, mas reconhecível;
- não apagar completamente o ambiente;
- bokeh não pode ser o estilo dominante;
- o produtor e o fundo devem pertencer à mesma fotografia.

---

## 7. Composição para texto

Cada imagem deve declarar uma das opções:

```yaml
text_space: left | right | top | bottom | none
```

### Regras

- preferir espaço lateral ao produtor;
- manter direção do olhar voltada para dentro da composição;
- não colocar texto sobre olhos, boca ou mãos;
- fundo da área de texto deve ter baixa complexidade;
- gerar versões recompostas para 4:5 e 9:16;
- não usar apenas crop automático;
- a foto precisa funcionar também sem texto.

---

## 8. Repertório por canal

### Instagram feed — 4:5

- close, busto e meio corpo;
- presença visual forte;
- espaço de texto opcional;
- evitar excesso de ambiente.

### Instagram story — 9:16

- recompor verticalmente;
- reservar topo e base para interface;
- rosto preferencialmente no terço médio-superior;
- evitar olhos próximos demais das bordas.

### LinkedIn — 4:5 preferencial

- meio corpo e presença em contexto funcionam melhor;
- manter naturalidade e sofisticação sem estética corporativa genérica;
- F01-A e F01-D são prioritários.

### Site e anúncios

- F01-D quando houver texto lateral;
- F01-A quando a autoria for o argumento central;
- não usar retrato para simular prova social.

---

## 9. Contrato de geração

### Prompt-base

```text
Use case: photorealistic-natural
Asset type: editorial portrait for social content
Primary request: create a plausible documentary-style portrait of the referenced producer, preserving his identity exactly and placing him in the approved F01 variation.
Input images: A0 references define exact current face, age, hair, beard, skin texture, weight, waist, silhouette and body proportions; HAR references define expression, gesture and posture only.
Subject: Marcos Piccini as himself, current appearance, quiet authority, low performance, natural presence.
Style/medium: authentic editorial photography, visually indistinguishable from a real photograph, not advertising photography.
Composition/framing: follow the selected F01 variation and preserve usable negative space when requested.
Lighting/mood: soft plausible natural light, medium-low contrast, real skin texture, restrained color.
Constraints: exact facial identity; preserve current age, face width, eye shape, hairline, gray hair, beard distribution and body proportions; natural expression from the approved library; coherent lens, light, anatomy and environment.
Avoid: beauty retouching, younger appearance, face or body slimmer or heavier than the A0 current references, historical body transfer, athletic definition, sharpened jaw, denser hair, darker uniform beard, enhanced eye color, plastic skin, celebrity portrait, guru pose, motivational speaker pose, luxury setting, fake event, fake client, fake audience, excessive bokeh, cinematic grading, text, logo, watermark.
```

### Campos variáveis

```yaml
variation: F01-A | F01-B | F01-C | F01-D
expression: E01 | E02 | E03 | E04
wardrobe_id: <approved>
environment_id: <approved>
text_space: left | right | top | bottom | none
output_format: 4:5 | 9:16 | 1:1 | horizontal
campaign_semantics: <dimensions>
```

---

## 10. Rejeição automática

Rejeitar se ocorrer qualquer um dos itens:

- rosto apenas semelhante, mas não reconhecível como o produtor;
- aparência rejuvenescida;
- rosto ou corpo mais magro ou mais pesado que as referências A0;
- cabelo mais cheio ou linha capilar modificada;
- olhos excessivamente claros ou saturados;
- barba uniforme, escura ou desenhada;
- pele plástica;
- sorriso publicitário;
- dentes idealizados;
- fundo de luxo;
- pose de guru ou palestrante motivacional;
- expressão fora da biblioteca aprovada;
- mãos deformadas;
- texto ou logotipo falso no fundo;
- diferença de nitidez entre rosto e corpo;
- luz incompatível entre produtor e ambiente;
- fotografia com aparência evidente de IA.

---

## 11. Validação visual do F01

A primeira prancha deve conter quatro imagens:

1. **F01-A:** presença direta, expressão E01, roupa escura, fundo neutro quente.
2. **F01-B:** olhar fora da câmera, expressão E04, luz de janela, espaço para texto.
3. **F01-C:** sorriso discreto ou espontâneo, expressão E02/E03, ambiente humano discreto.
4. **F01-D:** meio corpo em ambiente realista, expressão E01/E04, amplo espaço negativo.

### O que será avaliado primeiro

1. reconhecimento imediato;
2. idade correta;
3. rosto e volume corporal;
4. cabelo e barba;
5. naturalidade da expressão;
6. plausibilidade fotográfica;
7. diferenciação real entre as quatro variações.

Se a identidade falhar, não se avalia estética, contexto ou composição.

---

## 12. Metadados adicionais do estilo

```yaml
style_id: F01
style_name: presenca_autoral
variation_id: F01-A | F01-B | F01-C | F01-D
expression_id: E01 | E02 | E03 | E04
gaze: camera | off_camera | person_out_of_frame
crop: close | bust | mid_body | environmental
environment_weight: low | medium
authorship_score: 0.0–1.0
intimacy_score: 0.0–1.0
text_space: left | right | top | bottom | none
```

---

## 13. Critério final

> **A imagem aproxima a pessoa da ideia — ou apenas usa o rosto para chamar atenção?**

O F01 só é adequado quando a presença do produtor acrescenta autoria, vínculo ou responsabilidade à mensagem.
