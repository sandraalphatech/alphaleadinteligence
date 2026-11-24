# Página Dados: importar, exportar, fontes e não contactar

Não é preciso correr nenhum SQL: usa as tabelas que já existem.

## Importar (CSV)
1. **Dados → Importar → Descarregar modelo** dá um ficheiro de exemplo. No Excel: *Guardar como → CSV* (serve «;» ou «,»; acentos do Excel em português também funcionam).
2. **Escolher um ficheiro CSV.** Vês a **pré-visualização** antes de gravar qualquer coisa: quantas empresas são novas, quais já existem, quais estão repetidas no ficheiro,
   quais estão em «Não contactar» e quais são inválidas, com o motivo de cada linha.
3. **Importar N empresas novas.** O servidor volta a analisar o ficheiro ao gravar (não confia na pré-visualização do browser).

**Colunas** (só o nome é obrigatório; os nomes aceites vêm em português, inglês e espanhol, com ou sem acentos):
`nome`, `site`, `país`, `idioma`, `setor`, `cidade`, `descrição`, `email`, `telefone`, `linkedin`, `instagram`, `whatsapp`,
e a pessoa de contacto: `contacto`, `cargo`, `email do contacto`, `linkedin do contacto`. Colunas desconhecidas são ignoradas (e listadas).

**Regras**
- País: código (PT) ou nome (Portugal, Spain, Espanha…). Idioma: pt, en ou es. Setor: um dos do Radar (fintech, saas…).
- Dados inválidos (email, telefone sem indicativo, site, LinkedIn…) **não se gravam**: ficam em branco e a linha mostra um aviso.
- **Nunca altera empresas que já existem.** Uma linha é «já existe» se o site é o mesmo ou o nome (normalizado) é o mesmo no mesmo país.
  Se a empresa que já existe está em «Não contactar», a linha fica marcada assim.
- Cada empresa nova entra com um lead em **«Novo»**, a fonte **«Importação: ficheiro (data)»** e a pessoa de contacto (se vier) como decisor. A análise e o enriquecimento fazem-se depois, pelo fluxo normal.
- Limites: 5000 linhas e 1,8 MB por ficheiro. Os emails das empresas novas têm o domínio verificado (se recebe correio) ao gravar.

## Exportar (CSV)
Leads (com filtro por estado; até 600, como o quadro), empresas, pessoas de contacto, interações e «Não contactar». O ficheiro abre direto no Excel
(UTF-8 com «;»; podes escolher «,» ou tabulação). O texto das mensagens só sai se marcares «Incluir o texto das mensagens».
Os valores que o Excel executaria como fórmula (começados por `=`, `+`, `-` ou `@`) levam um apóstrofo à frente, por segurança.
Só os papéis **admin** e **comercial** exportam (contactos são dados pessoais).

## Fontes
Mostra de onde vem cada empresa (Radar e importações), quantas trouxe e a última atividade. As fontes do Radar **ligam-se e desligam-se** (só o admin):
uma fonte desligada deixa de ser lida nas recolhas seguintes (e, se todas estiverem desligadas, a recolha recusa começar). O Reddit está desligado de propósito: exige a API oficial.

## Não contactar
Empresas e pessoas a quem a plataforma nunca escreve (as regras de envio recusam-nas em todos os canais).
- **Acrescentar uma empresa:** procura pelo nome. Os leads dela passam a «Não contactar» e as tarefas abertas fecham-se.
- Aparecem também as que pediram **PARAR no WhatsApp** (marcadas automaticamente) e as marcadas à mão, com a data e como.
- **Remover** só o **admin** pode (levantar um bloqueio pode ir contra o pedido de uma pessoa). Os leads que estavam em «Não contactar» voltam a «Analisado».
