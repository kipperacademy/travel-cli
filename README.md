# Planejador de viagens · CLI

Dois arquivos TypeScript: `app.ts` contém a aplicação e `tracing.ts` envia os traces ao Pydantic Logfire. Sem servidor, frontend, banco ou aprovação humana. Comentários `@AULA-00` a `@AULA-07` guiam a explicação.

## Executar

Requer Node.js 22 ou superior.

```bash
npm ci
cp .env.example .env
# Preencha OPENAI_API_KEY e LOGFIRE_TOKEN no .env
npm start -- "Planeje dois dias em Boston, 10 e 11 de novembro de 2026, das 9h às 18h, saindo do Boston Common. Quero história e alimentação, com US$ 150 no total para passeios e comida, excluindo transporte e hospedagem. Use America/New_York e crie os eventos."
```

Sem argumentos, a CLI pergunta o pedido. Informe destino, datas, fuso e orçamento. É uma execução por comando; se faltarem dados, o agente pode pedir esclarecimento na resposta. Execute novamente com o pedido completo.

## Logfire

1. Crie um projeto no [Logfire](https://logfire.pydantic.dev/).
2. Em Settings → Write tokens, gere um token de escrita e coloque-o em `LOGFIRE_TOKEN`.
3. Configure `LOGFIRE_BASE_URL` conforme a região: `https://logfire-us.pydantic.dev` ou `https://logfire-eu.pydantic.dev`.
4. Execute a CLI e abra **Live** no projeto. Filtre por `service_name = 'travel-cli'` ou pelo `trace_id` impresso no terminal.
5. Expanda o trace **Planejador de viagens**: agentes, chamadas ao modelo, tools, handoffs e durações. Os atributos `agents.data` contêm os dados disponibilizados pelo SDK, incluindo entradas e saídas. Os spans completos são enviados em lotes e ao encerrar a CLI.

A integração TypeScript do Agents SDK não tem adaptador oficial completo para Logfire. `tracing.ts` é uma ponte didática usando `TracingProcessor` e OpenTelemetry. Ela preserva a hierarquia dos spans desta aplicação na visualização Live; não replica todos os painéis especializados da integração Python, cálculo de custo ou visualização de tokens em streaming. A busca web feita dentro da tool aparece como parte da tool (entrada, resultado e duração); sua chamada interna à Responses API não recebe um span de modelo separado.

O adaptador substitui o exporter padrão do Agents SDK: envia traces apenas ao Logfire. Registra todas as execuções e envia conteúdo para facilitar a aula; use dados de demonstração. Não há captura de headers de autenticação.

## Fluxo e ferramentas

- **Pesquisador:** `searchTravelActivities` usa Responses API com busca web real e preserva fontes.
- **Pesquisador Decolar:** `pesquisarNoDecolar` retorna dados fixos e fictícios de voo, hotel e pacote em BRL, com `simulated: true`. Não consulta o Decolar nem a API OpenAI; os exemplos não correspondem ao destino ou às datas solicitadas.
- **Planejador:** ponto de entrada e orquestrador. Delega as pesquisas aos especialistas e usa `getCalendarAvailability` para consultar compromissos e calcular janelas livres em código antes de montar o roteiro.
- **Handoffs:** Planejador → Pesquisador → Planejador para atrações e alimentação; Planejador → Pesquisador Decolar → Planejador para Decolar, voos, hospedagens ou pacotes. Os retornos devolvem o controle ao orquestrador, que aproveita os resultados no histórico. Ao concluir o roteiro, Planejador → Secretário carrega os eventos estruturados; `onHandoff` os coloca no contexto local.
- **Secretário:** `createGoogleCalendarEvent` cria os eventos planejados diretamente. `markIssueAsDone` só conclui quando todos têm confirmação.
- **Saída estruturada:** `summary` e `status`. O estado real é o persistido pela tool, não a alegação do modelo.

## Google Agenda

Por padrão a agenda é **simulada e vazia**, identificada no terminal, no retorno das tools e no `result.json`. A pesquisa de atrações e as chamadas aos modelos dos agentes continuam reais e consomem a API OpenAI. A tool do Decolar é sempre mockada.

Para usar uma agenda real, habilite a Google Calendar API no seu projeto e obtenha um access token OAuth do usuário com o escopo `https://www.googleapis.com/auth/calendar` (por exemplo pelo [OAuth Playground](https://developers.google.com/oauthplayground/)). Coloque-o em `GOOGLE_ACCESS_TOKEN` e escolha `GOOGLE_CALENDAR_ID` (`primary` por padrão). Com essas configurações, os eventos são criados diretamente, sem confirmação interativa. O token é temporário; esta CLI não implementa login nem renovação automática.

`result.json` registra o plano, os IDs dos eventos e o status. Cada execução cria uma nova issue e substitui esse arquivo. O ID de evento é estável dentro da execução para reconciliar tentativas; executar novamente todo o comando cria uma nova viagem e pode duplicar eventos. Não há retomada após reinício, fila, garantia contra concorrência ou validação completa de orçamento/deslocamento. É a demonstração mínima para explicar essas evoluções, não uma aplicação de produção completa.

## Preparação da aula

```bash
npm run check
```

Deixe ambos os arquivos prontos. Use os marcadores `@AULA` para navegar; ao desativar uma tool, ajuste também as instruções que exigem seu uso. Não comente o tracing se quiser comparar as execuções no Logfire. Guardrails ficam apenas na explicação.

Verificado: TypeScript e teste local do fluxo completo com respostas OpenAI simuladas, dois handoffs, quatro tools, conclusão persistida e envio OTLP para um receptor local. Não foi feita chamada paga nem criação de evento real. A ingestão no seu projeto Logfire depende das credenciais e não foi validada nesta entrega.

Referências: [limite da integração TypeScript](https://pydantic.dev/docs/logfire/integrations/agent-frameworks/openai-agents-js/), [exportação OpenTelemetry](https://pydantic.dev/docs/logfire/guides/alternative-clients/), [Agents SDK](https://openai.github.io/openai-agents-js/), [Google FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [Google Events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
