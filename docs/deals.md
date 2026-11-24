# Negócios

**Negócios** (menu lateral, entre Leads e Documentos) é o quadro das **oportunidades de venda**, com valor, etapa e previsão de fecho, no estilo de um CRM.
Os **Leads** continuam a ser os potenciais clientes que estão a ser trabalhados; um **negócio** é uma oportunidade concreta, com valor, que se acompanha até ganhar ou perder.

**Preparação (uma vez):** corre `database/deals.sql` no SQL Editor do Supabase (é seguro repetir). Cria a tabela `negocios`. Sem isto, a página avisa «a base de dados ainda não está pronta para os negócios».

## O quadro
- **Cinco etapas:** Qualificado → Contactado → Reunião agendada → Proposta feita → Negociações iniciadas. Cada coluna mostra o **número de negócios e o total em euros** (ou na moeda do negócio: nunca se somam euros com dólares).
- **Arrastar e largar** um cartão para outra coluna muda a etapa (o cartão muda logo; se o servidor recusar, volta atrás). Quem usa o teclado abre o negócio (Enter) e muda a etapa lá.
- **Cada cartão** mostra o título, a empresa, o valor, a previsão de fecho (a vermelho se já passou, a amarelo se é nos próximos 7 dias), a próxima atividade do lead e o responsável.
- **+ Negócio** (ou o «+» no topo de cada coluna, que já escolhe a etapa): procura a empresa pelo nome, o título preenche-se sozinho, e escolhe-se o valor, a moeda, a etapa, a previsão e o responsável (por defeito, quem cria).
  As empresas em «Não contactar» não aparecem na pesquisa e o servidor recusa criar negócios para elas.
- **Em cima à direita:** o total dos negócios abertos, a pesquisa (título e empresa), o filtro por responsável, o estado (**Abertos, Ganhos, Perdidos, Todos**) e a ordenação (próxima atividade, valor, previsão de fecho, mais recentes, empresa A–Z). O estado, a ordenação e a vista (quadro ou lista) ficam lembrados no browser.
- **Lista:** a mesma informação em tabela.

## Ganhar, perder e reabrir
Abre o negócio (clica no cartão):
- **Marcar como ganho** ou **Marcar como perdido** (com o motivo, opcional). O negócio sai do quadro dos abertos e deixa de contar nos totais; vê-se escolhendo «Ganhos», «Perdidos» ou «Todos».
- **Ligação ao lead:** se o negócio está ligado a um lead (acontece sozinho ao escolher a empresa: usa o lead de maior pontuação), **ganho passa o lead a «negócio fechado» e perdido passa-o a «oportunidade perdida»**. Assim o funil e os **Relatórios** refletem o resultado. Reabrir um negócio não mexe no lead.
- **Reabrir** volta a pô-lo no quadro, na etapa em que estava. **Apagar** remove-o de vez (pede confirmação).
- Um negócio fechado já não muda de etapa; ainda se pode corrigir o valor.

## Lead e negócio andam sempre juntos (nos dois sentidos)
- **Negócio → lead:** ganho passa o lead a «negócio fechado»; perdido passa-o a «oportunidade perdida».
- **Lead → negócio:** se mudas o lead para **«negócio fechado»** (na ficha ou arrastando no quadro dos Leads), o negócio aberto desse lead fecha como **ganho**.
  Se o lead ainda **não tinha negócio**, cria-se um já **ganho** (com o título e o valor da proposta mais recente, ou o nome da empresa e 0 €), para aparecer em «Ganhos».
  Se mudas o lead para **«oportunidade perdida»** ou **«proposta recusada»**, o negócio aberto fecha como **perdido** (nunca se cria um negócio perdido).
  Os outros estados do lead não mexem nos negócios, e um negócio já ganho **não reabre** se o lead recuar (reabre-se à mão).
- **Negócios fechados não desaparecem:** o quadro mostra os abertos, mas ao lado do total ficam os atalhos **«Ganhos»** e **«Perdidos»** (com o n.º e o valor dos ganhos). Clicar mostra esses negócios; clicar outra vez volta aos abertos.
- **Dados antigos:** para pôr em linha negócios e leads que já existiam antes desta sincronização: `node scripts/sync-deals.js` (só mostra o que faria) e `node scripts/sync-deals.js --gravar` (faz as alterações).

## Ligação com as propostas
- **Marcar uma proposta como enviada** (em Documentos) mexe no negócio desse lead:
  - se há um negócio **aberto**, passa a **«Proposta feita»** (nunca recua: se já estava em «Negociações iniciadas», fica lá) e fica **ligado à proposta** (o cartão mostra o n.º, por exemplo NS-2026-0007);
  - se o negócio ainda estava a **0**, recebe o **valor da proposta**. Um valor que alguém já escreveu **nunca é sobreposto**;
  - se **não há negócio aberto**, cria-se um em «Proposta feita», com o título e o valor da proposta e como responsável quem a enviou. (Um negócio já fechado não conta: cria-se um novo.)
  - empresas em «Não contactar» não ganham negócio; a proposta marca-se como enviada na mesma. O aviso em Documentos diz o que aconteceu ao negócio.
- **Valor sugerido** = valor pontual + mensalidade × meses do contrato (**12 se for mês a mês**, o «primeiro ano»), já com o desconto. A percentagem sobre resultados **não conta** (ainda não se sabe quanto valerá).
- **Na janela do negócio** aparecem as propostas do lead, cada uma com **«Usar [valor]»** (preenche o formulário; só grava quando carregas em Guardar) e **«Abrir proposta»** (vai direto à proposta em Documentos).
- Se o ficheiro `database/deals.sql` já tinha sido corrido antes desta ligação, **corre-o outra vez**: acrescenta a coluna `proposta_id`.

## Quem pode fazer o quê
- **admin e comercial:** criam, alteram, fecham, reabrem e apagam.
- **leitura:** só vê (sem botões, sem arrastar, campos bloqueados).

## Notas técnicas
- O servidor valida tudo (valor entre 0 e mil milhões, moeda, etapa, data) e as mensagens de erro saem no idioma da interface (pt, en, es).
- Os ficheiros: `routes/services/deal.service.js`, `routes/deals.routes.js`, `assets/js/deals.js`, `assets/pages/deals.html`, `database/deals.sql`.
