# Hive — Resumo do que foi implementado (Fases 1 a 6)

Base: documentos 00 (Identidade, Setup e Recalibração), 01 (Ajustes e Alternativas de Peças) e 02 (Conteúdos Sequenciais).
Detalhes técnicos em `FASE1.md`, `FASE2-3.md`, `FASE4.md` e `FASE5-6.md`.

---

## Fase 1 — Fundação de contexto (identidade e perfis)
- Modelo de identidade: **workspace → marca → quem fala (emissor) → frente de atuação → público → perfil de comunicação**.
- Bee configurada com dois emissores (Marcos e voz institucional Bee Consulting) e duas frentes (Academy e Consulting).
- Três perfis iniciais: Academy · Marcos (padrão), Consulting · Marcos e Consulting · Institucional (rascunho).
- **Público separado de estado do interlocutor**: "transformadores/líderes" são públicos; "identificado/incomodado" é lente opcional.
- **Resolvedor de contexto único**: geração, pauta, desenvolvimento, QA, edição, chat, personas e visual usam o mesmo contexto.
- **Snapshot de contexto** gravado em cada criação; a peça herda o do conteúdo-mãe e o QA avalia com o mesmo.
- Removidos os textos fixos "Marcos/Bee Academy/líder" dos caminhos genéricos.
- Lições e diretrizes com **escopo de frente/emissor/perfil** (uma lição da Consulting não vale para a Academy).
- Seletor de perfil na nova campanha e no detalhe da campanha; linha "Contexto: quem fala · frente · público" na validação.
- Posts importados marcados como **histórico** (não viram referência de voz automaticamente).

## Fase 2 — Ajustes e alternativas de peças
- Toda mudança numa peça vira **proposta**: comparação **atual × proposta** e só muda ao clicar em **Aplicar**.
- Ações: **Ajustar texto** (frase ou legenda, pedindo à Hive ou editando), **Trocar imagem**, **Trocar template**, **Outra abordagem**.
- **Preservação garantida no banco**: trocar imagem mantém o texto exato; trocar template mantém texto e imagem compatível; ajustar legenda não refaz a imagem.
- Aviso de impacto antes de trocar para um template incompatível com a imagem atual.
- **Conflito de versão**: proposta feita sobre uma versão antiga não sobrescreve a atual.
- Aprovações afetadas são desfeitas só no que mudou.
- **Versões da peça** guardadas a cada aplicação (histórico).
- Peça agendada fica **presa à versão programada**; mudança posterior exige "Atualizar agendamento".
- "Gerar outra foto" do Marcos virou proposta de troca de imagem.
- Correção: ajustar a frase não troca mais o fundo da imagem.

## Fase 3 — Minha identidade
- Nova entrada **Base Hive › Minha identidade** com visão atual: marca, Genesis (herdado), perfis com versão, emissores, frentes, públicos, fontes e "o que falta revisar".
- Entradas: **Configurar minha identidade**, **Revisar identidade e frentes**, **Adicionar frente**, **Recalibrar** (por perfil) e **Continuar configuração**.
- Percurso guiado e **retomável**: O que mudou → Conversa guiada (uma pergunta por vez, com o porquê) → Materiais (referência atual × histórico) → O que a Hive entendeu → Perfis → Editorias → Calibração → Ativar → Pronto.
- Sessão inaugural da Bee abre com as **5 perguntas do Guia**.
- Propostas por bloco com **origem marcada**: declarado, evidência, hipótese ou mantido; edição direta, aceitar ou pedir ajuste.
- **Calibração com o perfil em rascunho**: gera amostras sem ativar nada; feedback vira lição com escopo do perfil.
- **Ativação explícita** cria nova versão de cada perfil afetado e mostra impactos.
- Alcance da adoção: "só novas criações" mantém as campanhas em andamento na versão anterior.
- **Recalibrar um perfil não altera os outros** (o que é compartilhado é copiado).
- Página do perfil com **histórico de versões**.
- Criação avulsa e nova campanha escolhem o perfil.

## Fase 4 — Carrossel (conteúdos sequenciais, etapa A)
- **Plano de peças** por conteúdo-mãe: conta, canal, formato, abordagem e propósito; sugestões da Hive, acrescentar e remover.
- Imagem única e carrossel na **mesma conta** sem duplicar ao retomar a produção.
- **Roteiro** gerado pela Hive com arquitetura narrativa (história, perspectiva, conceito, caso, experimentação) e progressão real.
- Editar, inserir, remover e reordenar páginas; pedir ajuste; revisar coerência; legenda; **aprovar roteiro antes do visual**.
- **Direção visual do conjunto** (fundo, template da capa, numeração, assinatura) antes de produzir.
- Produção **página a página** com progresso; falha numa página não refaz as prontas ("Produzir pendentes").
- Texto que não cabe na página **não é cortado**: a página falha com motivo claro.
- Ajustes por **página, seleção, sequência inteira ou legenda**, sempre com comparação; trocar imagem da capa; trocar template/direção.
- Página editada invalida **só o próprio visual**; reordenar preserva os IDs das páginas.
- **Aprovação final só com a sequência completa** (todas as páginas prontas e aprovadas + legenda).
- **Exportação** da versão aprovada: PDF (LinkedIn) e ZIP de imagens (Instagram).
- Conteúdo-mãe alterado sinaliza as peças derivadas sem sobrescrever.

## Fase 5 — Stories e publicação por formato
- **Stories no Instagram**: telas verticais 9:16, sem legenda, uma ideia por tela; interação planejada (pergunta/enquete) para colocar à mão.
- **Publicação automática**: carrossel no Instagram, carrossel no LinkedIn como documento PDF e Stories em ordem.
- Publica sempre o **pacote aprovado/programado** — nunca só a primeira página.
- **Verificar antes de publicar**: confere pacote, quantidade de páginas, arquivos e credenciais sem publicar nada.
- **Registro de publicação** por versão e destino; Stories com resultado por tela e **retomada sem repetir** as já publicadas.
- O agendador publica sozinho os formatos com publicação automática.
- Agenda mostra uma entrada por peça (Carrossel / Stories).

## Fase 6 — Isolamento entre clientes
- Cada marca **só vê e altera os próprios dados**: identidade, metodologia (Genesis, editorias, diretrizes, exemplos), sistema visual, fotos, ACJ e Alma.
- Busca na base de conhecimento (RAG) restrita à marca do usuário.
- Funções da Hive filtram por marca; cliente sem marca recebe **padrões neutros**, nunca dados da Bee.
- **Brechas fechadas**: publicar a peça de outro usuário; publicar com a conta social de outro usuário; apontar sessão/campanha para marca ou perfil de outro cliente.
- **Cliente novo** cria o próprio espaço e marca em "Minha identidade" e começa uma configuração neutra, sem herdar nada da Bee.
- Testado com um segundo usuário real (criado e removido pelo teste).

---

## Qualidade
- Testes automatizados novos por fase (f15 a f20); regressão final com 142 de 143 testes (o restante passa isolado).
- Todas as migrações têm rollback; funções publicadas no Supabase; app publicado via Netlify.

## Pendências
- Acompanhar a **primeira publicação real** de cada formato novo (carrossel IG, documento no LinkedIn, Stories).
- Definir como um **cliente novo monta o próprio sistema visual** (hoje a imagem fica bloqueada com aviso, sem usar o visual da Bee).
- Decisões de curadoria do Marcos dentro de "Minha identidade": núcleo dos transformadores, interlocutores da Consulting, uso da voz institucional e editorias.
