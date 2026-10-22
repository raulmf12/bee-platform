# Consistência entre editor, aprovação e agenda — entrega reconstruída

**Estado:** rascunho para revisão do Raul. Não liberar em produção antes da regressão completa.
**Base:** `7b45df712e76f955a7f5c22c3ace4eb393c73393`.
**Branch:** `codex/correcao-consistencia-editor-2026-10-21`.

## Origem e limites desta entrega

Marcos relatou que a peça BEE-170826-G7-D2-V2 mostrava texto e imagem novos no editor, mas antigos na agenda. Retirou a peça da programação. O problema motivou a correção da consistência entre edição, renderização, aprovação e preparação do pacote.

O checkout e os artefatos da tentativa anterior deixaram de estar disponíveis. O commit local anterior `65df70c1a39a279ee8860debf80ae9dee70e3e46` não foi localizado no GitHub, e o patch/bundle não foi encontrado nas cópias acessíveis. Esta entrega foi **reconstruída** sobre a mesma base usando os registros técnicos preservados na conversa. Não é uma recuperação byte a byte daquele commit. Os resultados históricos de testes não certificam esta reconstrução.

Marcos solicitou, a pedido do Raul, o envio em nova branch e PR. A exceção à regra de regressão antes de push se limita a esta entrega em rascunho para revisão: não autoriza merge, deploy nem publicação social. Não houve consulta ou alteração de dados reais, migration, deploy de função ou mudança em main.

## Nota para o Marcos — ajustes propostos neste pacote

1. **Salvar a arte que está na tela no momento do clique.** A captura passa a consultar o canvas diretamente, sem esperar a atualização atrasada da prévia. Isso atende ao caso de editar e imediatamente salvar, aprovar ou agendar.
2. **Manter a frase da arte ligada à frase do conteúdo.** Quando há um único campo de frase identificado, o texto entra também no registro usado para fechar o pacote de publicação. Textos decorativos não são interpretados como frase principal.
3. **Preservar os demais textos.** A sincronização da frase mantém os outros campos; ao editar a legenda, a cópia em `carousel_text.caption` acompanha o campo principal.
4. **Executar salvamentos e aprovações em ordem.** Autosave, salvamento manual, preparação da imagem, aprovação, agendamento, preparação de publicação e salvar ao sair compartilham uma fila no editor. Uma falha não impede novas tentativas.
5. **Evitar salvamentos atrasados que desfazem aprovação sem edição nova.** Antes de gravar, o editor compara os valores vivos com o estado atualizado da peça. Conteúdo idêntico não é regravado por esses salvamentos.
6. **Diferenciar edição de simples mudança na ordem de campos internos.** A assinatura compara o conteúdo JSON ignorando a ordem das chaves, mas respeitando a ordem das camadas e os textos.
7. **Preservar uma imagem aprovada ao reabrir uma peça sem alterações.** Havendo aprovação visual e canvas igual ao persistido, o editor reutiliza a imagem aprovada. Isso não certifica nem corrige retroativamente um arquivo antigo inconsistente.
8. **Dar endereço próprio a cada nova imagem final.** Renderizações do editor, criação de posts, motor visual e unidades sequenciais passam a usar nomes únicos, sem sobrescrever arquivos anteriores. O comportamento padrão de outros uploads permanece igual.
9. **Recusar uma captura ainda não carregada ou vazia.** A captura espera a hidratação do canvas; uma arte vazia não sobrescreve uma arte persistida. Falhas são mostradas ao usuário.
10. **Detectar edição durante a preparação.** Se a arte mudar durante o upload, o arquivo novo não é associado à peça. Antes de aprovar/agendar ou publicar uma peça sem data, são conferidos os valores persistidos e os que continuam na tela.
11. **Usar o estado mais recente ao agendar.** O editor relê o store após salvar/renderizar para decidir se a aprovação é necessária. Os contratos existentes `approve_piece`, `schedule-piece` e publicação permanecem em uso.
12. **Proteger a troca de peça.** Operações que ainda aguardam na fila são recusadas se o usuário já abriu outra peça. Isso não cancela uma requisição que já foi enviada.
13. **Facilitar testes no Linux.** Helpers administrativos aceitam `SUPABASE_ACCESS_TOKEN`; o keychain continua disponível no macOS. Só valores com prefixo `go-keyring-base64:` são decodificados. Não há credencial no código.
14. **Parar após recusa de acesso administrativo.** HTTP 403 bloqueia novas chamadas da mesma instância do helper, sem trocar chave ou rota. Erros administrativos não incluem corpo de resposta nem token.
15. **Permitir navegador fornecido pelo ambiente.** `E2E_CHROMIUM_EXECUTABLE_PATH` é opcional. O script de regressão evita que a busca por outro Playwright encontre o próprio comando `pgrep`.
16. **Adicionar verificações direcionadas.** Há testes puros da frase, assinatura, caminho imutável, fila e acesso administrativo; o F24 inclui o percurso editar → salvar imediatamente → aprovar → reabrir → agendar → conferir textos e hash do arquivo no pacote.

## Validação desta reconstrução

- `npm run build`: passou (TypeScript e Vite). Avisos de tamanho de chunks e base Browserslist antiga, sem falha de compilação.
- `npx playwright test --config=playwright.unit.config.ts`: **15/15 passaram**. Não usa navegador, login ou Supabase.
- `bash -n scripts/sql.sh scripts/regressao.sh`: verificação sintática dos scripts.
- `git diff --check`: sem erros de whitespace.
- F24: preparado para execução; coleta/listagem não equivale a teste aprovado.
- Download oficial `npx playwright install chromium --only-shell`: falhou, arquivo recebido inválido/truncado. Nenhuma evidência de teste de navegador nesta reconstrução.
- Regressão completa: **pendente**. Nenhuma nova tentativa de acesso ao Supabase foi feita; o bloqueio 403 relatado anteriormente não foi contornado.

## Checklist do Raul antes do merge

1. Revisar o diff reconstruído, principalmente `PostEditor.tsx` e o uso de captura síncrona no `CanvasStudio`.
2. Configurar credenciais exclusivamente locais do usuário E2E isolado e confirmar que o acesso administrativo foi restabelecido por via autorizada. Em 403, parar.
3. Instalar Chromium compatível com o Playwright, ou definir explicitamente o executável a testar.
4. Rodar `scripts/regressao.sh e2e/f24-aprovacao-agenda-e3.spec.ts`, incluindo o novo caso de edição imediata; conferir título, legenda, frase, render e pacote.
5. Rodar a regressão completa, uma suíte por vez, sem editar `src/` durante a execução. Não publicar nas contas reais.
6. Conferir especialmente: peça reaberta sem edição; mudança de legenda apenas; edição durante upload; agendada com alterações fora do pacote; falha de upload; canvas carregando; slots ambíguos; sequências e geração visual.
7. Somente após aprovação técnica e regressão verde, considerar merge/deploy pelo processo habitual.

## Limites e riscos explícitos

- Não corrige automaticamente peças ou pacotes antigos; a peça citada precisa ser conferida após a liberação.
- A fila é local à instância do editor; não oferece exclusão entre abas ou usuários. Operações de IA/fundo e comandos de outros componentes continuam dependendo dos contratos existentes.
- Uma requisição já em andamento não é cancelada ao trocar de rota. A checagem local antes de aprovar/agendar não é uma transação distribuída com a edição em outra aba.
- A hidratação existente do Fabric tolera falhas parciais de imagens. A nova guarda detecta ausência/arte vazia; não certifica que todos os recursos externos foram carregados.
- Arquivo enviado antes de uma edição concorrente ser detectada pode ficar sem referência. Limpeza de órfãos não faz parte deste pacote.
- Nomes únicos aumentam o estoque de arquivos. Não há remoção retroativa nem alteração do contrato de retenção.
- O novo teste E2E ainda pode precisar de ajuste de interação/seletor quando executado; não foi marcado como aprovado.
- Não inclui redesenho de campanhas, editorias, ideias-mãe, contas ou agentes; tampouco reconstrói todos os experimentos de infraestrutura do executor anterior.

## Reversão

Reverter o commit deste PR pelo fluxo normal de revisão. Não há migration a desfazer. Preservar os arquivos com endereço único, pois pacotes podem referenciá-los. Uma reversão do app não deve apagar histórico nem arquivos já associados a publicações.
