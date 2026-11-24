# Tarefas

Página **Tarefas** (`/assets/pages/tasks.html`, menu entre «Negócios» e «Documentos»): todas as tarefas de todos os leads, em quatro vistas.

| Vista | O que mostra |
|---|---|
| **Lista** | Tabela: nome (com empresa, estado do lead e etiqueta «automática»), prazo final, tipo, criado por, responsável. A caixa à esquerda conclui/reabre. |
| **Prazo** | Quadro: Vencido · Vencimento hoje · Esta semana · Próxima semana · Mais tarde · Concluído. Arrastar muda o prazo (ou conclui). |
| **Planeador** | Quadro: Não planeado · Em curso · Para fazer esta semana · Em revisão. Arrastar muda a coluna. |
| **Calendário** | Mês, com a segunda-feira primeiro. Clicar numa tarefa abre-a; clicar no número do dia cria uma tarefa nesse dia. |

Barra: **+ Criar**, contadores (Atrasadas, Hoje, Em aberto), pesquisa (título ou empresa), **Mostrar** (todas / as minhas / criadas por mim / sem responsável) e **Estado** (em curso / concluídas / todas). A vista e os filtros ficam lembrados no browser. O papel «leitura» só consulta.

## Tarefas automáticas

Quando um lead muda de estado (no quadro dos Leads, por resposta registada, por resposta de WhatsApp, ao marcar a proposta como enviada ou ao fechar o negócio), a plataforma cria a tarefa seguinte e fecha as que deixaram de fazer sentido (`routes/services/task-automation.service.js`).

| Estado do lead | Tarefa criada | Prazo |
|---|---|---|
| Contactado | Follow-up | o das regras do sistema (5 dias entre mensagens) |
| Respondeu | Dar retorno | 24 horas (amanhã) |
| Reunião agendada | Reunião | hoje (depois ajusta-se à data da reunião) |
| **Enviar proposta** (estado novo) | Enviar proposta | 24 horas (amanhã) |
| Proposta enviada | Acompanhar proposta (follow-up) | 5 dias; fecha sozinha se o cliente responder |

- «Reunião» fecha quando o lead sai de «reunião agendada»; «Enviar proposta» fecha quando a proposta é enviada; «Dar retorno» fecha quando o lead sai de «respondeu».
- Estados finais (negócio fechado, oportunidade perdida, não contactar, proposta aceite/recusada): fecham todas as automáticas.
- Nunca se duplica uma tarefa aberta do mesmo tipo; empresas em «Não contactar» não ganham tarefas; as tarefas **manuais nunca se mexem sozinhas**.
- Responsável: o do lead, se tiver; senão, quem mudou o estado.

## Estado novo «Enviar proposta»

Fica entre «Reunião agendada» e «Proposta enviada». Um lead neste estado também pode receber proposta (Documentos).

## Passos na base de dados

Correr **`database/tasks.sql`** no Supabase (uma vez). Acrescenta a coluna `planeamento` às tarefas e o estado `enviar_proposta` aos leads. Enquanto não correr: a lista, o prazo e o calendário funcionam; o planeador mostra tudo em «Não planeado» (com aviso) e passar um lead para «Enviar proposta» devolve a mensagem de configuração.

## Decisões a conhecer

- Cada tarefa pertence a um lead (a base de dados exige-o): não há tarefas soltas sem empresa.
- «24 horas» conta-se por dias: prazo = amanhã.
- No quadro «Prazo», largar em «Esta semana» põe a sexta-feira (ou o domingo, se hoje já é sexta ou sábado; ao domingo recusa), em «Próxima semana» a sexta seguinte, em «Mais tarde» daqui a 14 dias, em «Vencido» não se pode largar (calcula-se pelo prazo). Não há coluna «Sem prazo», porque toda a tarefa tem prazo.
- Os relatórios continuam a contar o funil sem o estado novo.

## API

`GET /api/tarefas` (filtros `estado`, `responsavel`, `criada_por`, `q`), `GET /api/tarefas/empresas?q=`, `POST /api/tarefas`, `PATCH /api/tarefas/:id`, `DELETE /api/tarefas/:id` (criar/alterar/apagar: admin e comercial).
