# Definições

**Definições** (menu lateral, último item) reúne o perfil de cada pessoa, a equipa, o estado das integrações e os limites em vigor.

**Preparação (uma vez):** corre `database/settings.sql` no SQL Editor do Supabase. Cria a coluna `idioma` na tabela `utilizadores`.
Sem isto, tudo funciona, mas o idioma continua a ficar só no browser (a página avisa).

## O que cada papel vê
| Bloco | admin | comercial | leitura |
|---|---|---|---|
| Perfil (nome, idioma, palavra-passe) | sim | sim | sim |
| Limites em vigor | sim | sim | sim |
| Integrações | sim | sim | não |
| Equipa e papéis | sim (muda papéis) | não | não |

## Perfil
- **Nome:** editável (2 a 80 caracteres). **Email e papel:** só se veem.
- **Idioma:** fica guardado **na conta**. Ao abrir a plataforma num computador novo, aplica-se o idioma da conta (uma vez por sessão do browser); depois, cada vez que mudas de idioma (nos botões EN/PT/ES ou aqui) grava-se na conta.
- **Palavra-passe:** o botão envia para o **teu** email o link para a redefinir (o mesmo fluxo de «esqueci-me da palavra-passe»). Cada pessoa só altera o **seu** perfil: o servidor usa a sessão, nunca um identificador vindo do pedido.

## Equipa e papéis (só admin)
- Lista a equipa e permite mudar o papel (administrador, comercial, leitura).
- **Duas travas:** ninguém muda o **próprio** papel, e tem de ficar sempre **pelo menos um administrador**.
- **Acrescentar pessoas ainda não é automático:** cria a conta no Supabase (*Authentication → Users*) e acrescenta a pessoa à tabela `utilizadores`. Convites por email ficam para mais tarde.

## Integrações (só sim ou não)
Mostra se estão configuradas a IA, o email (SMTP), o WhatsApp (API, webhook e conta business), a versão da API do WhatsApp, os 10 modelos de IA em uso e o endereço público.
**Nunca mostra chaves, tokens nem palavras-passe** (um teste confirma que nenhum segredo sai na resposta). Tudo isto se muda no ficheiro `.env`.
- Se o `APP_URL` é local (`localhost`), aparece um aviso: os links de recuperação de palavra-passe e o webhook do WhatsApp precisam de um endereço público (https).

## Limites em vigor
Os limites diários por canal (com o nome da variável do `.env` para os mudar), os dias entre mensagens, os follow-ups, o descanso de 90 dias, os rascunhos de IA por hora e os limites de ficheiros. Só se veem; mudam-se no `.env`.

## Mensagens do servidor no teu idioma
O servidor já responde no idioma da interface (erros de validação, avisos linha a linha da importação, etc.). O browser envia o idioma no cabeçalho `X-Idioma` e o dicionário está em
`routes/services/messages.service.js`. Se acrescentares uma mensagem nova ao código sem a traduzir, **o teste das definições falha** (percorre o código e confirma que todas as mensagens fixas têm tradução em inglês e espanhol).
