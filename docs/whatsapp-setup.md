# WhatsApp pela API oficial da Meta: guia de configuração

A plataforma envia a primeira mensagem de WhatsApp com a **API oficial da Meta** (WhatsApp Business Platform / Cloud API).
A IA propõe as variáveis de um **modelo aprovado**; tu revês a pré-visualização e confirmas o envio.

> **Antes de começares: consentimento.** A Meta exige que a empresa que escreve primeiro tenha o **consentimento (opt-in)** de quem
> recebe. Um número publicado no site mostra que a empresa aceita contactos, mas não é, por si só, esse consentimento.
> Quem envia assume o risco: denúncias e bloqueios baixam a qualidade da conta e a Meta passa a limitar os envios.
> Confirma a política atual da Meta antes de enviar a sério. Não é aconselhamento jurídico.
>
> **Custo.** As mensagens de marketing são pagas pela Meta (o preço depende do país de destino). Vê os preços no painel da Meta.

## O que a plataforma faz e não faz

| Faz | Não faz |
|---|---|
| Usa só números que a **própria empresa publica** no site (ligação `wa.me/...`) | Não adivinha números nem converte telefones fixos |
| Envia só o **modelo aprovado** (texto fixo) com 3 variáveis | Não envia texto livre a quem nunca falou connosco (a Meta não deixa) |
| Limite diário baixo (5 por pessoa), **uma só mensagem por empresa** em cada 90 dias | Não envia em massa nem em lote |
| Regista o envio **antes** de chamar a API (sem registo, nada sai; sem resposta da Meta, o registo é apagado) | Só envia texto livre dentro das **24 horas** a seguir à resposta da empresa (ver «Respostas assistidas») |
| Webhook: entregue, lida, respostas e **PARAR** (a empresa passa a «não contactar» em todos os canais) | |

## Passo a passo

### 1. Contas e número
1. Uma conta no **Meta Business** e uma **WhatsApp Business Account** (no painel Meta for Developers).
2. Um **número de telefone** só para a API. Um número que já está na app WhatsApp normal tem de ser migrado primeiro (ou usa o número de teste da Meta, ver passo 7).

### 2. Credenciais (no painel Meta for Developers, produto WhatsApp)
| Variável do `.env` | Onde está |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Número de telefone → «Phone number ID» |
| `WHATSAPP_TOKEN` | Token de acesso. O token temporário caduca em horas; para uso real cria um token permanente de «utilizador do sistema» |
| `WHATSAPP_APP_SECRET` | Definições da app → Básico → «Segredo da app». Serve para validar os avisos do webhook |
| `WHATSAPP_VERIFY_TOKEN` | Uma frase secreta que inventas tu; usa a mesma no webhook (passo 5) |
| `WHATSAPP_API_VERSION` (opcional) | Versão da API, por defeito `v23.0`. Muda se a Meta a descontinuar |
| `WHATSAPP_LIMITE_DIARIO` (opcional) | Mensagens por pessoa e por dia (por defeito 5) |

**Nunca** partilhes estes valores nem os ponhas no código: ficam só no `.env`.

### 3. Modelos de mensagem (a Meta tem de os aprovar)
A primeira mensagem tem de ser um modelo de **texto fixo**. Há **32 modelos** definidos em `config/whatsapp-templates.json`: um **genérico** (reserva, com variáveis), **um por serviço** e o **follow-up**, em português de Portugal, português do Brasil, inglês e espanhol. **A lista completa, com o texto para copiar para a Meta, está em [whatsapp-templates.md](whatsapp-templates.md).**

| Tipo | Quando é usado | Nome (exemplo em pt_BR) |
|---|---|---|
| Genérico | quando a análise não recomenda um serviço, ou o do serviço não está aprovado | `alpha_intro_pt_br` (com variáveis) |
| Branding, Website, Marketing digital, Redes sociais, Marketing de influência, Design gráfico | a análise recomenda esse serviço | `sistemas_pt_br`, `website_pt_br`, `marketing_digital_pt_br`, `redes_sociais_pt_br`, `automacao_ia_pt_br`, `design_grafico_pt_br` (texto fixo, sem variáveis, 2 botões) |
| Follow-up | a quem não respondeu, 3 dias úteis depois da 1.ª mensagem (uma só vez) | `followup_pt_br` (texto fixo, 2 botões) |

O sufixo do idioma é `_pt_eu` (código `pt_PT`), `_pt_br` (`pt_BR`), `_en` (`en`) ou `_es` (`es`). Se na Meta o idioma tiver outro código (por exemplo `en_GB`), a plataforma usa o que a Meta tem para esse **nome**.

**Como a plataforma escolhe.** Ao contactar uma empresa, usa o modelo do serviço que a análise recomenda para ela (o mesmo que filtras no Radar).
Na janela do WhatsApp podes trocar de modelo. Se a Meta disser quais estão **aprovados** (precisa de `WHATSAPP_WABA_ID`), só se mostram e só se usam esses:
se o do serviço ainda não estiver aprovado, usa o genérico. Podes por isso ir criando os modelos aos poucos.

**Criar os modelos.** O mais simples é o script, que os submete à Meta por ti (só cria os que ainda não existem; sem `--confirmar` só mostra):
```
node scripts/create-whatsapp-templates.js --idioma=pt_BR              # vê o que submeteria (7 modelos)
node scripts/create-whatsapp-templates.js --idioma=pt_BR --confirmar  # submete
```
Precisa de `WHATSAPP_TOKEN` com a permissão «whatsapp_business_management» e de `WHATSAPP_WABA_ID`. Se o token só tiver a de enviar mensagens, a Meta recusa
e o script diz-to: nesse caso cria-os à mão no Gerenciador do WhatsApp, com **exatamente o mesmo nome, idioma e texto** de `config/whatsapp-templates.json`.
Começa só pelo idioma que vais usar (a aprovação demora de minutos a horas e a Meta limita os pedidos por hora).

- Categoria: **MARKETING**. Cada modelo tem 3 variáveis no corpo: `{{1}}` empresa, `{{2}}` o que reparámos, `{{3}}` a nossa leitura.
- A Meta recusa variáveis no início ou no fim do texto, quebras de linha dentro de uma variável e muitos espaços seguidos. Os modelos já estão escritos para cumprir isto.
- Só modelos **aprovados** podem ser enviados. Para desativar um modelo na plataforma, acrescenta `"ativo": false` a esse modelo no ficheiro.
- Se mudares um texto, muda-o igual nos dois sítios e espera nova aprovação.

### 4. Base de dados
Corre `database/whatsapp.sql` no SQL Editor do Supabase (uma vez; é seguro repetir). Sem isto, a plataforma recusa enviar (diz «corra database/whatsapp.sql»).

### 5. Webhook (entregue, lida, respostas, PARAR)
O webhook precisa de um endereço **https público**. Em `localhost` não funciona sem um túnel (por exemplo ngrok ou Cloudflare Tunnel) ou sem o servidor publicado.
1. No painel Meta → WhatsApp → Configuração → Webhook:
   - **URL de callback:** `https://O-TEU-ENDERECO/api/whatsapp/webhook`
   - **Token de verificação:** o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
2. Subscreve o campo **messages** (é ele que traz os estados e as respostas).
3. Sem webhook, o envio funciona na mesma, mas não saberás se foi entregue ou lida, nem receberás os «PARAR». **Sem webhook, fica só a ti verificar as respostas no WhatsApp**, e quem pedir para parar tem de ser marcado à mão em «Leads → estado → Não contactar».

Segurança do webhook: o servidor só aceita avisos com a **assinatura da Meta** válida (`X-Hub-Signature-256`, calculada com o segredo da app). Sem `WHATSAPP_APP_SECRET`, recusa tudo.

### 6. Números de WhatsApp das empresas
O enriquecimento já guarda o WhatsApp que a empresa publica no site. Para as empresas que já tens:
```
node scripts/find-whatsapp.js            # só mostra o que encontrou
node scripts/find-whatsapp.js --gravar   # guarda o número em cada empresa
```
Muitas startups não publicam WhatsApp: espera poucos destinatários.

### 7. Testar sem enviar a empresas reais
A Meta dá um **número de teste** gratuito e deixa registar até 5 destinatários de teste (o teu telemóvel, por exemplo). Com o número de teste:
- só se envia para os números verificados no painel (senão aparece «em modo de teste só se pode enviar para números verificados»);
- os modelos de exemplo da Meta (por exemplo `hello_world`) já vêm aprovados, mas os nossos precisam de aprovação.

Para ensaiar a interface sem credenciais: abre uma empresa com WhatsApp publicado → Contactar → WhatsApp. Sem credenciais aparece «ainda não está configurado».

## Modo de teste: passo a passo (com os dois scripts)

Os scripts leem o `.env` e **nunca imprimem os valores** dos segredos. Nenhum grava nada na base de dados.

1. **Preenche o `.env`** com `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` (do número de teste que a Meta dá no painel). Acrescenta `WHATSAPP_WABA_ID` (ID da conta WhatsApp Business) se quiseres ver o estado dos modelos. **Nunca coles estes valores numa conversa.**
2. **Verifica** (só lê, não envia):
   ```
   node scripts/check-whatsapp.js
   ```
   Mostra o que falta (variáveis, token, modelos aprovados, migração, webhook).
3. **Corre `database/whatsapp.sql`** no Supabase e volta a verificar até a secção «Base de dados» dizer OK.
4. **No painel da Meta, adiciona o teu telemóvel** à lista de destinatários do número de teste e confirma o código que o WhatsApp te envia.
5. **Testa as credenciais com o modelo de exemplo da Meta** (já vem aprovado). Primeiro vê o que seria enviado, depois envia:
   ```
   node scripts/send-whatsapp-test.js +351912345678 --hello
   node scripts/send-whatsapp-test.js +351912345678 --hello --confirmar
   ```
6. **Submete os modelos** (por exemplo `node scripts/create-whatsapp-templates.js --idioma=pt --servico=generico --confirmar`), espera pela aprovação e testa-os
   (sem `--servico` usa o genérico; com `--servico=sistemas` usa o de branding):
   ```
   node scripts/send-whatsapp-test.js +351912345678 pt --confirmar
   node scripts/send-whatsapp-test.js +351912345678 pt --servico=sistemas --confirmar
   ```
7. **Só depois**, na plataforma: grava o WhatsApp de uma empresa de teste (ou usa o teu número como `redes.whatsapp` de uma empresa criada para o efeito) e abre Contactar → WhatsApp.

Sem `--confirmar`, o script de envio **nunca envia**. Em modo de teste, a Meta só entrega a números verificados.

## Respostas assistidas (dentro das 24 horas)
Quando uma empresa responde a um modelo nosso (precisa do webhook, passo 5), a Meta abre uma **janela de 24 horas**: durante esse tempo pode enviar-se **texto livre**.
Na ficha do lead aparece o painel **«Responder no WhatsApp»**: a conversa, quanto tempo falta e um botão **«Sugerir resposta com IA»**.
- A IA lê a conversa e o dossier da empresa e propõe uma resposta curta, que termina com uma pergunta ou proposta (por exemplo, uma conversa de 15 minutos). Não inventa preços, prazos nem resultados.
- **Tu revês, editas e confirmas.** Nada é enviado sozinho.
- A janela conta a partir da **última** mensagem da empresa. Depois de fechar, só se enviam modelos aprovados.
- Salvaguardas: empresa «não contactar», texto limpo (máx. 1000 caracteres), sem duplicados em 1 minuto, limite de **40 respostas por dia** (`WHATSAPP_LIMITE_RESPOSTAS`, à parte do limite dos primeiros contactos), registo antes do envio (e apagado se a Meta recusar).
- O número de destino é o do qual a empresa nos escreveu, nunca um valor do browser.
- No painel **Hoje**, o separador **Respostas** mostra as que ainda não respondeste, com a indicação de que a janela está aberta.

## Mensagens de erro e o que significam
| Mensagem na plataforma | Causa provável |
|---|---|
| «A API do WhatsApp recusou as credenciais» | Token errado ou caducado; confere `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` |
| «Este número não tem WhatsApp…» | O número não tem WhatsApp ou não pode receber a mensagem |
| «Em modo de teste só se pode enviar…» | Estás com o número de teste: verifica o destinatário no painel |
| «A Meta recusou o modelo…» | Nome, idioma ou texto diferentes do aprovado, ou modelo ainda sem aprovação |
| «A Meta limitou os envios» | Limite de envios ou de qualidade da conta; espera e baixa o ritmo |
| «Já foi enviada uma mensagem…» | Regra nossa: uma só mensagem por empresa em cada 90 dias |
| «A base de dados ainda não está pronta» | Falta correr `database/whatsapp.sql` |
| «A janela de 24 horas já fechou» | A empresa respondeu há mais de 24 horas: só se podem enviar modelos aprovados |

## O que ainda não está feito
- Responder com imagens, documentos ou áudio (as respostas são só texto). Fora da janela de 24 horas só se enviam modelos.
- Modelos com botões, imagens ou outras variáveis. O texto está fixo em `config/whatsapp-templates.json`.
- Nada disto foi testado contra a Meta a sério (só contra uma simulação): faz o primeiro envio com o número de teste.
