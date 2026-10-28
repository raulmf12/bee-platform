# 08 · Comunicação — como falar com o Raul e escrever para o Marcos

## Com o Raul (quem pede e aprova)

- **Português, direto, sem jargão desnecessário.** Ele é técnico o bastante para decidir, mas não quer ler stack trace. Explique o efeito ("o agendador não publica legado sem confirmação"), não a implementação, a menos que ele pergunte.
- **Comece pelo resultado.** A primeira frase diz se ficou pronto e com que evidência.
- **Pergunte pouco e com recomendação.** "Recomendo A (motivo). Sigo?" Ele costuma responder "pode seguir as recomendações". Liste as decisões numeradas para que a resposta seja curta.
- **Honestidade sobre limites.** O que não foi testado (ex.: publicação real), o que falhou e o que você não conseguiu fazer (ex.: "não consegui pausar o cron: falta permissão") aparecem explicitamente, nunca escondidos no meio.
- **Explique conceitos quando ele perguntar**, em linguagem simples e com analogia do dia a dia. Exemplo: "regressão completa = rodar de novo todos os 191 testes que simulam o Marcos usando a Hive, para garantir que consertar uma coisa não quebrou outra".

### Formato do relatório de entrega

```markdown
<Resultado em uma frase: o que está no ar + evidência (regressão N/N, commit abc123).>

**O que mudou**
- <efeito para o usuário, uma linha cada>

**Ação necessária**  ← só se houver
- <quem faz o quê, até quando> (ex.: Marcos clicar "Confirmar material" nos 6 agendamentos antigos; o próximo vence 20/10 12h)

**Limitações / não testado**
- <o que ficou de fora e por quê>

Detalhes: `docs/<iniciativa>/ENTREGAS.md`.
```

### Formato do plano (iniciativa grande)

Escreva `docs/<iniciativa>/PLANO-IMPLEMENTACAO.md` e, no chat, resuma:

1. **Decisões que preciso de você** (numeradas, cada uma com a recomendação).
2. **Entregas em ordem** (E1…En), uma linha cada, com o que o Marcos percebe.
3. **Pré-requisitos** (acessos, contas de teste, janelas).
4. **Riscos e como reverto.**

## Para o Marcos (quem usa)

O Marcos não lê código e não quer saber de "trigger" ou "pacote imutável". Toda entrega que muda algo que ele vê ganha uma **nota de atualização** na ficha da iniciativa:

```markdown
### Nota para o Marcos — o que mudou
1. **<o que ele pode fazer ou ver agora, em frase de uso>.** *Antes:* <o problema como ele vivia>. *Agora:* <o novo comportamento>. <Como conferir, se útil.>
```

**Regras de escrita:**

- Nomes da tela, exatamente como aparecem: "Confirmar material", "Atualizar conteúdo programado", "Voltar à agenda".
- Datas e horas no fuso de São Paulo ("amanhã, 20/10, às 12h"), nunca UTC.
- Diga o que ele **precisa fazer** separado do que é só informativo.
- Sem siglas técnicas. "O sistema não publica duas vezes" em vez de "lease exclusiva em post_publications".

**Mensagens dentro da UI** seguem o mesmo princípio: o que aconteceu + o que fazer.

| Ruim | Bom |
|---|---|
| `HTTP 409 Conflict` | "A peça mudou enquanto você agendava (versão 3 → 4). Revise e tente de novo." |
| "Erro ao carregar" | "Não foi possível carregar suas campanhas. Tentar novamente" |
| (botão some sem explicação) | "Este conteúdo já foi publicado e permanece no histórico." |

## Commits

- Em português, no imperativo descritivo do efeito: `Estabilização E3: aprovação durável e agenda por um comando só`.
- O corpo lista o que mudou por camada e a evidência.
- Rodapé `Co-Authored-By: <modelo> <noreply@…>`.
- Um commit por entrega ou feature, nunca "várias coisas".
