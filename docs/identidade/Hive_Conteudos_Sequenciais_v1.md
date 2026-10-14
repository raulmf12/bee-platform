# Hive — Conteúdos sequenciais

Especificação funcional e orientação técnica · v1.1 · 7 de outubro de 2026

Status: proposta consolidada para implementação pelo Raul. Este documento não representa alterações já aplicadas ao código ou ao banco.

Documento complementar e regra transversal: `Hive_Ajustes_e_Alternativas_de_Pecas_v1.md`. Ele define ações de ajuste, preservação, comparação e versões para toda a Hive. Este documento aplica essas regras às páginas/cenas e ao conjunto. A revisão v1.1 incorpora essa integração, preservando o nome do arquivo e sua identidade.

## 1. Objetivo

Ampliar a Hive para criar, revisar, produzir e organizar peças sequenciais derivadas de conteúdos-mãe aprovados, preservando a arquitetura de campanhas, ciclos, editorias e ACJs.

Uma peça contém uma ou mais páginas/cenas ordenadas. Um conteúdo-mãe pode gerar várias peças para a mesma conta e canal, em diferentes formatos, abordagens e momentos. O pensamento aprovado continua independente do canal e reutilizável após uma primeira publicação.

## 2. Base observada no repositório

Referência: `raulmf12/bee-platform`, branch `main`, árvore consultada em 07/10/2026, commit `3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7`. Leitura dirigida de arquivos; não foi executada a aplicação nem consultado o banco em produção.

| Arquivo | Evidência e consequência |
| --- | --- |
| `src/types/index.ts` | Já declara os formatos image/carousel/reel/story, arrays de canvas e mapas de slides renderizados. Aproveitar essa base, com contrato explícito de sequência. |
| `src/types/campaign.ts` | Conteúdo-mãe em `Content`; canais em `IdeaChannel` contêm plataforma e conta. Acrescentar planejamento de peças para permitir formatos e abordagens distintos. |
| `src/lib/campaign/produce.ts` | `createUnfold` cria `format: 'image'`; `renderPiece` grava somente um slide; `productionTodo` verifica conclusão por conteúdo, conta e plataforma. Ampliar os três pontos. |
| `src/components/production/DevelopStep.tsx` | A validação do pensamento precede os desdobramentos. Preservar essa sequência. |
| `src/lib/templates/renderPost.ts` | Renderização de um canvas reutilizável para cada página. |
| `supabase/functions/_shared/publish.ts` | Publicação de peças de imagem utiliza `rendered_slides.slide1`; vídeo tem caminho específico. Criar roteamento explícito por formato. |

## 3. Escopo e etapas

| Etapa | Entrega |
| --- | --- |
| A — criação e exportação | Carrossel Instagram de imagens; carrossel LinkedIn em PDF; roteiro, produção, revisão e exportação completos. |
| B — Stories e distribuição | Sequências de Stories Instagram; programação do conjunto; integração de publicação por formato conforme permissões da conta e capacidades verificadas da API. |
| C — evolução | Vídeo/Reels, mídias combinadas, interações, séries, variantes e aprendizagem de desempenho. |

A etapa A já deve conter os campos e relações estruturais necessários às demais. Um recurso previsto não deve aparecer na interface como disponível antes de estar implementado. Exportação manual é uma saída funcional para formatos cuja publicação automática ainda não esteja pronta.

## 4. Modelo funcional

| Objeto | Responsabilidade |
| --- | --- |
| Conteúdo-mãe | Linha de pensamento aprovada, origem, intenção, editoria, função estratégica e contrato ACJ. |
| Peça | Conta, canal, formato, abordagem, legenda, arquitetura narrativa e vínculo com a versão do conteúdo-mãe utilizada. |
| Roteiro | Percurso completo da peça, quantidade de unidades, progressão e encerramento. |
| Página/cena | Unidade com ID estável, posição, função narrativa, texto, direção visual e mídia. |
| Publicação | Ocorrência de distribuição da versão aprovada da peça, com destino, data, resultados e estado de execução. |

IDs de páginas permanecem estáveis quando a ordem muda. Posição e identidade são campos distintos. A agenda mostra uma peça; Stories também têm registros de publicação por unidade para preservar ordem e retomar falhas.

## 5. Planejamento de desdobramentos

Após aprovar o conteúdo-mãe, a Hive recomenda peças e explica brevemente o propósito de cada uma. O autor pode aceitar, alterar, remover ou acrescentar desdobramentos.

Cada item de planejamento precisa de ID próprio, conteúdo de origem, conta, canal, formato, abordagem e situação de produção. O ID é a referência para retomada e prevenção de duplicatas. Formato sozinho não basta: podem existir dois carrosséis legítimos para a mesma conta, com abordagens diferentes.

Exemplo: um conteúdo aprovado gera imagem única LinkedIn, carrossel LinkedIn, carrossel Instagram e Stories Instagram. Aprovar a imagem única não encerra os demais desdobramentos.

## 6. Arquiteturas narrativas iniciais

| Arquitetura | Progressão sugerida |
| --- | --- |
| História e aprendizagem | Situação → acontecimento → descoberta → significado. |
| Mudança de perspectiva | Visão habitual → limite → outra leitura → implicação. |
| Exploração de conceito | Questão → camadas → exemplo → síntese. |
| Caso e leitura sistêmica | Contexto → sinais → dinâmica → aprendizagem. |
| Experimentação | Situação reconhecível → proposta prática → observação → reflexão. |

São percursos adaptáveis, sem quantidade fixa de páginas. A ACJ orienta a conexão desejada; a arquitetura narrativa organiza o desenvolvimento; o sistema visual compõe sua apresentação.

A recomendação considera intenção, ACJ, editoria, densidade do pensamento e canal. Encerramentos podem ser síntese, pergunta, prática, continuação ou convite. Convite comercial depende da intenção da peça/campanha; não é padrão obrigatório.

## 7. Fluxo e telas

1. **Conteúdo-mãe aprovado:** manter a forma atual de validação do pensamento. Em um ciclo, concluir essa validação antes de multiplicar os conteúdos.
2. **Plano de peças:** cards por desdobramento com conta, canal, formato, abordagem e vínculo com a origem. Produzir uma recomendação inicial; alternativas surgem sob solicitação.
3. **Roteiro da sequência:** mostrar todas as páginas em ordem, com função narrativa e texto. Editar, inserir, remover, reordenar ou pedir ajuste à Hive. Exibir também a legenda da peça.
4. **Direção visual:** apresentar a proposta de conjunto antes de renderizar as páginas. Aproveitar os recursos visuais e fotográficos existentes conforme compatibilidade com sequências.
5. **Produção e revisão:** visão de conjunto e navegação página a página. Mostrar progresso, falhas e itens que exigem revisão. Oferecer Ajustar texto, Trocar imagem, Trocar template, Explorar visual e Outra abordagem, conforme o estado da peça. Definir alcance: página atual, páginas selecionadas, sequência inteira ou legenda. Comparar atual e proposta antes de aplicar, conforme o documento transversal.
6. **Aprovação:** liberar a versão completa somente quando todas as unidades e a legenda aplicável estiverem prontas e aprovadas.
7. **Exportação e agenda:** exportar na ordem aprovada e registrar uma entrada para a peça. Indicar claramente publicação automática ou conclusão manual.

## 8. Contrato do roteiro e da produção visual

Cada unidade registra: ID, posição, função narrativa, título/texto, direção visual, tipo de mídia, recursos utilizados, estado de revisão e versões de texto/visual.

O roteiro preserva o sentido do conteúdo aprovado e cria progressão. Cada página acrescenta algo ao percurso. Não basta repartir o texto em blocos iguais. A revisão considera abertura, continuidade, redundâncias, legibilidade e encerramento.

O conjunto compartilha direção visual: tipografia, cores, assinatura, ritmo e regras de uso de fotografia. As páginas podem variar a composição conforme sua função. Gerar fotografias apenas quando contribuírem para o significado.

Guardar desde já, como campos opcionais: duração, narração, legendas de vídeo, áudio, transição, texto alternativo e interação planejada. Não exigir esses campos em peças estáticas.

## 9. Aprovação, versões e retomada

- As mudanças são propostas sobre uma versão-base e só alteram a peça ativa ao aplicar. Ajustes criam versões da mesma peça; outra abordagem cria alternativa de roteiro vinculada ao conteúdo-mãe, conforme o documento transversal.
- Texto de página alterado: invalidar o visual derivado daquela página e marcar o roteiro para revisão de coerência; preservar imagem, direção visual, arquivos e aprovações não afetados. Reacomodar o texto não autoriza gerar outra imagem.
- Troca de imagem: preservar texto exato, template, ordem e páginas não selecionadas; revisar apenas o novo recurso e visual afetado.
- Troca de template: preservar texto e recursos atuais; incompatibilidades exigem proposta explícita de adaptação. Explorar visual mantém texto e imagens por padrão.
- Alteração apenas da legenda: invalidar sua aprovação e a aprovação final da nova versão, sem regenerar as páginas.
- Mudança de ordem: revisar a sequência; regenerar apenas páginas com elementos dependentes de posição, como numeração.
- Mudança de direção visual global: invalidar os visuais afetados e preservar o roteiro aprovado.
- Falha de geração: retomar somente unidades pendentes ou com erro.
- Aprovação final: vincular a uma versão concreta do roteiro, dos visuais e da legenda.
- Peça agendada: preservar o pacote aprovado. Uma edição posterior não substitui silenciosamente o que está programado.
- Conteúdo-mãe alterado: sinalizar peças derivadas potencialmente desatualizadas, sem sobrescrevê-las automaticamente.

Separar estados do roteiro, dos visuais e da publicação. Uma peça exportável pode ter publicação automática indisponível.

Qualquer mudança aplicada invalida a aprovação final da nova versão, mantendo aprovações de componentes idênticos. Prévia, exportação e publicação devem corresponder ao mesmo pacote. Regras comuns de comparação, concorrência e preservação são definidas no documento transversal.

## 10. Preparação para evolução

| Capacidade | Previsão no modelo |
| --- | --- |
| Mídias combinadas | Tipo e recursos por unidade; exportação/publicação validam compatibilidade com o destino. |
| Vídeo e Reels | Duração, áudio, narração, legendas e transições por cena; renderizador de vídeo entra depois. |
| Relações entre peças | Relações tipadas: apresenta, aprofunda, continua, deriva e variante; podem atravessar conteúdos-mãe. |
| Séries | ID da série, episódio e ordem opcional. Série agrupa publicações ao longo do tempo; sequência organiza unidades dentro de uma peça. |
| Variantes | Grupo de experimento, hipótese e diferença registrada: capa, abertura, encerramento ou outra dimensão. |
| Interações | Tipo, conteúdo e destino; execução automática ou manual indicada por capacidade real. |
| Aprendizagem | Resultados vinculados à publicação, versão, arquitetura, ACJ, formato e conta. Registrar disponibilidade e origem das métricas; não supor métricas por página onde não forem fornecidas. |

Preservar as hipóteses e recomendações da ACJ-00. Comparações de desempenho devem registrar contexto e não tratar pequenas amostras como prova de causalidade.

## 11. Orientação técnica de integração

Manter `contents` como origem intelectual e `user_posts` como peça. Recomenda-se acrescentar unidades com IDs estáveis em tabela relacionada à peça (nome sugerido: `post_units`) e plano de peças identificado (nome sugerido: `content_piece_plans`). Raul deve validar os nomes e a estratégia de migrations contra o schema efetivo.

As unidades devem guardar roteiro e estado próprios; os arrays/mapas atuais de canvas e slides podem continuar como projeções de compatibilidade. Declarar uma fonte canônica para evitar divergência entre unidades e mapas legados. Imagem única permanece funcional como peça de uma unidade.

Acrescentar ao pipeline geração estruturada do roteiro, revisão e aprovação antes da geração visual. A saída da IA deve ser validada contra um schema; rejeitar unidades sem texto/mídia aplicável, IDs duplicados e posições inválidas. Manter o vínculo com o conteúdo-mãe e o contrato ACJ.

Integrar as operações de página/cena ao serviço comum descrito em `Hive_Ajustes_e_Alternativas_de_Pecas_v1.md`. Passar ação, versão-base, IDs estáveis das unidades, campos mutáveis e componentes preservados. Candidatos não sobrescrevem recursos ativos nem criam novas entradas de agenda. Validar preservação efetiva no servidor, além das instruções à IA.

Separar exportadores: imagens ordenadas, PDF e, depois, vídeo. Regras de proporção, limites e capacidades ficam em configuração por plataforma/formato, com versão e data de verificação. Não fixar no modelo limites que podem mudar.

O publicador deve selecionar o caminho por formato e conferir todas as unidades. Se um formato ainda não for suportado, interromper explicitamente e oferecer o pacote manual; nunca publicar somente a primeira página de uma sequência.

Publicação e retomada precisam de identificação por versão e destino. Para Stories, registrar resultado por unidade, respeitar ordem e recuperar falhas sem repetir unidades já publicadas. Estados e IDs externos da publicação devem permanecer separados dos arquivos gerados.

Migrar sem alterar peças já aprovadas/publicadas. Aplicar autorização por proprietário às novas tabelas e testar a integração com os controles existentes antes de liberar.

## 12. Critérios de aceite

1. Um conteúdo-mãe gera imagem única e carrossel na mesma conta LinkedIn, além de peças Instagram, sem omissão nem duplicação ao retomar o ciclo.
2. O roteiro pode ser aprovado antes da produção visual; sua progressão e origem permanecem registradas.
3. Reordenar páginas preserva IDs e recursos associados. Exportação e prévia seguem a nova ordem.
4. Editar uma página invalida o visual afetado e pede revisão de coerência, preservando as demais páginas.
5. Uma falha na geração de uma página permite retomada sem gerar novamente as páginas concluídas.
6. PDF LinkedIn e imagens Instagram correspondem à mesma versão aprovada, com sequência completa e sem cortes ou texto transbordando.
7. Peças incompletas não são aprovadas nem publicadas. Formato sem integração não cai no caminho de imagem única.
8. Peças de imagem única existentes continuam funcionando.
9. Uma alteração após agendamento exige atualização explícita do pacote programado.
10. Na etapa Stories, uma falha parcial registra o que foi publicado e permite retomada ordenada sem repetir unidades concluídas.
11. Trocar imagem da capa mantém seus textos e template, além das demais páginas; comparar e descartar preservam o pacote ativo.
12. Trocar template ou explorar visual mantém o roteiro e recursos preservados; adaptações extras são apresentadas explicitamente.
13. Operações em páginas selecionadas alteram somente seus IDs e componentes autorizados; a aprovação final refere-se à nova versão completa.

## 13. Exemplo de experiência

Conteúdo-mãe aprovado: “Quando o líder resolve tudo, o time aprende a esperar”.

Plano possível: imagem única LinkedIn; carrossel LinkedIn explorando a dinâmica organizacional; carrossel Instagram sobre a experiência de quem assume tudo; Stories Instagram com reflexão e pergunta planejada.

Roteiro ilustrativo do carrossel LinkedIn: situação observável → comportamento recorrente → efeito no time → ciclo que se reforça → outra possibilidade de atuação → síntese. A Hive recomenda o número de páginas necessário e o autor ajusta.

O exemplo serve para verificar o fluxo; não é conteúdo final aprovado nem determina automaticamente uma ACJ.

## 14. Referências

- Regra comum de ajustes: `Hive_Ajustes_e_Alternativas_de_Pecas_v1.md`.
- Repositório: https://github.com/raulmf12/bee-platform
- Produção: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/lib/campaign/produce.ts
- Tipos: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/types/index.ts
- Campanhas: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/src/types/campaign.ts
- Publicação: https://github.com/raulmf12/bee-platform/blob/3304ed85e5f2f9c804e7709a45e9a14a2eb4b9a7/supabase/functions/_shared/publish.ts
- Documentação Meta a verificar durante integração: https://developers.facebook.com/documentation/instagram-platform/content-publishing
- Documentação LinkedIn a verificar durante integração: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api

As modalidades de publicação, permissões e limites deverão ser verificados por formato no momento da implementação. A especificação não pressupõe que exportar e publicar automaticamente tenham as mesmas capacidades.
