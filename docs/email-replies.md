# Respostas por email

O painel lê a caixa do Gmail de onde se envia (IMAP) e mostra quando um cliente responde a um email da Alpha Tech.

## Como funciona
- De **3 em 3 minutos** (e 20 segundos depois de o servidor arrancar) vê as mensagens recebidas nos últimos **14 dias**.
- Só lhe interessam mensagens de quem a Alpha Tech **já contactou por email**: o endereço a que se enviou, ou uma resposta a um email enviado pela plataforma (reconhece-se pelo identificador da mensagem). Tudo o resto (pessoal, newsletters, avisos) **não se abre, não se guarda e não se regista**.
- Uma resposta fica **registada na ficha do lead** (texto sem a citação do email anterior), o lead passa a **«Respondeu»**, os follow-ups automáticos fecham-se e cria-se a tarefa «Dar retorno». Aparece em **Hoje → Respostas à espera**.
- **Respostas automáticas** («fora do escritório») e **avisos de falha de entrega** ignoram-se.
- Um pedido curto para parar («remover», «unsubscribe», «não quero receber mais emails», «stop»…) passa a empresa a **«Não contactar»** e fecha as tarefas.
- Um lead que já está noutro estado (por exemplo «proposta enviada») **mantém o estado**; a resposta regista-se na mesma.
- **Nunca se altera a caixa**: não se marca como lida, não se move, não se apaga. A mesma mensagem **nunca se regista duas vezes**.

## Respostas que envia pelo Gmail
Se responder a um cliente **diretamente no Gmail** (fora do painel), a leitura vê também a pasta **Enviados** (seja qual for o nome, «Sent Mail», «Correio enviado»…) e regista a sua resposta na ficha do lead:
- fica como **resposta nossa** (saída, tipo «resposta»), com o texto sem a citação;
- a resposta deixa de contar como **por responder** (o número do menu desce) e a tarefa **«Dar retorno»** fecha;
- o **estado do lead não muda** (se quiser avançá-lo, por exemplo para «Reunião agendada», faça-o na ficha).

O que **não** se regista: mensagens para quem ainda **não respondeu** (um primeiro email feito à mão não entra), mensagens **anteriores** à resposta do cliente, destinatários que não são contactos de leads, mensagens sem identificador e tudo o que a plataforma já enviou (reconhece-se pelo id e pela hora). A mesma mensagem nunca se regista duas vezes.

## Configuração
Usa o `SMTP_USER` e o `SMTP_PASS` do `.env`: a palavra-passe de aplicação do Gmail serve também para ler. Não há mais nada a fazer; o IMAP do Gmail está sempre ativo. Reinicie o servidor e deve aparecer «Leitura das respostas por email ligada.» no terminal.

Opcionais no `.env`:
- `EMAIL_RESPOSTAS=0`: desliga a leitura.
- `EMAIL_RESPOSTAS_MINUTOS` (3 por defeito) e `EMAIL_RESPOSTAS_DIAS` (14 por defeito).
- `IMAP_HOST` / `IMAP_PORT`: só se o email **não** for do Gmail (nesse caso `IMAP_HOST` é obrigatório).

## Notas
- Os emails enviados **a partir de agora** guardam o identificador da mensagem. Os que foram enviados antes só se reconhecem pelo **endereço** de quem responde.
- O painel só vê as respostas **enquanto o servidor estiver ligado**. Ao arrancar, lê o que ficou por ler dos últimos 14 dias.
- Se a caixa recusar o acesso, a verificação regista o erro e tenta de novo na vez seguinte.

## API
`GET /api/outreach/email/respostas` (estado e última verificação) e `POST /api/outreach/email/respostas/verificar` (verifica agora; admin e comercial).

## Aviso de respostas por responder (email e WhatsApp)
- Um **número vermelho no menu «Hoje»** mostra quantas respostas de clientes estão por responder, e o **título do separador** passa a «(3) Leads…», visível mesmo com outro separador à frente.
- Quando chega uma resposta nova, aparece um **aviso no canto do ecrã** («Nova resposta de um cliente. Abrir Hoje»), durante 9 segundos.
- O número é o da lista **Hoje → Respostas à espera** (a última coisa no lead foi uma mensagem do cliente, há menos de 14 dias; lead em aberto; empresa fora de «Não contactar»). Desce quando se responde ao cliente.
- Atualiza de minuto a minuto (e ao voltar ao separador). `GET /api/pipeline/hoje/respostas`.
