# Fase 10 – Implantação de Negócios

Relatório da fase. Data: 20/11/2026.

Objetivo: fechar o ciclo comercial dentro do painel, desde a reunião até ao contrato assinado, e passar a ver as respostas dos clientes (WhatsApp e email) sem sair da plataforma.

## Resumo

| Bloco | Estado | Falta fazer (do seu lado) |
|---|---|---|
| 1. Tarefas sincronizadas com o Google Agenda | Feito e testado | Ligar a conta e carregar em «Sincronizar agora» |
| 2. Clientes: contratos e contratos assinados | Feito e testado | Preencher NIF e morada em `config/contract-defaults.json`; rever o modelo com um jurista |
| 3. Integração WhatsApp | Feito e testado com a API simulada | Resolver a conta desativada pela Meta; criar e aprovar os modelos; configurar o webhook |
| 4. Integração Email (respostas) | Feito e testado | Reiniciar o servidor |
| 5. Atualização das mensagens do WhatsApp Web | Feito: modelos novos e follow-up | Criar os modelos na Meta ou enviar à mão |

Nada foi enviado para o Git (não foi pedido).

## 1. Tarefas e Google Agenda
- **Reunião agendada** pede **dia e hora**. A reunião passa a aparecer em Tarefas (com a hora).
- **Ligação ao Google Agenda** (conta sandra.alphatec@gmail.com): as tarefas com prazo criam eventos no Google Agenda, e os eventos do Google aparecem sobrepostos no calendário das Tarefas.
- Segurança: a ligação usa OAuth; o token de renovação fica **cifrado** (AES-256-GCM) e o painel só pede acesso aos eventos. Não envia convites nem lembretes a ninguém.
- Alterar ou apagar uma tarefa atualiza o evento; fechar a reunião fecha o evento.
- Ficheiros: `routes/services/google-calendar.service.js`, `routes/google.routes.js`, `database/google.sql`. Guia: `docs/google-calendar.md`.
- Problemas resolvidos: segredo do cliente errado no `.env`; erro «default reminders and overrides» (deixaram de se enviar lembretes); mensagens de erro claras para credenciais, redirect e código.

## 2. Clientes, contratos e contratos assinados
- Nova página **Clientes** (`clients.html`) com as empresas de negócio fechado: lista, ficha, estado do contrato (**rascunho / enviado / assinado**), datas de início e fim previsto, e sugestões de futuras propostas.
- **Propostas** passam a mostrar o **valor total do contrato** (ex.: 3 × 300 € = 900 €) e o **calendário de pagamentos** antecipados.
- **Gerador de contrato** por serviço, baseado no `contrat_old`, preenchido pela Alpha Tech como a proposta. Em pt, en e es.
- Cláusulas revistas: aprovação (5+2 dias úteis), rondas de revisão, rescisão antecipada, pagamentos antecipados, propriedade intelectual, autorização de portefólio, responsabilidade equilibrada, automação e IA, despesas com limite máximo. Proteção de dados só na **cláusula 12 e Anexo III** (RGPD).
- **Identificação fiscal por país**: Brasil, EUA, Reino Unido e outros não usam NIF; a etiqueta e o formato mudam com o país.
- **Contrato assinado**: botão para anexar o PDF assinado por ambas as partes (ficheiro privado no Supabase Storage, até 10 MB, verificação do tipo de ficheiro). A lista mostra as empresas cujo contrato foi enviado e ainda **falta assinar**.
- Ficheiros: `routes/clients.routes.js`, `routes/services/contract.service.js`, `assets/js/clients.js`, `assets/js/contract-render.js`, `database/clients.sql`. Guia: `docs/clients.md`.
- **Atenção:** o texto do contrato é um modelo gerado pelo sistema. Peça a um jurista que o reveja antes de o usar com clientes.

## 3. Integração WhatsApp
- Respostas de clientes por WhatsApp entram no painel (webhook da Meta): ficam na ficha do lead, o lead passa a «Respondeu» e aparece em **Hoje → Respostas à espera**.
- Modelos de mensagem **fixos** (sem variáveis) por serviço, com botões de resposta rápida: website, redes sociais, design gráfico, sistemas, automação e IA e marketing digital. Versões **pt-PT, pt-BR, en e es**. O modelo genérico mantém as variáveis.
- **Follow-up automático**: 3 dias úteis sem resposta, uma única vez, cria tarefa na lista.
- Ficheiros: `config/whatsapp-templates.json`, `routes/services/whatsapp.service.js`, `scripts/create-whatsapp-templates.js`. Guias: `docs/whatsapp-templates.md`, `docs/whatsapp-setup.md`.
- **Situação da conta:** a Meta desativou a conta do WhatsApp em 19/11/2026. O envio só funciona depois de a conta ser recuperada. Entretanto, os textos podem ser enviados à mão, um a um, a partir do `docs/whatsapp-templates.md`.
- Instagram: tentou-se abrir o Instagram dentro do painel, mas o Instagram bloqueia (`X-Frame-Options: DENY`). A página foi **removida**. A ligação pela API da Meta ficou de lado.

## 4. Integração Email
- O painel lê a caixa do Gmail por **IMAP, só em leitura**, de 3 em 3 minutos. Só interessam mensagens de quem a Alpha Tech já contactou. O resto não se abre nem se guarda.
- Uma resposta fica registada na ficha, o lead passa a «Respondeu», os follow-ups fecham e cria-se a tarefa «Dar retorno». Respostas automáticas e avisos de falha de entrega ignoram-se. Pedidos de «remover/unsubscribe» passam a empresa a «Não contactar».
- **Aviso visível**: número vermelho no menu «Hoje», contagem no título do separador e um aviso no canto do ecrã quando chega uma resposta nova.
- **Respostas enviadas pelo Gmail** (fora do painel) também ficam registadas, a partir da pasta Enviados: o número desce e a tarefa «Dar retorno» fecha. Não regista mensagens a quem ainda não respondeu, anteriores à resposta do cliente, nem duplicados.
- Ficheiros: `routes/services/email-replies.service.js`, `assets/js/app.js`. Guia: `docs/email-replies.md`.

## 5. Atualização das mensagens do WhatsApp Web
- Os textos de primeiro contacto foram refeitos com os modelos de branding já enviados para revisão (`sistemas_pt_eu`, `sistemas_en`, `sistemas_es`) e criados os restantes serviços e o follow-up, nas variantes pt-BR, en e es.
- O painel escolhe o modelo certo pelo serviço e idioma do lead.

## Testes
- Testes automáticos novos nesta fase: clientes, render do contrato, revisão do contrato, Google, WhatsApp, Hoje, respostas por email, respostas enviadas e aviso de respostas. Todos passam.
- Auditoria de traduções: 1232 chaves por idioma (en, pt, es), iguais.
- Falha conhecida: `teste-registo-real` falha porque o limite diário de emails da base real já foi atingido. Não é um erro de código.

## Antes de usar (por ordem)
1. Correr no SQL Editor do Supabase: `database/clients.sql`, `database/tasks.sql`, `database/google.sql` (e `monthly-analysis.sql` e `settings.sql`, se ainda não correu).
2. Preencher NIF e morada da Alpha Tech em `config/contract-defaults.json`.
3. **Reiniciar o servidor** (ativa a leitura de email e o código novo). Deve aparecer «Leitura das respostas por email ligada.»
4. Tarefas: ligar o Google e carregar em **Sincronizar agora**.
5. WhatsApp: recuperar a conta, criar os modelos na Meta (`docs/whatsapp-templates.md`) e configurar o webhook (precisa de um endereço https público).
6. Pedir a revisão jurídica do modelo de contrato.

## Fora desta fase
- Instagram dentro do painel (não é possível) e mensagens diretas por API da Meta.
- Envio automático de WhatsApp enquanto a conta estiver desativada.
