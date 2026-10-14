# Hive — Ajustes e alternativas de peças

Especificação transversal · v1.0 · 7 de outubro de 2026

Status: especificação para implementação pelo Raul. Aplicação: peças atuais de imagem única e evolução para carrosséis, Stories e vídeo. Complemento de `Hive_Conteudos_Sequenciais_v1.md` (revisão interna v1.1).

## 1. Resultado desejado

Quando o autor pede uma mudança, a Hive identifica a dimensão e o alcance, altera somente o que foi solicitado e apresenta o resultado antes de substituir a versão atual.

O autor pode gostar do pensamento e desejar outra imagem; gostar da imagem e desejar outra composição; ou querer revisar apenas uma frase. Uma insatisfação parcial não deve provocar recriação integral.

Essa regra deve valer em campanhas, conteúdos avulsos, revisão, editor, chat com a Hive e retomada de peças. O fluxo específico de conteúdos sequenciais aplica a mesma regra por página, grupo ou sequência inteira.

## 2. Diagnóstico e base existente

Relato do Marcos: algumas sugestões alternativas da Hive mudam simultaneamente texto e imagem, quando a mudança desejada pode estar restrita a uma dimensão.

A leitura do código no commit `3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7` mostra uma implementação parcial da separação:

| Arquivo | Base observada |
| --- | --- |
| `src/lib/campaign/produce.ts` | `createAlternatives` possui modos design/image/both e copia frase e legenda da base; `adjustPieceText`, `editPieceText` e `swapPieceImage` separam algumas operações. |
| `src/components/production/ReviewStep.tsx` | A revisão dos ciclos oferece opções de design, imagem e ambos. |
| `src/lib/hive/runVisual.ts` | Há mecanismos de reuso da foto anterior e geração de novo fundo. O reuso precisa ser garantido por identidade do recurso em todos os tipos de imagem. |
| `src/pages/posts/NewPost.tsx` | Possui seu próprio fluxo de geração e revisão. Aplicar nele o mesmo contrato, auditando os caminhos de regeneração. |

O comportamento relatado não foi reproduzido na aplicação. Raul deve identificar o caminho utilizado, conferir a versão implantada e verificar quais rotas deixam de preservar os elementos. O diagnóstico não presume que toda a Hive hoje recrie tudo.

## 3. Ações disponíveis

Substituir pedidos genéricos de “outras opções” por ações com resultado previsível. O número de sugestões deve ser moderado: uma recomendação inicial; mais opções sob pedido.

| Ação | Pode mudar | Deve preservar |
| --- | --- | --- |
| Ajustar texto | Campo ou trecho escolhido; extensão, tom e clareza conforme pedido | Conteúdo-mãe, intenção, ACJ, imagem e direção visual. Reacomodar o texto apenas quando necessário. |
| Trocar imagem | Foto, ilustração, textura ou fundo escolhido | Texto, legenda, estrutura narrativa e template. Recorte/enquadramento pode mudar para acomodar o novo recurso. |
| Trocar template | Layout selecionado e suas regras de composição | Texto exato, legenda, imagem/recurso atual, ordem e função narrativa, quando compatíveis. |
| Explorar outro visual | Composição nova e tratamento visual dentro da identidade Bee | Texto exato, legenda, intenção e recursos atuais por padrão. Trocar imagem exige escolha explícita adicional. |
| Outra abordagem | Desenvolvimento, estrutura argumentativa, abertura e encerramento | Conteúdo-mãe, intenção, conta, canal, formato e ACJ. Visual existente é referência, sujeito à compatibilidade do novo texto. |

“Variar design e imagem” pode continuar como ação combinada explícita. Ela mantém o texto exato e registra as duas dimensões autorizadas. A ação combinada não é padrão oculto de “explorar visual”.

Ajustar texto não autoriza trocar a tese. Se o pedido exigir outra tese ou intenção, apresentar o impacto e oferecer a operação adequada; não alterar silenciosamente o conteúdo-mãe.

## 4. Experiência de uso

Na revisão da peça, oferecer: **Ajustar texto · Trocar imagem · Trocar template · Explorar visual · Outra abordagem**. Mostrar ações aplicáveis ao estado e formato atuais; roteiro textual não precisa oferecer imagem antes de existir visual.

1. Escolher a ação.
2. Definir o alvo e, em sequências, o alcance.
3. Escolher uma opção existente ou informar a mudança desejada.
4. Gerar uma proposta de alteração com a versão atual preservada.
5. Comparar atual e proposta.
6. Aplicar, descartar ou pedir outro ajuste a partir de uma base identificada.

Usar rótulos simples: “Texto mantido”, “Imagem mantida”, “Só a capa foi alterada”. Mostrar também impactos necessários, como nova composição do texto ou revisão da sequência.

O chat deve produzir o mesmo tipo de operação. “Troque só a foto” aciona troca de imagem; “a capa” resolve o ID da primeira unidade. Se “mude isso” não permitir identificar alvo/dimensão, solicitar essa informação antes de gerar. A confirmação é sobre a proposta dentro do produto, não um fluxo adicional de permissão para o projeto.

## 5. Templates e criação visual

**Trocar template:** abrir galeria real de templates ativos, com prévia, nome e compatibilidade com canal, formato e recursos da peça. Não oferecer como disponíveis layouts apenas imaginados pela IA.

Ao selecionar template, mapear os campos mantendo texto e recursos exatos. Se o conteúdo não couber, ajustar a composição dentro das regras. Se continuar incompatível, explicar o motivo e oferecer outro template ou uma adaptação textual separada para revisão. Não truncar nem resumir automaticamente o texto aprovado.

Templates que exigem remover, acrescentar ou substituir uma imagem devem mostrar esse impacto antes de aplicar. Não apresentar o caso como troca de layout que preserva integralmente a imagem.

**Trocar imagem:** permitir selecionar recurso existente ou pedir novo recurso. Aplicar os controles fotográficos e de identidade existentes. Em layout sem imagem, explicar que adicionar imagem também exige mudança de composição e oferecer a ação correspondente.

**Explorar visual:** criar composição fora dos templates atuais, quando esse mecanismo estiver implementado, seguindo identidade Bee, legibilidade e campos editáveis. Se ainda indisponível, indicar isso e manter a galeria funcional. Uma composição aprovada pode ser salva como novo template apenas por escolha explícita do autor.

## 6. Alcance e aplicação às sequências

| Alcance | Aplicação |
| --- | --- |
| Página/cena atual | A unidade selecionada, identificada por ID estável. |
| Páginas/cenas selecionadas | Conjunto explícito de IDs, preservando as demais. |
| Sequência inteira | Todas as unidades da peça, com direção visual coerente quando o pedido for visual. |
| Legenda | Campo de acompanhamento da publicação; preserva as unidades. |

Em “ajustar texto”, permitir selecionar campo/trecho e revisar o roteiro completo quando solicitado. Em “outra abordagem”, propor uma alternativa de roteiro da peça; revisão pontual de uma página pertence a ajuste de texto. Outra abordagem só alcança o conjunto após escolha explícita desse alcance.

Trocar imagem da capa não altera seu texto nem as demais páginas. Mudar template no conjunto usa uma família visual com layouts adequados às funções de abertura, desenvolvimento e encerramento; não repete obrigatoriamente a mesma composição em todas as páginas.

Inserir/remover/reordenar unidades segue as regras do documento de sequenciais. Avaliar coerência, numeração e transições; não regenerar unidades por mera mudança de índice.

## 7. Ajustes, alternativas e versões

Um **ajuste** gera candidato a nova versão da mesma peça. Pode haver vários candidatos visuais em comparação, sem que cada um vire uma nova publicação na agenda.

Uma **outra abordagem** gera alternativa intelectual vinculada ao mesmo conteúdo-mãe, com roteiro, texto e aprovações próprios. Ao escolher, ela ocupa o mesmo desdobramento planejado; manter duas peças para publicação exige escolha explícita de acrescentar um desdobramento.

Uma **variante de experimento** é uma decisão adicional: identifica hipótese e diferença para comparação de desempenho. Não classificar toda revisão como teste de marketing.

Toda proposta aponta para a versão-base. “Pedir outro ajuste” usa a proposta exibida quando isso for escolhido, ou volta à versão atual; a interface deve deixar a base clara. Aplicar uma proposta criada sobre versão antiga exige comparação com a versão atual e resolução do conflito.

Rejeitar candidato mantém a peça ativa e seus arquivos. Aplicar candidato registra diferenças e invalidadores de aprovação. Uma versão restaurada pode reutilizar aprovações somente se os mesmos componentes aprovados permanecerem idênticos; restaurar não altera publicação agendada automaticamente.

## 8. Aprovação e preservação

| Mudança aplicada | Revisão necessária |
| --- | --- |
| Texto de uma página | Texto afetado, visual recomposto e coerência da sequência. |
| Legenda | Legenda e aprovação final da nova versão; imagens permanecem aprovadas. |
| Imagem | Recurso novo e visual afetado; texto permanece aprovado. |
| Template/composição | Visual das unidades afetadas; texto e recursos preservados mantêm suas aprovações. |
| Outra abordagem | Novo texto/roteiro e visuais derivados; contrato do conteúdo-mãe permanece como referência. |

A aprovação final se refere a um pacote concreto de componentes. Alterar qualquer componente invalida a aprovação final da nova versão, mantendo aprovações dos componentes idênticos. Não aprovar automaticamente uma nova imagem de IA só porque a imagem anterior tinha aprovação.

Prévia, exportação e publicação usam o mesmo pacote aplicado e aprovado. Agendamentos preservam a versão programada; publicar uma revisão requer atualização explícita. Peças publicadas conservam seu histórico; revisão posterior não modifica retroativamente resultados nem conteúdo publicado.

## 9. Contrato técnico comum

Centralizar as operações em um serviço comum usado por telas e chat. Reutilizar funções existentes por meio de adaptadores; evitar uma implementação de preservação diferente para cada tela.

Contrato sugerido de operação:

| Campo | Finalidade |
| --- | --- |
| `operation_id` | Identidade para retomada e prevenção de duplicação. |
| `piece_id`, `base_version_id` | Peça e versão exatas usadas como base. |
| `action`, `mutable_paths` | Ação e lista de campos autorizados a mudar. |
| `scope`, `unit_ids`, `field_paths` | Alcance, unidades e campos/trechos alvo. |
| `instruction`, `selected_template_id`, `selected_asset_id` | Pedido e escolhas explícitas, quando aplicáveis. |
| `preserved_snapshot` | Referências e valores dos componentes que devem ser preservados. |
| `candidate_id`, `diff`, `affected_components` | Proposta, diferenças efetivas e impacto de revisão. |
| `status` | Situação da operação/proposta, independente da publicação. |

Os nomes são sugestões, a ajustar ao schema efetivo. O servidor valida acesso à peça, versão-base e IDs de unidades antes de executar.

Preservação de texto em operação visual significa igualdade exata dos valores, não equivalência de sentido. Preservação de imagem significa mesmo ID/recurso original; recorte e posição são parâmetros de composição registrados à parte.

Não delegar preservação apenas ao prompt: carregar componentes congelados, pedir saída estruturada limitada aos campos mutáveis, validar diferenças e rejeitar alterações fora do contrato. Renderização recompõe o necessário a partir dos recursos preservados, sem nova geração textual/fotográfica implícita.

Guardar candidatos e recursos em caminhos distintos dos ativos. Não sobrescrever o arquivo atual durante a prévia. Aplicar o candidato atualiza atomicamente a versão ativa após checagem da versão-base. Falhas deixam a versão ativa íntegra e podem retomar unidades pendentes.

Adaptação dos campos atuais: `alternative_group`, `alternative_rank`, `metadata.alt_of` e `metadata.alt_mode` podem servir à compatibilidade. Porém, ajuste visual não deve criar automaticamente um novo item de agenda ou arquivar a peça original. Preservar os vínculos de aprendizagem e a versão-base, sem comparar candidatos visuais como se fossem novos textos da IA.

Verificar em especial o reuso de fundos/fotos em todos os templates, inclusive quando a composição muda. A existência de `previousDecision` não comprova preservação de todos os recursos. Também verificar mudanças de template ignoradas por defaults de canal.

## 10. Implementação sugerida

1. Auditar os caminhos de geração/revisão contra o comportamento relatado, incluindo campanhas e criação avulsa.
2. Implementar contrato comum, candidatos, validação de preservação e aplicação controlada.
3. Padronizar ações e comparação em peças de imagem única, usando galeria existente e troca de imagem.
4. Aplicar o mesmo contrato às unidades dos conteúdos sequenciais, integrado ao documento complementar.
5. Implementar exploração visual fora dos templates e recursos de vídeo conforme disponibilidade dos renderizadores.

A regra comum é a primeira entrega. Não bloquear a correção das peças atuais pela implementação completa de carrosséis ou criação livre de layouts.

## 11. Critérios de aceite

1. “Trocar só a imagem” mantém texto e legenda exatos, template e estrutura; cria proposta sem sobrescrever a versão atual.
2. “Trocar template” mantém texto exato e ID do recurso; incompatibilidade é apresentada antes de uma adaptação adicional.
3. “Encurtar a legenda” não gera novas imagens nem muda a frase da peça.
4. “Ajustar a frase” não gera nova fotografia; recomposição mantém o recurso e a direção visual.
5. Na sequência, trocar imagem da capa altera somente o recurso da unidade alvo e os componentes visuais relacionados, preservando seu ID.
6. Uma direção visual global mantém roteiro e ordem; modifica apenas os componentes previstos.
7. Comparar/descartar propostas deixa a peça ativa íntegra; aplicar cria nova versão com diferenças verificáveis.
8. Outra abordagem cria alternativa vinculada à origem; não muda conteúdo-mãe nem gera publicação adicional automaticamente.
9. Resposta da IA com alteração de campo preservado é rejeitada antes de aplicar.
10. Aplicar candidato de versão-base antiga detecta conflito, sem sobrescrever edição mais recente.
11. Uma falha de geração mantém os componentes ativos e permite retomada; pedidos repetidos com mesmo ID não duplicam propostas aplicadas.
12. Editar uma peça agendada não altera o pacote programado sem ação explícita; métricas de publicações antigas continuam vinculadas à versão publicada.
13. Campanhas, criação avulsa, editor e chat produzem o mesmo resultado para a mesma ação/alcance.
14. Nova imagem ou novo visual requer revisão correspondente; aprovações de componentes idênticos são preservadas.

## 12. Exemplo de experiência

O autor aprova o texto de um carrossel de seis páginas, mas não gosta da foto da capa.

Seleciona **Trocar imagem → Página atual → Escolher imagem existente ou gerar outra**. A Hive produz a nova capa, mostra atual e proposta lado a lado e sinaliza: “Texto, template e outras cinco páginas mantidos”. Ao aplicar, registra nova versão, preserva o texto aprovado e pede revisão visual da capa e aprovação final do pacote.

Se depois pedir outro template para a sequência, a Hive usa os mesmos textos e recursos, propõe composição coerente nas seis páginas e mantém a versão anterior até a escolha. Nenhuma dessas ações pede nova argumentação à IA.

## 13. Referências e divisão dos documentos

Este documento é a fonte comum para ações, preservação, comparação, versões e aprovação por componente. `Hive_Conteudos_Sequenciais_v1.md`, revisão interna v1.1, define roteiro, unidades, ordem, produção e publicação do conjunto. Raul deve tratá-los como evolução integrada.

- Repositório: https://github.com/raulmf12/bee-platform
- Operações existentes: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/lib/campaign/produce.ts
- Revisão dos ciclos: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/components/production/ReviewStep.tsx
- Geração visual: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/lib/hive/runVisual.ts
- Criação de posts: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/pages/posts/NewPost.tsx
