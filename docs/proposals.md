# Propostas comerciais (página Documentos)

A Alpha Tech escolhe um cliente, preenche preços e condições, vê a proposta ao vivo e descarrega o PDF para enviar por email ou WhatsApp.
O modelo parte da proposta antiga (`docs/old_proposal.pdf`) e acrescenta: resumo à medida, objetivos, serviços com entregáveis, tabela de investimento
com totais e desconto, condições, passos, termos e bloco de assinatura. Sai em português, inglês ou espanhol.

## Preparação (uma vez)
Corre `database/proposals.sql` no SQL Editor do Supabase (é seguro repetir). Sem isto, a página avisa «a base de dados ainda não está pronta para as propostas».

## Como se usa
1. **Documentos → Nova proposta.** Só aparecem os clientes em **«Reunião agendada»** (a regra é verificada no servidor, não só no ecrã).
2. **Cliente:** escolhe o cliente e a pessoa de contacto (preenche-se sozinha se só houver uma). O idioma sugerido é o da empresa.
3. **Serviços e preços:** acrescenta serviços do catálogo (website, redes sociais, design gráfico, sistemas, automação e IA, marketing digital) ou um serviço à medida.
   Cada serviço é cobrado **mensal**, **pontual** ou **sobre resultados (%)**. Os valores são **sempre os teus**.
4. **Condições:** moeda, IVA (acrescido, incluído ou isento), desconto, validade, início, duração e pagamento. Os totais são calculados no servidor.
5. **Textos:** escreve à mão ou carrega em **«Sugerir textos com IA»**. A IA lê o dossier da empresa e as **notas da reunião** (regista-as no lead) e escreve o resumo, os objetivos
   e, por serviço, a descrição e os entregáveis. **Nunca escreve preços, prazos nem resultados prometidos.** Revê e edita sempre.
6. **Guardar** e **Descarregar PDF.** O browser abre a janela de impressão: escolhe **«Guardar como PDF»** (o nome do ficheiro já vem com o n.º da proposta e o cliente).
7. Depois de enviares ao cliente, **«Marcar como enviada»** passa o lead a «Proposta enviada» e **atualiza (ou cria) o negócio** desse lead em «Proposta feita», com o valor da proposta (ver `docs/deals.md`).

Uma proposta guardada pode ser reaberta, editada e descarregada outra vez, mesmo depois de o lead avançar de fase.

## O que deves rever antes de usar de verdade
Os textos por defeito estão em `config/proposal-catalog.json` (serviços, passos, termos, pagamento e «porquê a Alpha Tech»). Alguns são **condições comerciais que eu propus** e que
só tu podes confirmar: pagamento «50% na adjudicação e 50% na entrega, a 8 dias», «alterações de âmbito por escrito» e a frase de confidencialidade.
Corrige-os no ficheiro para ficarem certos em todas as propostas, ou edita-os em cada proposta. O email e o nome da marca no cabeçalho também vêm daí.

## Notas técnicas
- O PDF sai da impressão do browser: o texto fica selecionável e nítido, sem servidor de PDF nem dependências novas (funciona igual no Render).
- Os ficheiros: `routes/services/proposal.service.js` (regras, validação e IA), `routes/documents.routes.js`, `assets/js/proposal-render.js` (o documento), `assets/css/proposal.css`, `assets/js/documents.js`.
- A pré-visualização e o PDF usam o mesmo código, por isso o que vês é o que sai.
