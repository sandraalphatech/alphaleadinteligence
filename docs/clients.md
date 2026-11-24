# Clientes e contratos

Página **Clientes** (`/assets/pages/clients.html`, menu entre «Negócios» e «Tarefas»): os clientes ganhos (leads em «negócio fechado»), o contrato de prestação de serviços de cada um e o que propor a seguir.

## Passos (uma vez)

1. Correr **`database/clients.sql`** no Supabase: cria a tabela `contratos` e o bucket privado `contratos` (onde ficam os contratos assinados).
2. Preencher **`config/contract-defaults.json`**: o **NIF/NIPC** e a **morada completa** da Alpha Tech (e, se quiser, o IBAN). Entram em todos os contratos novos; no formulário podem ser alterados caso a caso. Sem NIF e morada o contrato não pode ser emitido.
3. Reiniciar o servidor.
4. Recomendado: um advogado rever **uma vez** o texto-modelo (`assets/js/contract-render.js`). É um modelo sólido, mas não substitui aconselhamento jurídico.

## A página

- **Lista**: cliente, cliente desde, valor ganho, estado do contrato, início do serviço e fim previsto (com aviso «em N dias»). Filtros: Todos, Sem contrato, Rascunho, Contrato enviado, Assinado, A terminar (≤ 60 dias).
- **Ficha do cliente**: contratos (abrir, PDF, ver o assinado), **Novo contrato** (em branco ou a partir de uma proposta), **sugestões de propostas futuras** e as propostas feitas.
- **Contrato** (formulário + pré-visualização ao vivo): partes, serviços e preços, prazo e condições, pagamento, opções (RGPD) e cláusulas adicionais.

## Estados do contrato

`Rascunho → Enviado → Assinado`

- **Rascunho**: editável. **Marcar como enviado** exige as partes completas (nome, NIF, morada e representante de cada uma) e a data de início; depois de enviado já não se edita (pode **reabrir como rascunho**).
- **Anexar contrato assinado** (PDF, PNG ou JPG até 10 MB, validado pelo conteúdo) com a data de assinatura: o contrato passa a **Assinado**. Substituir apaga o ficheiro anterior; remover volta a «enviado».
- O envio ao cliente faz-se por fora (PDF por email ou WhatsApp): a plataforma regista o estado.

## O contrato

Gerado em PT, EN ou ES, A4, com logo, número (`NS-C-AAAA-NNNN`), partes, considerandos, 19–21 cláusulas numeradas, assinaturas e anexos:

- Cláusulas: objeto, execução, obrigações de cada parte, revisões e aprovações, **condições específicas por serviço** (website, redes sociais, design, sistemas, automação e IA, marketing digital), preço e pagamento (juros de mora, suspensão, custos de terceiros, remuneração sobre resultados), duração e renovação, cessação, propriedade intelectual, confidencialidade, **RGPD** (artigo 28.º, Anexo III), responsabilidade (obrigação de meios, limite), independência, força maior, comunicações, cessão, disposições gerais, lei portuguesa e foro (por defeito Coimbra), assinatura eletrónica.
- O texto **adapta-se aos dados**: contrato de duração determinada (com mensalidade e meses), indeterminada (mensalidade sem prazo) ou por projeto (só valores pontuais); renovação automática ou não; aviso prévio; plano de pagamento.
- **Anexo I**: serviços, entregas e preços (com desconto e valor total). **Anexo II**: calendário de pagamentos — mensal antecipado (uma mensalidade no início de cada mês, com as datas a partir da data de início), entrada e saldo, ou pagamento único. **Anexo III**: tratamento de dados pessoais (se ligado).
- **Equilíbrio entre as Partes** (revisão): aprovação tácita só após 5 dias úteis + lembrete + 2 dias, sem prejuízo de defeitos não detetáveis; «ronda de revisão» definida (erros do Prestador não contam); cessação antecipada com acerto financeiro (serviços prestados, aviso prévio, trabalhos em curso, despesas aprovadas, reembolso do não prestado); pagamento antecipado como reserva de capacidade, com acerto; portefólio só com autorização prévia e escrita; responsabilidade limitada ao valor total do contrato (ou aos 12 meses, se sem prazo) para **ambas** as Partes, com exceções (dolo, culpa grave, confidencialidade, dados pessoais, propriedade intelectual); despesas de terceiros só com valor ou limite máximo aprovado; influência com aprovação do Cliente, contratos e pagamentos diretos aos criadores, publicidade identificada e listas de criadores entregues ao Cliente; proteção de dados só na cláusula 12 e no Anexo III (artigo 28.º do RGPD).
- Fim previsto = início + duração − 1 dia (ou a data indicada).
- O PDF é a impressão do browser («Guardar como PDF»).

## Sugestões de propostas futuras

Regras, sem IA e sem custo: (1) **renovação**, quando o contrato assinado acaba em 60 dias ou já acabou; (2) serviços que o cliente **ainda não tem** e que a análise da empresa recomendou; (3) serviços que **complementam** o que já contratou (por exemplo, redes sociais → automação e IA). **Preparar proposta** abre o editor de propostas já com o cliente e os serviços; enviar essa proposta **não tira o cliente** de «negócio fechado» e cria um negócio novo em Negócios.

## API

`GET /api/clientes`, `GET /api/clientes/catalogo`, `GET /api/clientes/:lead` (ficha e sugestões), `GET /api/clientes/:lead/preparar?proposta=`, `POST /api/clientes/:lead/contratos`, `GET|PUT|DELETE /api/clientes/contratos/:id`, `POST /api/clientes/contratos/:id/enviado`, `POST …/reabrir`, `POST|GET|DELETE …/assinado`. Criar, alterar e apagar: admin e comercial.
