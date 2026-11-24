# Google Calendar ↔ Tarefas

O calendário das **Tarefas** fala com o Google Calendar nos dois sentidos:

- **Tarefas → Google:** cada **reunião** (tarefa do tipo «reunião») e cada tarefa **com hora** ganha um evento no calendário ligado. Reunião sem hora = evento de dia inteiro; com hora = **1 hora** (mude com `GOOGLE_DURACAO_MIN`). Alterar o dia ou a hora da tarefa atualiza o evento; apagar a tarefa apaga o evento; quando o lead passa a «oportunidade perdida» ou «não contactar», as reuniões marcadas saem do Google. Tarefas concluídas e reuniões que já aconteceram **ficam** no Google. **Ninguém é convidado**: os eventos só existem no calendário ligado.
- **Google → Tarefas:** o calendário das Tarefas mostra os eventos do Google (a cinzento, só leitura; clicar abre-o no Google), exceto os que a própria plataforma criou.
- O Google nunca bloqueia nada: se falhar, a tarefa grava-se na mesma e o erro aparece junto ao botão do Google.

## Configurar (uma vez)

1. **Base de dados:** correr `database/google.sql` (e `database/tasks.sql`, que tem a coluna da hora) no Supabase.
2. **Google Cloud** (com a conta `o-teu-email@gmail.com`), em <https://console.cloud.google.com>:
   1. Criar um projeto (por exemplo «Alpha Tech Leads») **com a conta da Alpha Tech**, nunca com uma conta pessoal.
   2. **APIs e serviços → Biblioteca →** «Google Calendar API» → **Ativar**.
   3. **Ecrã de consentimento OAuth:** tipo **Externo**; nome da aplicação e email de apoio; em **Utilizadores de teste** adicionar `o-teu-email@gmail.com`; em **Âmbitos** adicionar `.../auth/calendar.events`.
   4. **Credenciais → Criar credenciais → ID de cliente OAuth →** tipo **Aplicação Web**. Em **URIs de redirecionamento autorizados** pôr o endereço da aplicação seguido de `/api/google/callback`, por exemplo `http://localhost:3000/api/google/callback` (e o de produção: `https://leadintelligence-q06k.onrender.com/api/google/callback`).
   5. Copiar o **ID de cliente** e o **segredo de cliente**.
   6. **Publicar a aplicação** («Em produção», no ecrã de consentimento): enquanto estiver «Em teste», o Google **revoga a ligação ao fim de 7 dias**. Para uso próprio não é preciso verificação: no ecrã de aviso do Google, escolher «Avançadas → Ir para (nome da aplicação)».
3. **`.env`** (nunca partilhe nem comite estes valores):
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
   # opcionais
   GOOGLE_LOGIN_HINT=o-teu-email@gmail.com
   GOOGLE_TIMEZONE=Europe/Lisbon
   GOOGLE_CALENDAR_ID=primary
   GOOGLE_DURACAO_MIN=60
   APP_URL=http://localhost:3000
   ```
   `APP_URL` serve para pôr no evento uma ligação de volta ao lead.
4. Reiniciar o servidor.
5. Na página **Tarefas**, um **administrador** clica em **Ligar Google Calendar**, autoriza com a conta `o-teu-email@gmail.com` e volta à página. Depois, **Sincronizar agora** envia as reuniões e tarefas com hora que já existiam.

## Segurança

- O token fica **cifrado** (AES-256-GCM) na tabela `google_ligacao`, que não tem políticas de acesso: só o servidor lê. Nunca vai para o browser.
- Pede-se **só** a permissão de eventos do calendário (`calendar.events`), não a de gerir calendários nem a de contactos.
- O regresso do Google usa um `state` assinado que expira em 10 minutos.
- **Desligar** revoga a autorização no Google e apaga a ligação (os eventos já criados ficam no Google).

## API

`GET /api/google/estado`, `POST /api/google/ligar`, `GET /api/google/callback` (regresso do Google), `POST /api/google/desligar`, `POST /api/google/sincronizar`, `GET /api/google/eventos?de=AAAA-MM-DD&ate=AAAA-MM-DD`. Ligar, desligar e sincronizar: só administradores.
