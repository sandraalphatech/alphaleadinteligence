// Tradução das mensagens que o servidor devolve ao utilizador (erros de validação, avisos da importação, etc.).
// O código dos serviços escreve as mensagens em português; aqui traduzem-se para o idioma de quem fez o pedido (cabeçalho X-Idioma, que o
// browser envia a partir do idioma escolhido). Uma mensagem que não esteja aqui sai como está (em português), por isso nada se perde.
// Há um teste que percorre o código e garante que todas as mensagens fixas têm tradução.

// [português, inglês, espanhol]
const FIXAS = [
    ['Contacto bloqueado.', 'Contact blocked.', 'Contacto bloqueado.'],
    ['Esta resposta acabou de ser enviada.', 'This reply was just sent.', 'Esta respuesta acaba de enviarse.'],
    ['Limite diário de respostas atingido.', 'Daily reply limit reached.', 'Límite diario de respuestas alcanzado.'],
    ['A base de dados ainda não está pronta para as propostas (corra database/proposals.sql).', 'The database is not ready for proposals yet (run database/proposals.sql).', 'La base de datos aún no está lista para las propuestas (ejecute database/proposals.sql).'],
    ['A base de dados ainda não está pronta para o WhatsApp (corra database/whatsapp.sql).', 'The database is not ready for WhatsApp yet (run database/whatsapp.sql).', 'La base de datos aún no está lista para WhatsApp (ejecute database/whatsapp.sql).'],
    ['A base de dados ainda não está pronta para as análises (corra database/monthly-analysis.sql).', 'The database is not ready for analyses yet (run database/monthly-analysis.sql).', 'La base de datos aún no está lista para los análisis (ejecute database/monthly-analysis.sql).'],
    ['A base de dados ainda não está pronta para as definições (corra database/settings.sql).', 'The database is not ready for settings yet (run database/settings.sql).', 'La base de datos aún no está lista para los ajustes (ejecute database/settings.sql).'],
    ['Destinatário inválido.', 'Invalid recipient.', 'Destinatario no válido.'],
    ['A data de início não é válida.', 'The start date is not valid.', 'La fecha de inicio no es válida.'],
    ['Canal inválido.', 'Invalid channel.', 'Canal no válido.'],
    ['Data inválida.', 'Invalid date.', 'Fecha no válida.'],
    ['Hora inválida.', 'Invalid time.', 'Hora no válida.'],
    ['A leitura das respostas por email não está configurada.', 'Reading email replies is not set up.', 'La lectura de las respuestas por correo no está configurada.'],
    ['O Google Calendar ainda não está configurado (faltam as credenciais no .env).', 'Google Calendar is not set up yet (the credentials are missing from .env).', 'Google Calendar aún no está configurado (faltan las credenciales en .env).'],
    ['O Google Calendar não está ligado.', 'Google Calendar is not connected.', 'Google Calendar no está conectado.'],
    ['A autorização do Google expirou: ligue outra vez.', 'The Google authorisation has expired: connect again.', 'La autorización de Google ha caducado: conecte de nuevo.'],
    ['Intervalo de datas inválido.', 'Invalid date range.', 'Intervalo de fechas no válido.'],
    ['A base de dados ainda não está pronta para o Google Calendar (corra database/google.sql e database/tasks.sql).', 'The database is not ready for Google Calendar yet (run database/google.sql and database/tasks.sql).', 'La base de datos aún no está lista para Google Calendar (ejecute database/google.sql y database/tasks.sql).'],
    ['A base de dados ainda não está pronta para o Google Calendar (corra database/google.sql).', 'The database is not ready for Google Calendar yet (run database/google.sql).', 'La base de datos aún no está lista para Google Calendar (ejecute database/google.sql).'],
    ['O pedido de ligação expirou ou não é válido: tente outra vez.', 'The connection request has expired or is not valid: try again.', 'La solicitud de conexión ha caducado o no es válida: inténtelo de nuevo.'],
    ['A ligação ao Google Calendar foi cancelada.', 'The connection to Google Calendar was cancelled.', 'La conexión con Google Calendar se canceló.'],
    ['O Google não aceitou a autorização.', 'Google did not accept the authorisation.', 'Google no aceptó la autorización.'],
    ['O Google não devolveu a autorização permanente: remova o acesso da aplicação na conta Google e ligue outra vez.', 'Google did not return the permanent authorisation: remove the app’s access in the Google account and connect again.', 'Google no devolvió la autorización permanente: quite el acceso de la aplicación en la cuenta de Google y conecte de nuevo.'],
    ['Faltou autorizar o acesso aos eventos do calendário: ligue outra vez e marque a permissão.', 'Access to calendar events was not authorised: connect again and tick the permission.', 'Faltó autorizar el acceso a los eventos del calendario: conecte de nuevo y marque el permiso.'],
    ['Cliente não encontrado.', 'Client not found.', 'Cliente no encontrado.'],
    ['Só se criam contratos para clientes (negócio fechado).', 'Contracts can only be created for clients (closed deals).', 'Solo se crean contratos para clientes (negocio cerrado).'],
    ['Escolha o idioma do contrato.', 'Choose the contract language.', 'Elija el idioma del contrato.'],
    ['Acrescente pelo menos um serviço ao contrato.', 'Add at least one service to the contract.', 'Añada al menos un servicio al contrato.'],
    ['O contrato precisa de um título.', 'The contract needs a title.', 'El contrato necesita un título.'],
    ['A data de fim não pode ser anterior à de início.', 'The end date cannot be before the start date.', 'La fecha de fin no puede ser anterior a la de inicio.'],
    ['O email indicado não é válido.', 'The email address is not valid.', 'El correo electrónico no es válido.'],
    ['O IBAN indicado não é válido.', 'The IBAN is not valid.', 'El IBAN no es válido.'],
    ['A data de fim não é válida.', 'The end date is not valid.', 'La fecha de fin no es válida.'],
    ['A data do contrato não é válida.', 'The contract date is not valid.', 'La fecha del contrato no es válida.'],
    ['A data de assinatura não é válida.', 'The signature date is not valid.', 'La fecha de firma no es válida.'],
    ['A data de assinatura não pode estar no futuro.', 'The signature date cannot be in the future.', 'La fecha de firma no puede estar en el futuro.'],
    ['Contrato não encontrado.', 'Contract not found.', 'Contrato no encontrado.'],
    ['A base de dados ainda não está pronta para os contratos (corra database/clients.sql).', 'The database is not ready for contracts yet (run database/clients.sql).', 'La base de datos aún no está lista para los contratos (ejecute database/clients.sql).'],
    ['O armazenamento dos contratos ainda não está pronto (corra database/clients.sql).', 'Contract storage is not ready yet (run database/clients.sql).', 'El almacenamiento de los contratos aún no está listo (ejecute database/clients.sql).'],
    ['O contrato já foi emitido: reabra-o como rascunho para o editar.', 'The contract has already been issued: reopen it as a draft to edit it.', 'El contrato ya se emitió: reábralo como borrador para editarlo.'],
    ['O contrato já foi emitido.', 'The contract has already been issued.', 'El contrato ya se emitió.'],
    ['Faltam dados para emitir o contrato: preencha as partes (nome, NIF, morada e representante) e a data de início.', 'Some data is missing to issue the contract: fill in the parties (name, tax ID, address and representative) and the start date.', 'Faltan datos para emitir el contrato: complete las partes (nombre, NIF, domicilio y representante) y la fecha de inicio.'],
    ['O contrato já está assinado: remova primeiro o ficheiro assinado.', 'The contract is already signed: remove the signed file first.', 'El contrato ya está firmado: elimine primero el archivo firmado.'],
    ['Este contrato não tem ficheiro assinado.', 'This contract has no signed file.', 'Este contrato no tiene archivo firmado.'],
    ['Escolha o ficheiro do contrato assinado.', 'Choose the signed contract file.', 'Elija el archivo del contrato firmado.'],
    ['O ficheiro é demasiado grande (máximo 10 MB).', 'The file is too large (maximum 10 MB).', 'El archivo es demasiado grande (máximo 10 MB).'],
    ['O ficheiro tem de ser um PDF, PNG ou JPG.', 'The file must be a PDF, PNG or JPG.', 'El archivo debe ser PDF, PNG o JPG.'],
    ['Escolha o idioma da proposta.', 'Choose the proposal language.', 'Elija el idioma de la propuesta.'],
    ['Esse mês é demasiado antigo.', 'That month is too far back.', 'Ese mes es demasiado antiguo.'],
    ['Esta fonte ainda não tem conector na plataforma (o Reddit, por exemplo, exige a API oficial).', 'This source has no connector on the platform yet (Reddit, for example, requires the official API).', 'Esta fuente aún no tiene conector en la plataforma (Reddit, por ejemplo, exige la API oficial).'],
    ['Estado inválido.', 'Invalid status.', 'Estado no válido.'],
    ['Idioma inválido.', 'Invalid language.', 'Idioma no válido.'],
    ['Não encontrei a coluna com o nome da empresa. Chama-lhe «nome», «name» ou «empresa».', 'I could not find the column with the company name. Call it “name”, “nome” or “empresa”.', 'No encontré la columna con el nombre de la empresa. Llámela «nombre», «name» o «empresa».'],
    ['Não há relatórios de meses que ainda não começaram.', 'There are no reports for months that have not started yet.', 'No hay informes de meses que aún no han empezado.'],
    ['O mês tem de ter o formato AAAA-MM.', 'The month must use the format YYYY-MM.', 'El mes debe tener el formato AAAA-MM.'],
    ['Passo inválido.', 'Invalid step.', 'Paso no válido.'],
    ['Responsável inválido.', 'Invalid owner.', 'Responsable no válido.'],
    ['Só as fontes do Radar se ligam e desligam; as importações são registos do que entrou.', 'Only Radar sources can be turned on or off; imports are records of what came in.', 'Solo las fuentes del Radar se activan y desactivan; las importaciones son registros de lo que entró.'],
    ['Tipo de exportação desconhecido.', 'Unknown export type.', 'Tipo de exportación desconocido.'],
    ['Tipo de tarefa inválido.', 'Invalid task type.', 'Tipo de tarea no válido.'],
    ['A Meta limitou os envios. Tente mais tarde.', 'Meta has limited sending. Try again later.', 'Meta ha limitado los envíos. Inténtelo más tarde.'],
    ['A mensagem é demasiado longa.', 'The message is too long.', 'El mensaje es demasiado largo.'],
    ['A nota do convite tem de ter no máximo 300 caracteres.', 'The invitation note can have at most 300 characters.', 'La nota de la invitación puede tener como máximo 300 caracteres.'],
    ['Empresa não encontrada.', 'Company not found.', 'Empresa no encontrada.'], ['Fonte não encontrada.', 'Source not found.', 'Fuente no encontrada.'],
    ['Lead não encontrado.', 'Lead not found.', 'Lead no encontrado.'], ['Pessoa não encontrada.', 'Person not found.', 'Persona no encontrada.'],
    ['Proposta não encontrada.', 'Proposal not found.', 'Propuesta no encontrada.'], ['Tarefa não encontrada.', 'Task not found.', 'Tarea no encontrada.'],
    ['A mensagem tem um marcador por preencher.', 'The message has a placeholder left to fill in.', 'El mensaje tiene un marcador sin rellenar.'],
    ['A proposta precisa de um título.', 'The proposal needs a title.', 'La propuesta necesita un título.'],
    ['A resposta está vazia.', 'The reply is empty.', 'La respuesta está vacía.'],
    ['A resposta tem um marcador por preencher.', 'The reply has a placeholder left to fill in.', 'La respuesta tiene un marcador sin rellenar.'],
    ['Acrescente pelo menos um serviço à proposta.', 'Add at least one service to the proposal.', 'Añada al menos un servicio a la propuesta.'],
    ['Cada serviço precisa de um nome.', 'Every service needs a name.', 'Cada servicio necesita un nombre.'],
    ['Escolha primeiro os serviços da proposta.', 'Choose the proposal services first.', 'Elija primero los servicios de la propuesta.'],
    ['Escreva o que aconteceu.', 'Write what happened.', 'Escriba lo que ocurrió.'],
    ['Este mês ainda não tem atividade para analisar.', 'This month has no activity to analyse yet.', 'Este mes aún no tiene actividad para analizar.'],
    ['Falta o texto.', 'The text is missing.', 'Falta el texto.'], ['Falta o título da tarefa.', 'The task title is missing.', 'Falta el título de la tarea.'],
    ['Falta preencher uma das variáveis da mensagem.', 'One of the message variables is empty.', 'Falta rellenar una de las variables del mensaje.'],
    ['Nada para alterar.', 'Nothing to change.', 'Nada que cambiar.'],
    ['A API do WhatsApp recusou as credenciais.', 'The WhatsApp API rejected the credentials.', 'La API de WhatsApp rechazó las credenciales.'],
    ['O envio pela API do WhatsApp não está configurado.', 'Sending through the WhatsApp API is not configured.', 'El envío por la API de WhatsApp no está configurado.'],
    ['A API do WhatsApp não aceitou a mensagem.', 'The WhatsApp API did not accept the message.', 'La API de WhatsApp no aceptó el mensaje.'],
    ['A API do WhatsApp não devolveu o identificador da mensagem.', 'The WhatsApp API did not return the message identifier.', 'La API de WhatsApp no devolvió el identificador del mensaje.'],
    ['Não foi possível contactar a API do WhatsApp.', 'Could not reach the WhatsApp API.', 'No se pudo contactar con la API de WhatsApp.'],
    ['A janela de 24 horas já fechou: só se podem enviar modelos aprovados.', 'The 24-hour window has closed: only approved templates can be sent.', 'La ventana de 24 horas se cerró: solo se pueden enviar plantillas aprobadas.'],
    ['A Meta recusou o modelo (nome, idioma, texto ou aprovação).', 'Meta rejected the template (name, language, text or approval).', 'Meta rechazó la plantilla (nombre, idioma, texto o aprobación).'],
    ['Esse modelo não existe ou ainda não está aprovado.', 'That template does not exist or is not approved yet.', 'Esa plantilla no existe o aún no está aprobada.'],
    ['Nenhum modelo está aprovado para este idioma.', 'No template is approved for this language.', 'Ninguna plantilla está aprobada para este idioma.'],
    ['Não há nenhum modelo de mensagem para este idioma.', 'There is no message template for this language.', 'No hay ninguna plantilla de mensaje para este idioma.'],
    ['Este número não tem WhatsApp ou não pode receber a mensagem.', 'This number has no WhatsApp or cannot receive the message.', 'Este número no tiene WhatsApp o no puede recibir el mensaje.'],
    ['Em modo de teste só se pode enviar para números verificados na Meta.', 'In test mode you can only send to numbers verified on Meta.', 'En modo de prueba solo se puede enviar a números verificados en Meta.'],
    ['O ficheiro está vazio.', 'The file is empty.', 'El archivo está vacío.'],
    ['O ficheiro precisa de uma linha de cabeçalho e pelo menos uma linha de dados.', 'The file needs a header row and at least one data row.', 'El archivo necesita una fila de encabezado y al menos una fila de datos.'],
    ['O ficheiro tem aspas por fechar.', 'The file has an unclosed quote.', 'El archivo tiene comillas sin cerrar.'],
    ['Falta preencher uma das variáveis da mensagem.', 'One of the message variables is empty.', 'Falta rellenar una de las variables del mensaje.'],
    ['Todas as fontes estão desligadas. Liga uma em Dados → Fontes.', 'All sources are turned off. Turn one on in Data → Sources.', 'Todas las fuentes están desactivadas. Active una en Datos → Fuentes.'],
    ['Não foi possível concluir a operação.', 'Could not complete the operation.', 'No se pudo completar la operación.'],
    ['Não foi possível gerar o relatório.', 'Could not generate the report.', 'No se pudo generar el informe.'],
    ['O serviço de IA não está disponível neste momento.', 'The AI service is not available right now.', 'El servicio de IA no está disponible en este momento.'],
    ['A IA não devolveu um texto utilizável. Tente outra vez.', 'The AI did not return usable text. Try again.', 'La IA no devolvió un texto utilizable. Inténtelo de nuevo.'],
    ['A IA não devolveu uma análise utilizável. Tente outra vez.', 'The AI did not return a usable analysis. Try again.', 'La IA no devolvió un análisis utilizable. Inténtelo de nuevo.'],
    ['A IA não devolveu um rascunho utilizável. Tente outra vez.', 'The AI did not return a usable draft. Try again.', 'La IA no devolvió un borrador utilizable. Inténtelo de nuevo.'],
    ['Muitos rascunhos numa hora. Tente mais tarde.', 'Too many drafts in an hour. Try again later.', 'Demasiados borradores en una hora. Inténtelo más tarde.'],
    ['Sem permissão.', 'Not allowed.', 'Sin permiso.'], ['Sem permissão para esta acção.', 'You are not allowed to do this.', 'No tiene permiso para esta acción.'],
    ['Sessão não iniciada.', 'Not signed in.', 'Sesión no iniciada.'], ['Sessão inválida ou expirada.', 'Invalid or expired session.', 'Sesión no válida o caducada.'],
    ['Utilizador sem perfil na plataforma.', 'User without a profile on the platform.', 'Usuario sin perfil en la plataforma.'],
    ['O nome tem de ter entre 2 e 80 caracteres.', 'The name must have between 2 and 80 characters.', 'El nombre debe tener entre 2 y 80 caracteres.'],
    ['Papel inválido.', 'Invalid role.', 'Rol no válido.'], ['Utilizador não encontrado.', 'User not found.', 'Usuario no encontrado.'],
    ['Não pode alterar o seu próprio papel.', 'You cannot change your own role.', 'No puede cambiar su propio rol.'],
    ['Tem de haver pelo menos um administrador.', 'There must be at least one admin.', 'Tiene que haber al menos un administrador.'],
    ["Negócio não encontrado.", "Deal not found.", "Negocio no encontrado."],
    ["O título do negócio é obrigatório.", "The deal title is required.", "El título del negocio es obligatorio."],
    ["Escolha a empresa do negócio.", "Choose the deal’s company.", "Elija la empresa del negocio."],
    ["Esta empresa está em «Não contactar»: não se criam negócios para ela.", "This company is in “Do not contact”: deals cannot be created for it.", "Esta empresa está en «No contactar»: no se crean negocios para ella."],
    ["O negócio já está fechado.", "The deal is already closed.", "El negocio ya está cerrado."],
    ["O negócio não está fechado.", "The deal is not closed.", "El negocio no está cerrado."],
    ["Moeda inválida.", "Invalid currency.", "Moneda no válida."],
    ["Etapa inválida.", "Invalid stage.", "Etapa no válida."],
    ["A data prevista não é válida.", "The expected date is not valid.", "La fecha prevista no es válida."],
    ["O valor não é válido.", "The amount is not valid.", "El importe no es válido."],
    ["A base de dados ainda não está pronta para os negócios (corra database/deals.sql).", "The database is not ready for deals yet (run database/deals.sql).", "La base de datos aún no está lista para los negocios (ejecute database/deals.sql)."],
    ["Planeamento inválido.", "Invalid planner column.", "Columna del planificador no válida."],
    ["A base de dados ainda não está pronta para as tarefas (corra database/tasks.sql).", "The database is not ready for tasks yet (run database/tasks.sql).", "La base de datos aún no está lista para las tareas (ejecute database/tasks.sql)."],
    ["Só se criam propostas para leads em «reunião agendada» ou «enviar proposta».", "Proposals can only be created for leads in “Meeting scheduled” or “Send proposal”.", "Solo se crean propuestas para leads en «Reunión agendada» o «Enviar propuesta»."],
    ['Só os administradores podem fazer isto.', 'Only admins can do this.', 'Solo los administradores pueden hacer esto.'],
    ['Assinatura demasiado longa.', 'Signature is too long.', 'La firma es demasiado larga.'],
    ['A assinatura ainda não pode ser guardada.', 'The signature cannot be saved yet.', 'La firma aún no se puede guardar.'],
    ['Falta o assunto ou a mensagem.', 'The subject or the message is missing.', 'Falta el asunto o el mensaje.'],
    ['O envio direto não está configurado.', 'Direct sending is not set up.', 'El envío directo no está configurado.'],
    ['O envio direto não está configurado (faltam SMTP_USER e SMTP_PASS no .env).', 'Direct sending is not set up (SMTP_USER and SMTP_PASS are missing from .env).', 'El envío directo no está configurado (faltan SMTP_USER y SMTP_PASS en .env).'],
    ['Já existe uma recolha em curso.', 'A collection is already running.', 'Ya hay una recopilación en curso.'],
    ['Demasiadas tentativas. Aguarde alguns minutos e tente de novo.', 'Too many attempts. Wait a few minutes and try again.', 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.']
];
const EXATAS =new Map(FIXAS.map(([pt, en, es]) => [pt, { en, es }]));

// Mensagens com valores lá dentro. Cada padrão devolve a tradução para en e es.
const NOMES_VALOR = { valor: ['amount', 'El importe'], percentagem: ['percentage', 'El porcentaje'], desconto: ['discount', 'El descuento'], 'prazo de validade': ['validity period', 'El plazo de validez'], 'prazo do contrato': ['contract length', 'La duración del contrato'], 'duração do contrato': ['contract duration', 'La duración del contrato'], 'prazo de aviso': ['notice period', 'El plazo de aviso'], 'prazo de aprovação': ['approval period', 'El plazo de aprobación'], 'número de revisões': ['number of revisions', 'El número de revisiones'], 'prazo de confidencialidade': ['confidentiality period', 'El plazo de confidencialidad'], 'percentagem de entrada': ['deposit percentage', 'El porcentaje de entrada'], 'prazo de pagamento': ['payment term', 'El plazo de pago'] };
const PADROES = [
    [/^O (valor de «.+»|valor|percentagem|desconto|prazo de validade|prazo do contrato|duração do contrato|prazo de aviso|prazo de aprovação|número de revisões|prazo de confidencialidade|percentagem de entrada|prazo de pagamento) não é válido\.$/, (m) => {
        const k = m[1], v = k.match(/^valor de «(.+)»$/);
        if (v) return { en: `The amount of “${v[1]}” is not valid.`, es: `El importe de «${v[1]}» no es válido.` };
        return { en: `The ${NOMES_VALOR[k][0]} is not valid.`, es: `${NOMES_VALOR[k][1]} no es válido.` };
    }],
    [/^A resposta tem mais de (\d+) caracteres\.$/, (m) => ({ en: `The reply has more than ${m[1]} characters.`, es: `La respuesta tiene más de ${m[1]} caracteres.` })],
    [/^Uma das variáveis tem mais de (\d+) caracteres\.$/, (m) => ({ en: `One of the variables has more than ${m[1]} characters.`, es: `Una de las variables tiene más de ${m[1]} caracteres.` })],
    [/^O ficheiro tem demasiadas colunas \(máximo (\d+)\)\.$/, (m) => ({ en: `The file has too many columns (maximum ${m[1]}).`, es: `El archivo tiene demasiadas columnas (máximo ${m[1]}).` })],
    // linhas da importação
    [/^falta o nome da empresa$/, () => ({ en: 'the company name is missing', es: 'falta el nombre de la empresa' })],
    [/^site «(.*)» não é válido \(ficou em branco\)$/, (m) => ({ en: `website “${m[1]}” is not valid (left blank)`, es: `sitio web «${m[1]}» no es válido (quedó en blanco)` })],
    [/^país «(.*)» não reconhecido$/, (m) => ({ en: `country “${m[1]}” not recognised`, es: `país «${m[1]}» no reconocido` })],
    [/^país «(.*)» desconhecido$/, (m) => ({ en: `country “${m[1]}” unknown`, es: `país «${m[1]}» desconocido` })],
    [/^idioma «(.*)» não suportado \(usa pt, en ou es\)$/, (m) => ({ en: `language “${m[1]}” not supported (use pt, en or es)`, es: `idioma «${m[1]}» no admitido (use pt, en o es)` })],
    [/^setor «(.*)» não reconhecido \(ficou em branco\)$/, (m) => ({ en: `sector “${m[1]}” not recognised (left blank)`, es: `sector «${m[1]}» no reconocido (quedó en blanco)` })],
    [/^email «(.*)» não é válido \(ficou em branco\)$/, (m) => ({ en: `email “${m[1]}” is not valid (left blank)`, es: `email «${m[1]}» no es válido (quedó en blanco)` })],
    [/^telefone «(.*)» não é válido \(precisa do indicativo, ex\.: \+351…\)$/, (m) => ({ en: `phone “${m[1]}” is not valid (it needs the country code, e.g. +351…)`, es: `teléfono «${m[1]}» no es válido (necesita el prefijo, p. ej. +351…)` })],
    [/^LinkedIn da empresa inválido \(tem de ser linkedin\.com\/company\/…\)$/, () => ({ en: 'company LinkedIn is not valid (it must be linkedin.com/company/…)', es: 'LinkedIn de la empresa no válido (debe ser linkedin.com/company/…)' })],
    [/^Instagram inválido$/, () => ({ en: 'Instagram is not valid', es: 'Instagram no válido' })],
    [/^WhatsApp inválido \(precisa do indicativo, ex\.: \+351…\)$/, () => ({ en: 'WhatsApp is not valid (it needs the country code, e.g. +351…)', es: 'WhatsApp no válido (necesita el prefijo, p. ej. +351…)' })],
    [/^email do contacto inválido \(ficou em branco\)$/, () => ({ en: 'contact email is not valid (left blank)', es: 'email del contacto no válido (quedó en blanco)' })],
    [/^LinkedIn do contacto inválido \(tem de ser linkedin\.com\/in\/…\)$/, () => ({ en: 'contact LinkedIn is not valid (it must be linkedin.com/in/…)', es: 'LinkedIn del contacto no válido (debe ser linkedin.com/in/…)' })],
    [/^há dados de contacto sem o nome da pessoa \(ignorados\)$/, () => ({ en: 'there are contact details without the person’s name (ignored)', es: 'hay datos de contacto sin el nombre de la persona (ignorados)' })],
    [/^«(.*)» já existe e está em «Não contactar»$/, (m) => ({ en: `“${m[1]}” already exists and is in “Do not contact”`, es: `«${m[1]}» ya existe y está en «No contactar»` })],
    [/^já existe na plataforma \(«(.*)»\)$/, (m) => ({ en: `already exists on the platform (“${m[1]}”)`, es: `ya existe en la plataforma («${m[1]}»)` })],
    [/^repetida no ficheiro \(linha (\d+)\)$/, (m) => ({ en: `repeated in the file (line ${m[1]})`, es: `repetida en el archivo (línea ${m[1]})` })]
];

function traduzir(mensagem, idioma) {
    if (typeof mensagem !== 'string' || !['en', 'es'].includes(idioma)) return mensagem;
    const exata = EXATAS.get(mensagem);
    if (exata) return exata[idioma];
    for (const [re, f] of PADROES) { const m = re.exec(mensagem); if (m) return f(m)[idioma]; }
    return mensagem;
}
const IDIOMAS = ['pt', 'en', 'es'];
function idiomaDoPedido(req) {
    const h = String(req?.headers?.['x-idioma'] || '').toLowerCase();
    return IDIOMAS.includes(h) ? h : 'pt';
}
// Middleware: guarda o idioma do pedido em res.locals.idioma, para os responderErro() de cada rota o usarem.
function guardarIdioma(req, res, next) { res.locals.idioma = idiomaDoPedido(req); next(); }

module.exports = { traduzir, idiomaDoPedido, guardarIdioma, FIXAS, PADROES, EXATAS };
