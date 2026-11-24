# Relatórios

**Relatórios** (menu lateral) mostra, para um mês, os números da atividade comercial com o mês anterior ao lado. Todos os papéis veem (são só números agregados, sem dados pessoais).
Escolhe o mês com as setas ou o seletor; o endereço guarda o mês (`…/reports.html#2026-10`), por isso podes partilhar a ligação. **Exportar CSV** descarrega o relatório do mês no Excel.

## O que mostra e de onde vem cada número
| Bloco | O que conta | Fonte |
|---|---|---|
| Leads novos / empresas novas | criados no mês | tabelas `leads` e `empresas` |
| Mensagens enviadas | por canal, em primeiros contactos e follow-ups (as notas internas não contam) | `interaccoes` |
| Respostas recebidas e taxa de resposta | taxa = leads que responderam ÷ leads contactados no mês | `interaccoes` |
| Funil | leads **distintos** que passaram a cada fase durante o mês | histórico automático das mudanças de estado |
| Conversões | fase seguinte ÷ fase de partida (contactado → respondeu → reunião → proposta → aceite → fechado); «–» se ninguém estava na fase de partida | histórico |
| Propostas | criadas e marcadas como enviadas no mês, valor mensal e pontual (já com desconto) e quantas têm % sobre resultados | `propostas` |
| Por serviço / fonte / equipa | leads novos, respostas e negócios fechados; empresas novas e respostas; mensagens enviadas por pessoa | todas as anteriores |
| Atividade diária | mensagens enviadas e recebidas dia a dia | `interaccoes` |

## Coisas a saber
- **O funil conta transições, não o estado atual.** «Reunião agendada: 3» significa que 3 leads passaram a essa fase neste mês, mesmo que entretanto tenham avançado. Só existe a partir do momento em que o histórico automático foi criado.
- Os meses são em **UTC**. Uma mensagem às 23:59 de 30/11 (UTC) conta em novembro.
- Se as propostas de um mês usam mais do que uma moeda, os valores somam moedas diferentes e a página avisa.
- Um mês sem nenhuma atividade mostra «Sem atividade neste mês» e o CSV fica desativado.
- Estes são exatamente os números que a análise mensal por IA vai usar (não dá IA os dados de nenhuma empresa nem pessoa).

## Análise mensal por IA
No topo do relatório (quando o mês tem atividade) há o bloco **Análise do mês (IA)**: um resumo, o que se destaca, os problemas e um **plano de melhoria** com 3 a 5 ações por ordem de prioridade
(cada uma com porquê, como e **o número a medir no mês seguinte**). Carrega em **Gerar análise** (admin e comercial; o papel «leitura» só vê).

**Preparação (uma vez):** corre `database/monthly-analysis.sql` no SQL Editor do Supabase. Sem isto, o bloco avisa «a base de dados ainda não está pronta para as análises».

**O que a IA recebe:** só os números deste relatório (contagens, percentagens, valores das propostas). **Nunca** nomes de empresas, de pessoas, emails nem mensagens: a equipa vai como uma lista de totais sem nomes e
os ficheiros de importação como «Importação». Está tudo guardado em `dados`, por isso pode confirmar-se em que números cada análise se baseou.

**Como se comporta (de propósito):**
- Diz quando a **amostra é pequena** (menos de 30 mensagens no mês) e que as percentagens oscilam muito com poucos casos.
- Diz quando o **mês ainda vai a meio** e não tira conclusões finais; a análise fica marcada como «parcial» e convém gerá-la de novo quando o mês acabar.
- Não inventa médias do setor nem causas certas: as causas aparecem como hipóteses. As ações são só as que a plataforma permite.
- Se houve análise no mês anterior, avalia se os números sugerem progresso nas ações recomendadas.
- Guarda **uma análise por mês e por idioma** (pt, en ou es, o idioma escolhido na página). Voltar a abrir não gasta IA; «Gerar de novo» substitui a análise desse mês e idioma.
- Custo: cerca de 3 mil tokens de entrada e 2 mil de saída por análise (alguns cêntimos). Há um limite de pedidos por hora e por utilizador. O modelo pode mudar-se com `ANALISE_MENSAL_MODELO` no `.env`.
- A análise é um apoio à decisão, não uma verdade: lê-a com o relatório ao lado.
