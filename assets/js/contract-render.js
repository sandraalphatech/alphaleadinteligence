/* contract-render.js: desenha o contrato de prestação de serviços (HTML em formato A4) a partir dos dados guardados.
   O idioma do DOCUMENTO é o do contrato (pt, en ou es) e é independente do idioma da aplicação, por isso os textos vivem aqui.
   A mesma função serve a pré-visualização no ecrã e o PDF (a impressão do browser, "Guardar como PDF").
   O texto é um modelo: a Alpha Tech preenche as partes, os serviços, os preços e as condições; as cláusulas adaptam-se a esses dados
   (tipo de contrato, plano de pagamento, serviços contratados, LGPD...). Convém que um advogado reveja o modelo uma vez. */

const Contrato = (() => {
    // ======================= TEXTOS =======================
    const T = {
        pt: {
            pi_1b: '',
            resp_lim_total: 'ao valor total do Contrato',
            resp_lim_12m: 'ao valor pago ou devido pelo Cliente nos 12 meses anteriores ao fato que a originou',
            fiscal_geral: 'identificação fiscal n.º', unidade: ['mês', 'meses'], locale: 'pt-BR', contrato: 'Contrato de Prestação de Serviços', numero: 'Contrato n.º', primeiros: 'Entre', e: 'E',
            alias_p: 'Prestador', alias_c: 'Cliente', ambos: 'Partes', clausula: 'Cláusula', anexo: 'Anexo',
            parte_p: 'PRIMEIRO OUTORGANTE', parte_c: 'SEGUNDO OUTORGANTE',
            parte: '{nome}, com sede em {morada}, {fiscal} {nif}, representada por {rep}{cargo}, endereço eletrônico {email}, adiante designada por «{alias}»;',
            parte_c_fim: '{nome}, com sede em {morada}, {fiscal} {nif}, representada por {rep}{cargo}, endereço eletrônico {email}, adiante designada por «{alias}».',
            cargo: ', na qualidade de {c}', considerando: 'Considerando que',
            rec_a: 'O Prestador exerce, com caráter profissional, a atividade de prestação de serviços de websites, redes sociais, design gráfico, sistemas, automação e IA e marketing digital;',
            rec_b: 'O Cliente pretende contratar o Prestador para a execução dos serviços descritos no presente Contrato;',
            rec_c: 'As Partes negociaram livremente os termos deste Contrato e pretendem estabelecer por escrito os direitos e as obrigações de cada uma;',
            celebram: 'É celebrado, e reciprocamente aceite, o presente Contrato de Prestação de Serviços, que se rege pelas cláusulas seguintes:',
            // cláusulas
            t_objeto: 'Objeto', t_ambito: 'Execução dos Serviços', t_p: 'Obrigações do Prestador', t_c: 'Obrigações do Cliente', t_rev: 'Revisões e aprovações', t_esp: 'Condições específicas dos Serviços',
            t_preco: 'Preço e pagamento', t_duracao: 'Duração e renovação', t_cessacao: 'Cessação do Contrato', t_pi: 'Propriedade intelectual', t_conf: 'Confidencialidade',
            t_rgpd: 'Proteção de dados pessoais', t_resp: 'Responsabilidade', t_indep: 'Independência das Partes e subcontratação', t_forca: 'Força maior', t_com: 'Comunicações',
            t_cessao: 'Cessão da posição contratual', t_extra: 'Cláusulas adicionais', t_gerais: 'Disposições gerais', t_lei: 'Lei aplicável e foro', t_assinatura: 'Assinatura e exemplares',
            objeto_1: 'O presente Contrato tem por objeto a prestação, pelo Prestador ao Cliente, dos serviços descritos no Anexo I (os «Serviços»), em regime de prestação de serviços, nos termos dos artigos 1154.º e seguintes do Código Civil.',
            objeto_2: 'Os Serviços foram propostos na proposta comercial n.º {prop}, aceite pelo Cliente, cujo conteúdo se considera integrado neste Contrato em tudo o que o não contrarie.',
            objeto_3: 'Fazem parte integrante do Contrato o Anexo I (Serviços e preços), o Anexo II (Calendário de pagamentos){anexo3}. Em caso de contradição, prevalece o corpo do Contrato sobre os Anexos e estes sobre a proposta comercial.',
            anexo3_txt: ' e o Anexo III (Tratamento de dados pessoais)',
            ambito_1: 'O Prestador obriga-se a executar os Serviços com a diligência, a competência técnica e o profissionalismo exigíveis, segundo as boas práticas da sua atividade. A obrigação do Prestador é de meios e não de resultado.',
            ambito_2: 'Quaisquer serviços não previstos no Anexo I, bem como alterações relevantes ao âmbito, aos prazos ou às entregas, só serão executados após acordo escrito das Partes, com o respetivo orçamento.',
            ambito_3: 'Salvo indicação em contrário no Anexo I, os prazos de entrega indicados são estimativas de boa-fé, contados a partir do momento em que o Prestador receba do Cliente todos os elementos necessários.',
            p_1: 'Executar os Serviços com os meios humanos e técnicos adequados, respeitando a lei aplicável, incluindo as regras de publicidade e de proteção de dados.',
            p_2: 'Indicar ao Cliente um interlocutor para o acompanhamento dos Serviços e informá-lo, com regularidade, do seu andamento.',
            p_3: 'Apresentar ao Cliente, com a periodicidade indicada no Anexo I (ou, na falta de indicação, mensalmente nos serviços de execução continuada), um ponto de situação dos Serviços.',
            p_4: 'Comunicar de imediato ao Cliente qualquer circunstância que possa afetar a execução dos Serviços ou os prazos acordados.',
            c_1: 'Fornecer ao Prestador, em tempo útil, as informações, os conteúdos, os materiais, os acessos (contas, plataformas, domínio, alojamento) e as aprovações necessários à execução dos Serviços, garantindo que são exatos e que possui os direitos necessários para os utilizar.',
            c_2: 'Designar um interlocutor com poderes para tomar decisões e aprovar entregas em nome do Cliente.',
            c_3: 'Pronunciar-se sobre as entregas apresentadas no prazo de {dias} dias úteis. Na ausência de resposta, o Prestador enviará uma notificação de lembrete, concedendo um prazo adicional de 2 dias úteis. Decorrido esse prazo sem manifestação do Cliente, a entrega considera-se aprovada, sem prejuízo da responsabilidade do Prestador por defeitos técnicos ou desconformidades não razoavelmente detetáveis no momento da aprovação.',
            c_4: 'Os atrasos do Cliente no cumprimento das suas obrigações prorrogam, por igual período, os prazos do Prestador, sem direito a qualquer redução do preço.',
            c_5: 'Pagar o preço nos termos da cláusula «Preço e pagamento».',
            rev_1: 'Cada entrega inclui {n} ronda(s) de revisão, entendendo-se cada ronda como um conjunto consolidado de alterações comunicadas pelo Cliente numa única comunicação escrita. As revisões devem respeitar o briefing previamente aprovado. A correção de erros, omissões ou desconformidades imputáveis ao Prestador não será contabilizada como ronda de revisão nem dará lugar a custos adicionais.',
            rev_2: 'Alterações substanciais ao conceito ou ao briefing já aprovado, novas direções criativas ou revisões além das incluídas constituem serviço adicional e serão orçamentadas antes de iniciadas.',
            esp_intro: 'Aplicam-se, aos Serviços indicados, as seguintes condições específicas, para além das restantes cláusulas:',
            preco_total: 'O preço dos Serviços é o indicado no Anexo I. O valor total do Contrato é de {total}{iva}.',
            preco_mensal: 'A remuneração mensal dos Serviços é de {mensal}{iva}, mantendo-se enquanto o Contrato vigorar.',
            preco_pontual: 'Os serviços de execução pontual têm o valor de {pontual}{iva}.',
            iva_mais: ', acrescido de IVA à taxa legal em vigor', iva_incl: ', IVA incluído', iva_isento: ', isento de IVA',
            preco_pagamento: 'As faturas são emitidas nas datas indicadas no Anexo II e pagas por {metodo}, {venc}. Os prazos de pagamento de serviços adicionais e de remuneração variável são de {prazo} dias a contar da data da fatura.',
            venc_antecipado: 'com vencimento na data indicada nesse Anexo (por antecipação, no início de cada período de serviço a que respeita)',
            venc_datas: 'com vencimento nas datas indicadas nesse Anexo',
            preco_iban: 'Os pagamentos são feitos para a conta bancária com o IBAN {iban}, ou outro que o Prestador indique por escrito.',
            preco_terceiros: 'O preço não inclui custos de terceiros — como orçamento de anúncios, licenças de software, imagens ou fontes, plataformas, taxas ou deslocações — que só serão suportados mediante aprovação prévia por escrito do Cliente, a qual deve identificar o valor ou o limite máximo da despesa. Despesas que excedam o valor ou o limite aprovado não são exigíveis ao Cliente sem nova aprovação escrita; os custos aprovados serão faturados ao Cliente ou pagos diretamente por este.',
            preco_mora: 'O atraso no pagamento confere ao Prestador o direito a juros de mora à taxa legal aplicável às transações comerciais e, decorridos 15 dias sobre notificação escrita, a suspender os Serviços até à regularização, sem prejuízo do direito de resolução. Os prazos de execução ficam suspensos durante a suspensão.',
            preco_antecipado: 'Os pagamentos antecipados correspondem à reserva de capacidade e à prestação dos serviços no respetivo período mensal. Em caso de cessação antecipada do Contrato, serão apurados os serviços efetivamente prestados, os trabalhos em curso e as despesas previamente aprovadas e não recuperáveis. Os montantes pagos relativos a serviços não prestados serão objeto de acerto entre as Partes, nos termos da cláusula «Cessação do Contrato».',
            preco_sucesso: 'A parte variável da remuneração ({lista}) é calculada sobre o valor efetivamente faturado e recebido pelo Cliente no âmbito do que resultar dos Serviços. O Cliente fornecerá ao Prestador, até ao 5.º dia útil de cada mês, a informação necessária ao apuramento, e o Prestador emitirá a respetiva fatura. O Prestador pode verificar a informação prestada.',
            preco_atualiza: 'Em contratos renovados ou de duração indeterminada, o Prestador pode atualizar os preços mediante comunicação escrita com a antecedência mínima de 60 dias.',
            dur_fixo: 'O Contrato produz efeitos na data da última assinatura e os Serviços iniciam-se em {inicio}. O Contrato vigora por {n} {unid}, terminando em {fim}.',
            dur_fixo_renova: 'No termo, renova-se automaticamente por períodos sucessivos de igual duração, salvo se qualquer das Partes comunicar à outra, por escrito, a oposição à renovação com a antecedência mínima de {aviso} dias.',
            dur_fixo_nao: 'No termo, o Contrato cessa sem necessidade de aviso, podendo ser renovado por acordo escrito das Partes.',
            dur_indet: 'O Contrato produz efeitos na data da última assinatura e os Serviços iniciam-se em {inicio}. O Contrato vigora por tempo indeterminado, podendo ser denunciado por qualquer das Partes nos termos da cláusula «Cessação do Contrato».',
            dur_projeto: 'O Contrato produz efeitos na data da última assinatura e os Serviços iniciam-se em {inicio}. O Contrato vigora até à conclusão e aceitação das entregas previstas no Anexo I{fim}.',
            dur_projeto_fim: ', estando prevista a sua conclusão até {fim}',
            ces_1: 'Qualquer das Partes pode fazer cessar o Contrato, sem invocação de justa causa, mediante comunicação escrita com antecedência mínima de {aviso} dias. Em caso de cessação antecipada, serão devidos os valores correspondentes aos serviços efetivamente prestados, ao período de aviso prévio e aos trabalhos em curso, na proporção do trabalho realizado, bem como as despesas previamente aprovadas e não recuperáveis. Os valores pagos antecipadamente relativos a serviços não prestados serão objeto de acerto e eventual reembolso, sem prejuízo de outros valores legitimamente devidos.',
            ces_2: 'Qualquer das Partes pode resolver o Contrato, com efeitos imediatos, em caso de incumprimento grave das obrigações da outra Parte que não seja sanado no prazo de 15 dias a contar da receção de notificação escrita que o descreva, bem como em caso de insolvência da outra Parte.',
            ces_3: 'Com a cessação, o Prestador entregará ao Cliente os trabalhos já pagos e as informações a que o Cliente tenha direito nos termos da cláusula «Propriedade intelectual», e cada Parte devolverá ou eliminará os materiais, os acessos e a informação confidencial da outra.',
            ces_4: 'Sobrevivem à cessação, enquanto necessário, as cláusulas relativas a pagamento, propriedade intelectual, confidencialidade, proteção de dados, responsabilidade e lei aplicável e foro.',
            pi_1: 'Os materiais criados especificamente para o Cliente no âmbito dos Serviços (como logótipos, peças gráficas, conteúdos, vídeos e textos) e identificados no Anexo I são cedidos ao Cliente, em exclusivo, para a finalidade para que foram encomendados. A cessão abrange os direitos patrimoniais de utilização, reprodução, adaptação, distribuição e comunicação ao público, nos limites legalmente permitidos, e produz efeitos após o pagamento integral dos valores devidos; até esse pagamento, o Cliente dispõe apenas de uma licença de utilização temporária e revogável.',
            pi_2: 'Mantêm-se propriedade do Prestador (ou de terceiros) os métodos, modelos, ferramentas, software, bibliotecas, ideias e materiais pré-existentes ou desenvolvidos para uso geral, que se distinguem dos materiais cedidos ao Cliente, e sobre os quais o Cliente recebe uma licença não exclusiva de utilização, na medida necessária ao uso das entregas.',
            pi_3: 'Os elementos de terceiros (imagens de bancos de imagens, tipos de letra, música, plugins e software) estão sujeitos às respetivas licenças, que o Cliente deve cumprir.',
            pi_4: 'O Cliente garante que os conteúdos e materiais que fornece não violam direitos de terceiros e mantém o Prestador indemne em caso de reclamação relativa a esses materiais.',
            pi_5: 'O Prestador poderá mencionar o Cliente e apresentar os trabalhos desenvolvidos no âmbito do presente Contrato no seu portefólio e comunicações comerciais, mediante autorização prévia e escrita do Cliente, não podendo divulgar informações confidenciais, dados pessoais ou materiais ainda não tornados públicos sem autorização específica.',
            conf_1: 'Cada Parte obriga-se a manter confidencial, e a usar apenas para os fins deste Contrato, toda a informação não pública de natureza comercial, técnica, financeira ou estratégica da outra Parte a que tenha acesso, durante o Contrato e nos {anos} anos seguintes à sua cessação.',
            conf_2: 'A obrigação não abrange a informação que seja ou se torne pública sem violação do Contrato, que já fosse conhecida legitimamente da Parte recetora, ou cuja divulgação seja exigida por lei ou por autoridade competente (devendo, nesse caso, a outra Parte ser avisada sempre que a lei o permita).',
            rgpd_1: 'Cada Parte cumprirá a Lei n.º 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD) e demais legislação de proteção de dados aplicável. Cada Parte é responsável pelo tratamento dos dados pessoais dos seus próprios colaboradores e representantes, para efeitos de gestão deste Contrato.',
            rgpd_2: 'Quando, na execução dos Serviços, o Prestador tratar dados pessoais por conta do Cliente, atuará como operador, nos termos da LGPD e do Anexo III, tratando-os apenas segundo as instruções documentadas do Cliente. O Cliente, como controlador, garante que tem base legal (artigos 7.º e 11 da LGPD) para esse tratamento.',
            rgpd_3: 'O Prestador adotará medidas técnicas e organizativas adequadas, garantirá a confidencialidade das pessoas autorizadas a tratar os dados, notificará o Cliente, em prazo razoável, após ter conhecimento de um incidente de segurança que possa acarretar risco ou dano relevante aos titulares, para que o Cliente cumpra o artigo 48 da LGPD e, no termo dos Serviços, eliminará ou devolverá os dados, à escolha do Cliente, salvo obrigação legal de conservação.',
            rgpd_4: 'O Cliente autoriza, de forma geral, o recurso a suboperadores necessários à prestação dos Serviços (por exemplo, plataformas de gestão de redes sociais, de email ou de alojamento), a quem o Prestador impõe obrigações equivalentes e de que informará o Cliente, a pedido.',
            resp_1: 'O Prestador não garante resultados comerciais ou de comunicação — como vendas, contatos, seguidores, alcance, posicionamento em motores de pesquisa ou retorno do investimento —, que dependem de fatores externos, incluindo as decisões e as regras das plataformas digitais.',
            resp_2: 'A responsabilidade de cada Parte perante a outra por danos decorrentes do Contrato fica limitada, no seu conjunto, {limite}. Este limite aplica-se a ambas as Partes, não abrange o pagamento do preço devido e não é aplicável em caso de dolo ou culpa grave, de violação dos deveres de confidencialidade, de violação das regras de proteção de dados pessoais ou de infração de direitos de propriedade intelectual da outra Parte, nem noutras situações em que a lei não permita limitar ou excluir a responsabilidade. Salvo nesses casos, nenhuma das Partes responde por lucros cessantes ou por danos indiretos.',
            resp_3: 'O Prestador não responde por atrasos ou falhas causados por informação, materiais ou aprovações que o Cliente não forneça em tempo útil, por decisões do Cliente contrárias às recomendações do Prestador, ou por falhas de serviços de terceiros.',
            indep_1: 'O Prestador atua com autonomia técnica e organizativa, não existindo entre as Partes, nem entre o Cliente e os colaboradores do Prestador, qualquer vínculo de natureza laboral, de sociedade ou de agência.',
            indep_2: 'O Prestador pode recorrer a colaboradores e a subcontratados para a execução dos Serviços, mantendo-se perante o Cliente integralmente responsável por essa execução.',
            forca_1: 'Nenhuma das Partes responde pelo incumprimento ou atraso causado por fato de força maior, como catástrofes naturais, pandemias, guerra, atos de autoridade, falhas generalizadas de energia, telecomunicações ou plataformas digitais, desde que o comunique à outra Parte logo que possível e faça o que estiver ao seu alcance para limitar os efeitos. Se o impedimento durar mais de 60 dias, qualquer das Partes pode resolver o Contrato sem indemnização.',
            com_1: 'As comunicações entre as Partes relativas ao Contrato são feitas por escrito, para os endereços eletrónicos e moradas indicados no início do Contrato, ou para outros que uma Parte comunique à outra, e consideram-se recebidas no dia útil seguinte ao envio.',
            cessao_1: 'Nenhuma das Partes pode ceder a sua posição contratual nem os direitos e as obrigações dele decorrentes sem o consentimento prévio e escrito da outra Parte.',
            gerais_1: 'O Contrato, com os Anexos, constitui o acordo integral das Partes sobre o seu objeto e substitui todos os entendimentos anteriores. Qualquer alteração ou renúncia só é válida se feita por escrito e assinada por ambas as Partes.',
            gerais_2: 'Se alguma disposição for ou se tornar nula ou ineficaz, as restantes mantêm-se em vigor, devendo as Partes substituí-la por outra de efeito equivalente. A tolerância de uma Parte perante o incumprimento da outra não implica renúncia a qualquer direito.',
            lei_1: 'O Contrato rege-se pela lei brasileira.',
            lei_2: 'Para a resolução de quaisquer litígios emergentes do Contrato, as Partes escolhem o foro da comarca de {foro}, com expressa renúncia a qualquer outro.',
            ass_1: 'O Contrato pode ser assinado eletronicamente, incluindo por assinatura eletrônica qualificada, avançada ou simples, com o valor jurídico que a lei lhe atribui, e em exemplares, que em conjunto constituem um único instrumento. Cada Parte fica com um exemplar.',
            // assinaturas e anexos
            assina_titulo: 'Assinaturas', em: 'Em', data_lbl: 'Data', local_lbl: 'Local', assinatura: 'Assinatura', nome: 'Nome', cargo_lbl: 'Cargo', pelo: 'Por {nome}',
            sig_intro: 'Feito em {local}, em {data}, em dois exemplares, ficando um com cada Parte.',
            anexo1: 'Serviços e preços', anexo2: 'Calendário de pagamentos', anexo3: 'Tratamento de dados pessoais',
            th_servico: 'Serviço', th_modelo: 'Modelo', th_valor: 'Valor', m_mensal: 'Mensal', m_pontual: 'Pontual', m_sucesso: 'Sobre resultados', mes: 'mês', do_fechado: 'do valor do que for fechado',
            entregaveis: 'Entregas', total_simples: 'Total', total_mensal: 'Total mensal', total_pontual: 'Total pontual', desconto: 'Desconto aplicado', total_contrato: 'Valor total do contrato ({n} {unid})', sem_iva: 'Valores sem IVA. O IVA é acrescentado à taxa legal em vigor.',
            iva_nota_incl: 'Valores com IVA incluído.', iva_nota_isento: 'Valores isentos de IVA.',
            th_pagamento: 'Pagamento', th_vencimento: 'Vencimento', pag_assinatura: 'Na assinatura do Contrato', pag_inicio: 'Início da prestação do serviço', pag_mes: 'Início do mês {n}', pag_ultimo: 'Início do último mês', pag_mensal_todos: 'Início de cada mês de prestação do serviço',
            pag_entrada: 'Entrada ({pct}%)', pag_saldo: 'Saldo ({pct}%) — na conclusão dos Serviços', pag_unico: 'Pagamento único', pag_pontual: 'Valor pontual (na assinatura)', pag_nota_antecipado: 'Pagamento antecipado: cada mensalidade é paga no início do respetivo mês de serviço.',
            pag_variavel: 'Remuneração variável: {lista}, apurada e faturada nos termos do Contrato.', mes_n: 'mês {n}',
            rgpd_a_obj: 'Objeto e finalidade', rgpd_a_obj_t: 'Tratamento de dados pessoais pelo Prestador, por conta do Cliente, na medida necessária à execução dos Serviços descritos no Anexo I.',
            rgpd_a_dur: 'Duração', rgpd_a_dur_t: 'A do Contrato, até à eliminação ou devolução dos dados nos termos da cláusula «Proteção de dados pessoais».',
            rgpd_a_nat: 'Natureza do tratamento', rgpd_a_nat_t: 'Recolha, registro, organização, consulta, utilização, publicação e eliminação, em contas e plataformas do Cliente ou do Prestador, conforme os Serviços.',
            rgpd_a_tipo: 'Tipos de dados', rgpd_a_tipo_t: 'Dados de identificação e de contato, imagens e vídeos, conteúdos publicados, dados de interação (mensagens, comentários) e dados de desempenho de campanhas.',
            rgpd_a_tit: 'Categorias de titulares', rgpd_a_tit_t: 'Clientes, potenciais clientes, seguidores e usuários das plataformas, colaboradores do Cliente e criadores de conteúdo.',
            rgpd_a_obrig: 'Obrigações do Prestador', rgpd_a_obrig_t: 'Tratar os dados apenas segundo instruções documentadas do Cliente; garantir confidencialidade; adotar medidas de segurança adequadas; assistir o Cliente no exercício dos direitos dos titulares e no cumprimento dos artigos 46 a 48 da LGPD; comunicar incidentes de segurança em prazo razoável; disponibilizar as informações necessárias para demonstrar o cumprimento e permitir auditorias razoáveis; eliminar ou devolver os dados no termo dos Serviços.',
            // serviços
            esp: {
                sistemas: ['O Prestador desenvolve o sistema, a plataforma ou o painel descritos no Anexo I, por fases e com validação do Cliente em cada entrega. Alterações ao âmbito aprovado são acordadas por escrito e podem alterar preço e prazo.', 'O Cliente fornece, em tempo útil, as regras de negócio, os dados e os acessos necessários. Alojamento, bases de dados, domínios, licenças e serviços de terceiros não estão incluídos, salvo indicação no Anexo I, e são contratados em nome e a expensas do Cliente.', 'O Prestador corrige, sem custo, erros de funcionamento reportados nos 30 dias seguintes à entrega. Manutenção, suporte e novas funcionalidades são serviços adicionais.'],
                website: ['O website considera-se entregue quando disponibilizado em ambiente de aprovação ou publicado. O Cliente fornece, em tempo útil, textos, imagens, logótipos e acessos (domínio e alojamento).', 'Domínio, alojamento, certificados, licenças de plugins ou temas e ferramentas de terceiros não estão incluídos, salvo indicação no Anexo I, e serão contratados em nome e a expensas do Cliente.', 'O Prestador corrige, sem custo, erros de funcionamento reportados nos 30 dias seguintes à publicação. Manutenção, atualizações e novas funcionalidades são serviços adicionais.', 'O código desenvolvido especificamente para o Cliente é cedido nos termos da cláusula «Propriedade intelectual»; componentes de terceiros e de código aberto regem-se pelas respetivas licenças.'],
                marketing_digital: ['O orçamento de anúncios (media) é pago pelo Cliente diretamente às plataformas e não está incluído no preço, salvo indicação no Anexo I. As contas de anúncios são e permanecem propriedade do Cliente, a quem cabe conceder acesso ao Prestador.', 'O Prestador gere as campanhas dentro do orçamento e dos objetivos aprovados e apresenta relatórios periódicos. Não controla os algoritmos, os custos nem as políticas das plataformas (incluindo rejeição de anúncios e suspensão de contas) e não garante resultados.', 'O Cliente informa o Prestador, atempadamente, de alterações a preços, ofertas, stocks ou condições que afetem as campanhas.'],
                redes_sociais: ['As contas das redes sociais são e permanecem propriedade do Cliente, que concede ao Prestador os acessos ou as permissões de administração necessários.', 'O Prestador submete o plano editorial a aprovação do Cliente com a antecedência indicada no Anexo I (na falta de indicação, até 5 dias úteis antes do início de cada mês) e publica após aprovação, expressa ou tácita nos termos da cláusula «Obrigações do Cliente».', 'O Prestador não responde por conteúdos fornecidos pelo Cliente, por decisões das plataformas (como restrições ou suspensão de contas) nem garante seguidores, alcance ou interações. Anúncios pagos não estão incluídos, salvo indicação no Anexo I.'],
                automacao_ia: ['O Prestador configura as automações, integrações e assistentes de IA descritos no Anexo I. O Cliente concede os acessos às ferramentas envolvidas (por exemplo WhatsApp, CRM, folhas de cálculo e pagamentos) e mantém-se titular das respetivas contas.', 'Custos de terceiros (APIs, mensagens, licenças e consumo de modelos de IA) não estão incluídos, salvo indicação no Anexo I, e são suportados pelo Cliente. O Prestador não controla alterações, limites ou indisponibilidades dos serviços de terceiros.', 'Os assistentes de IA podem produzir respostas imprecisas; o Cliente é responsável por definir os limites de atuação e por rever as situações sensíveis. O Prestador não garante resultados específicos.'],
                design_grafico: ['O Prestador entrega as peças gráficas nos formatos indicados no Anexo I, sendo os arquivos finais e editáveis disponibilizados após o pagamento integral. Fontes, imagens e elementos de terceiros seguem as respetivas licenças.'],
                outro: []
            }
        },
        en: {
            pi_1b: '',
            resp_lim_total: 'to the total value of the Agreement',
            resp_lim_12m: 'to the amount paid or due by the Client in the 12 months before the event giving rise to it',
            fiscal_geral: 'tax ID no.', unidade: ['month', 'months'], locale: 'en-GB', contrato: 'Service Agreement', numero: 'Agreement no.', primeiros: 'Between', e: 'And',
            alias_p: 'Provider', alias_c: 'Client', ambos: 'Parties', clausula: 'Clause', anexo: 'Schedule',
            parte_p: 'FIRST PARTY', parte_c: 'SECOND PARTY',
            parte: '{nome}, with registered office at {morada}, {fiscal} {nif}, represented by {rep}{cargo}, email {email}, hereinafter the «{alias}»;',
            parte_c_fim: '{nome}, with registered office at {morada}, {fiscal} {nif}, represented by {rep}{cargo}, email {email}, hereinafter the «{alias}».',
            cargo: ', acting as {c}', considerando: 'Whereas',
            rec_a: 'The Provider carries on, on a professional basis, the business of providing website, social media, graphic design, systems, automation and AI and digital marketing services;',
            rec_b: 'The Client wishes to engage the Provider to carry out the services described in this Agreement;',
            rec_c: 'The Parties have freely negotiated the terms of this Agreement and wish to set out in writing the rights and obligations of each of them;',
            celebram: 'This Service Agreement is entered into and mutually accepted on the following terms:',
            t_objeto: 'Subject matter', t_ambito: 'Performance of the Services', t_p: 'Provider’s obligations', t_c: 'Client’s obligations', t_rev: 'Revisions and approvals', t_esp: 'Service-specific terms',
            t_preco: 'Fees and payment', t_duracao: 'Term and renewal', t_cessacao: 'Termination', t_pi: 'Intellectual property', t_conf: 'Confidentiality',
            t_rgpd: 'Personal data protection', t_resp: 'Liability', t_indep: 'Independence of the Parties and subcontracting', t_forca: 'Force majeure', t_com: 'Notices',
            t_cessao: 'Assignment', t_extra: 'Additional clauses', t_gerais: 'General provisions', t_lei: 'Governing law and jurisdiction', t_assinatura: 'Signature and counterparts',
            objeto_1: 'This Agreement governs the provision by the Provider to the Client of the services described in Schedule I (the «Services»), as an independent services contract.',
            objeto_2: 'The Services were proposed in commercial proposal no. {prop}, accepted by the Client, whose content is deemed part of this Agreement insofar as it does not conflict with it.',
            objeto_3: 'Schedule I (Services and fees) and Schedule II (Payment schedule){anexo3} form an integral part of this Agreement. In case of conflict, the body of the Agreement prevails over the Schedules, and these over the commercial proposal.',
            anexo3_txt: ' and Schedule III (Personal data processing)',
            ambito_1: 'The Provider shall perform the Services with due care, technical competence and professionalism, in line with good practice in its field. The Provider’s obligation is one of means, not of result.',
            ambito_2: 'Any services not listed in Schedule I, and any material change to scope, deadlines or deliverables, will only be carried out after written agreement by the Parties, with the corresponding quotation.',
            ambito_3: 'Unless Schedule I states otherwise, delivery dates are good-faith estimates, counted from the moment the Provider receives from the Client everything needed to begin.',
            p_1: 'Perform the Services with adequate human and technical resources, in compliance with applicable law, including advertising and data protection rules.',
            p_2: 'Appoint a contact person for the Services and keep the Client regularly informed of progress.',
            p_3: 'Provide the Client with a status report at the frequency stated in Schedule I (or, failing that, monthly for ongoing services).',
            p_4: 'Promptly inform the Client of any circumstance that may affect the performance of the Services or the agreed deadlines.',
            c_1: 'Provide the Provider, in good time, with the information, content, materials, access (accounts, platforms, domain, hosting) and approvals needed for the Services, ensuring they are accurate and that it holds the rights required to use them.',
            c_2: 'Appoint a contact person with authority to make decisions and approve deliverables on the Client’s behalf.',
            c_3: 'Respond to the deliverables submitted within {dias} business days. If there is no response, the Provider will send a reminder notice granting an additional 2 business days. If the Client still does not respond within that period, the deliverable is deemed approved, without prejudice to the Provider’s liability for technical defects or non-conformities that could not reasonably be detected at the time of approval.',
            c_4: 'Delays by the Client in meeting its obligations extend the Provider’s deadlines by an equal period, without any reduction in the fees.',
            c_5: 'Pay the fees in accordance with the clause «Fees and payment».',
            rev_1: 'Each deliverable includes {n} round(s) of revisions, each round being a consolidated set of changes communicated by the Client in a single written message. Revisions must respect the previously approved brief. Correcting errors, omissions or non-conformities attributable to the Provider is not counted as a revision round and gives rise to no additional charge.',
            rev_2: 'Substantial changes to the concept or to the approved brief, new creative directions or revisions beyond those included are additional services and will be quoted before they start.',
            esp_intro: 'The following specific terms apply to the Services indicated, in addition to the other clauses:',
            preco_total: 'The fees for the Services are set out in Schedule I. The total value of the Agreement is {total}{iva}.',
            preco_mensal: 'The monthly fee for the Services is {mensal}{iva}, and remains payable while the Agreement is in force.',
            preco_pontual: 'The one-off services are priced at {pontual}{iva}.',
            iva_mais: ', plus VAT at the applicable legal rate', iva_incl: ', VAT included', iva_isento: ', VAT exempt',
            preco_pagamento: 'Invoices are issued on the dates shown in Schedule II and paid by {metodo}, {venc}. The payment term for additional services and variable fees is {prazo} days from the invoice date.',
            venc_antecipado: 'due on the date shown in that Schedule (in advance, at the start of each service period to which it relates)',
            venc_datas: 'due on the dates shown in that Schedule',
            preco_iban: 'Payments are made to the bank account with IBAN {iban}, or another account the Provider notifies in writing.',
            preco_terceiros: 'The fees do not include third-party costs — such as advertising budget, software licences, images or fonts, platforms, fees or travel — which will only be incurred with the Client’s prior written approval, which must state the amount or the maximum limit of the expense. Expenses exceeding the approved amount or limit cannot be charged to the Client without new written approval; approved costs will be invoiced to, or paid directly by, the Client.',
            preco_mora: 'Late payment entitles the Provider to default interest at the legal rate applicable to commercial transactions and, 15 days after written notice, to suspend the Services until payment is made, without prejudice to the right to terminate. Delivery deadlines are suspended during any suspension.',
            preco_antecipado: 'Advance payments correspond to the reservation of capacity and to the provision of the services in the relevant monthly period. If the Agreement is terminated early, the services actually provided, work in progress and previously approved, non-recoverable expenses will be determined. Amounts paid for services not provided will be settled between the Parties under the clause «Termination».',
            preco_sucesso: 'The variable part of the fees ({lista}) is calculated on the amount actually invoiced and received by the Client as a result of the Services. The Client shall provide the Provider, by the 5th business day of each month, with the information needed to calculate it, and the Provider will issue the corresponding invoice. The Provider may verify the information provided.',
            preco_atualiza: 'For renewed or open-ended agreements, the Provider may update the fees on at least 60 days’ written notice.',
            dur_fixo: 'This Agreement takes effect on the date of the last signature and the Services start on {inicio}. The Agreement runs for {n} {unid}, ending on {fim}.',
            dur_fixo_renova: 'At the end of the term it renews automatically for successive periods of equal length, unless either Party notifies the other in writing of its objection to renewal at least {aviso} days beforehand.',
            dur_fixo_nao: 'At the end of the term the Agreement ends without need for notice, and may be renewed by written agreement of the Parties.',
            dur_indet: 'This Agreement takes effect on the date of the last signature and the Services start on {inicio}. The Agreement runs for an indefinite period and may be terminated by either Party as set out in the clause «Termination».',
            dur_projeto: 'This Agreement takes effect on the date of the last signature and the Services start on {inicio}. The Agreement runs until the deliverables in Schedule I are completed and accepted{fim}.',
            dur_projeto_fim: ', with completion expected by {fim}',
            ces_1: 'Either Party may terminate the Agreement, without cause, on at least {aviso} days’ written notice. On early termination, the following are due: the services actually provided, the notice period and work in progress, in proportion to the work done, and previously approved, non-recoverable expenses. Amounts paid in advance for services not provided will be settled and, where applicable, refunded, without prejudice to other amounts lawfully due.',
            ces_2: 'Either Party may terminate the Agreement with immediate effect in the event of a serious breach by the other Party that is not remedied within 15 days of receiving a written notice describing it, and in the event of the other Party’s insolvency.',
            ces_3: 'On termination, the Provider shall hand over the work already paid for and the information the Client is entitled to under the clause «Intellectual property», and each Party shall return or delete the other’s materials, access and confidential information.',
            ces_4: 'The clauses on payment, intellectual property, confidentiality, data protection, liability and governing law and jurisdiction survive termination for as long as necessary.',
            pi_1: 'Materials created specifically for the Client under the Services (such as logos, graphic pieces, content, videos and copy) and identified in Schedule I are assigned to the Client, exclusively, for the purpose for which they were commissioned. The assignment covers the economic rights of use, reproduction, adaptation, distribution and communication to the public, within the limits permitted by law, and takes effect on full payment of the amounts due; until then, the Client has only a temporary, revocable licence to use them.',
            pi_2: 'Methods, templates, tools, software, libraries, ideas and pre-existing or general-purpose materials remain the property of the Provider (or third parties); they are distinct from the materials assigned to the Client, and the Client receives a non-exclusive licence to use them as needed to use the deliverables.',
            pi_3: 'Third-party elements (stock images, fonts, music, plugins and software) are subject to their own licences, which the Client must comply with.',
            pi_4: 'The Client warrants that the content and materials it supplies do not infringe third-party rights and shall hold the Provider harmless against any claim relating to them.',
            pi_5: 'The Provider may name the Client and showcase the work carried out under this Agreement in its portfolio and commercial communications, with the Client’s prior written authorisation, and may not disclose confidential information, personal data or materials not yet made public without specific authorisation.',
            conf_1: 'Each Party shall keep confidential, and use only for the purposes of this Agreement, all non-public commercial, technical, financial or strategic information of the other Party to which it has access, during the Agreement and for {anos} years after it ends.',
            conf_2: 'This obligation does not cover information that is or becomes public without breach of the Agreement, was already lawfully known to the receiving Party, or must be disclosed by law or by a competent authority (in which case the other Party shall be notified wherever the law allows).',
            rgpd_1: 'Each Party shall comply with Brazilian Law No. 13,709/2018 (General Personal Data Protection Law – LGPD) and other applicable data protection law. Each Party is responsible for processing the personal data of its own staff and representatives for the purposes of managing this Agreement.',
            rgpd_2: 'Where, in performing the Services, the Provider processes personal data on behalf of the Client, it acts as processor (operador) under the LGPD and Schedule III, processing it only on the Client’s documented instructions. The Client, as controller, warrants that it has a legal basis (Articles 7 and 11 LGPD) for that processing.',
            rgpd_3: 'The Provider shall adopt appropriate technical and organisational measures, ensure the confidentiality of persons authorised to process the data, notify the Client within a reasonable time after becoming aware of a security incident that may cause relevant risk or harm to data subjects, so that the Client can comply with Article 48 LGPD and, at the end of the Services, delete or return the data at the Client’s choice, unless the law requires retention.',
            rgpd_4: 'The Client gives general authorisation for the use of sub-processors needed to provide the Services (for example social media, email or hosting platforms), on which the Provider imposes equivalent obligations and about which it will inform the Client on request.',
            resp_1: 'The Provider does not guarantee commercial or communication results — such as sales, leads, followers, reach, search ranking or return on investment — which depend on external factors, including the decisions and rules of digital platforms.',
            resp_2: 'Each Party’s liability to the other for damages arising from the Agreement is limited, overall, {limite}. This limit applies to both Parties, does not cover payment of the fees due, and does not apply in cases of wilful misconduct or gross negligence, breach of confidentiality, breach of personal data protection rules or infringement of the other Party’s intellectual property rights, or in other situations where the law does not allow liability to be limited or excluded. Except in those cases, neither Party is liable for loss of profit or indirect damage.',
            resp_3: 'The Provider is not liable for delays or failures caused by information, materials or approvals the Client does not provide in good time, by Client decisions contrary to the Provider’s recommendations, or by failures of third-party services.',
            indep_1: 'The Provider acts with technical and organisational autonomy; there is no employment, partnership or agency relationship between the Parties, or between the Client and the Provider’s staff.',
            indep_2: 'The Provider may use staff and subcontractors to perform the Services, remaining fully responsible to the Client for that performance.',
            forca_1: 'Neither Party is liable for non-performance or delay caused by force majeure, such as natural disasters, pandemics, war, acts of authority, widespread power, telecommunications or digital platform failures, provided it notifies the other Party as soon as possible and does what it can to limit the effects. If the impediment lasts more than 60 days, either Party may terminate the Agreement without compensation.',
            com_1: 'Notices between the Parties relating to the Agreement shall be in writing, to the email and postal addresses stated at the start of the Agreement, or others one Party notifies to the other, and are deemed received on the business day after sending.',
            cessao_1: 'Neither Party may assign its position in the Agreement, or the rights and obligations arising from it, without the other Party’s prior written consent.',
            gerais_1: 'The Agreement, with its Schedules, is the entire agreement between the Parties on its subject matter and replaces all prior understandings. Any amendment or waiver is valid only if in writing and signed by both Parties.',
            gerais_2: 'If any provision is or becomes void or unenforceable, the others remain in force, and the Parties shall replace it with one of equivalent effect. A Party’s tolerance of the other’s breach is not a waiver of any right.',
            lei_1: 'The Agreement is governed by Brazilian law.',
            lei_2: 'The Parties submit any dispute arising from the Agreement to the courts of the district of {foro}, expressly waiving any other.',
            ass_1: 'The Agreement may be signed electronically, including by qualified, advanced or simple electronic signature, with the legal value the law gives it, and in counterparts, which together form a single instrument. Each Party keeps a copy.',
            assina_titulo: 'Signatures', em: 'On', data_lbl: 'Date', local_lbl: 'Place', assinatura: 'Signature', nome: 'Name', cargo_lbl: 'Title', pelo: 'For {nome}',
            sig_intro: 'Made in {local}, on {data}, in two copies, one for each Party.',
            anexo1: 'Services and fees', anexo2: 'Payment schedule', anexo3: 'Personal data processing',
            th_servico: 'Service', th_modelo: 'Model', th_valor: 'Amount', m_mensal: 'Monthly', m_pontual: 'One-off', m_sucesso: 'Success-based', mes: 'month', do_fechado: 'of the value of what closes',
            entregaveis: 'Deliverables', total_simples: 'Total', total_mensal: 'Monthly total', total_pontual: 'One-off total', desconto: 'Discount applied', total_contrato: 'Total contract value ({n} {unid})', sem_iva: 'Amounts exclude VAT. VAT is added at the applicable legal rate.',
            iva_nota_incl: 'Amounts include VAT.', iva_nota_isento: 'Amounts are VAT exempt.',
            th_pagamento: 'Payment', th_vencimento: 'Due', pag_assinatura: 'On signing the Agreement', pag_inicio: 'Start of the service', pag_mes: 'Start of month {n}', pag_ultimo: 'Start of the last month', pag_mensal_todos: 'Start of each service month',
            pag_entrada: 'Deposit ({pct}%)', pag_saldo: 'Balance ({pct}%) — on completion of the Services', pag_unico: 'Single payment', pag_pontual: 'One-off fee (on signing)', pag_nota_antecipado: 'Paid in advance: each monthly fee is paid at the start of its service month.',
            pag_variavel: 'Variable fee: {lista}, calculated and invoiced as set out in the Agreement.', mes_n: 'month {n}',
            rgpd_a_obj: 'Subject matter and purpose', rgpd_a_obj_t: 'Processing of personal data by the Provider, on behalf of the Client, as needed to perform the Services described in Schedule I.',
            rgpd_a_dur: 'Duration', rgpd_a_dur_t: 'The term of the Agreement, until the data is deleted or returned as set out in the clause «Personal data protection».',
            rgpd_a_nat: 'Nature of processing', rgpd_a_nat_t: 'Collection, recording, organisation, retrieval, use, publication and erasure, in the Client’s or the Provider’s accounts and platforms, depending on the Services.',
            rgpd_a_tipo: 'Types of data', rgpd_a_tipo_t: 'Identification and contact details, images and videos, published content, interaction data (messages, comments) and campaign performance data.',
            rgpd_a_tit: 'Categories of data subjects', rgpd_a_tit_t: 'Customers, prospects, followers and platform users, the Client’s staff and content creators.',
            rgpd_a_obrig: 'Provider’s obligations', rgpd_a_obrig_t: 'Process data only on the Client’s documented instructions; ensure confidentiality; adopt appropriate security measures; assist the Client with data subject rights and with compliance with Articles 46 to 48 LGPD; report security incidents within a reasonable time; make available the information needed to demonstrate compliance and allow reasonable audits; delete or return the data at the end of the Services.',
            esp: {
                sistemas: ['The Provider develops the system, platform or dashboard described in Schedule I, in phases and with the Client’s validation at each delivery. Changes to the approved scope are agreed in writing and may change price and timeline.', 'The Client supplies, in good time, the business rules, data and access needed. Hosting, databases, domains, licences and third-party services are not included unless Schedule I says so, and are contracted in the Client’s name and at its expense.', 'The Provider fixes, free of charge, malfunctions reported within 30 days of delivery. Maintenance, support and new features are additional services.'],
                website: ['The website is deemed delivered when made available for approval or published. The Client provides, in good time, copy, images, logos and access (domain and hosting).', 'Domain, hosting, certificates, plugin or theme licences and third-party tools are not included, unless Schedule I says so, and will be bought in the Client’s name and at its expense.', 'The Provider fixes, free of charge, malfunctions reported within 30 days after publication. Maintenance, updates and new features are additional services.', 'Code developed specifically for the Client is assigned as set out in the clause «Intellectual property»; third-party and open-source components are governed by their own licences.'],
                marketing_digital: ['The advertising (media) budget is paid by the Client directly to the platforms and is not included in the fees, unless Schedule I says so. Ad accounts are and remain the Client’s property, and the Client must give the Provider access.', 'The Provider manages campaigns within the approved budget and objectives and provides periodic reports. It does not control platform algorithms, costs or policies (including ad rejection and account suspension) and does not guarantee results.', 'The Client shall promptly inform the Provider of changes to prices, offers, stock or conditions that affect the campaigns.'],
                redes_sociais: ['Social media accounts are and remain the Client’s property, and the Client grants the Provider the access or admin permissions needed.', 'The Provider submits the editorial plan for the Client’s approval as far ahead as stated in Schedule I (failing that, up to 5 business days before each month starts) and publishes after approval, express or tacit under the clause «Client’s obligations».', 'The Provider is not liable for content supplied by the Client or for platform decisions (such as restrictions or account suspension), and does not guarantee followers, reach or engagement. Paid ads are not included unless Schedule I says so.'],
                automacao_ia: ['The Provider sets up the automations, integrations and AI assistants described in Schedule I. The Client grants access to the tools involved (for example WhatsApp, CRM, spreadsheets and payments) and remains the holder of those accounts.', 'Third-party costs (APIs, messaging, licences and AI model usage) are not included unless Schedule I says so, and are borne by the Client. The Provider does not control changes, limits or outages of third-party services.', 'AI assistants may produce inaccurate answers; the Client is responsible for setting their limits and for reviewing sensitive cases. The Provider does not guarantee specific results.'],
                design_grafico: ['The Provider delivers the graphic pieces in the formats stated in Schedule I; final and editable files are made available after full payment. Third-party fonts, images and elements follow their own licences.'],
                outro: []
            }
        },
        es: {
            pi_1b: '',
            resp_lim_total: 'al valor total del Contrato',
            resp_lim_12m: 'al importe pagado o debido por el Cliente en los 12 meses anteriores al hecho que la originó',
            fiscal_geral: 'identificación fiscal n.º', unidade: ['mes', 'meses'], locale: 'es-ES', contrato: 'Contrato de Prestación de Servicios', numero: 'Contrato n.º', primeiros: 'Entre', e: 'Y',
            alias_p: 'Prestador', alias_c: 'Cliente', ambos: 'Partes', clausula: 'Cláusula', anexo: 'Anexo',
            parte_p: 'PRIMER OTORGANTE', parte_c: 'SEGUNDO OTORGANTE',
            parte: '{nome}, con domicilio social en {morada}, {fiscal} {nif}, representada por {rep}{cargo}, correo electrónico {email}, en adelante «{alias}»;',
            parte_c_fim: '{nome}, con domicilio social en {morada}, {fiscal} {nif}, representada por {rep}{cargo}, correo electrónico {email}, en adelante «{alias}».',
            cargo: ', en calidad de {c}', considerando: 'Considerando que',
            rec_a: 'El Prestador ejerce, con carácter profesional, la actividad de prestación de servicios de sitios web, redes sociales, diseño gráfico, sistemas, automatización e IA y marketing digital;',
            rec_b: 'El Cliente desea contratar al Prestador para la ejecución de los servicios descritos en el presente Contrato;',
            rec_c: 'Las Partes han negociado libremente los términos de este Contrato y desean establecer por escrito los derechos y las obligaciones de cada una;',
            celebram: 'Se celebra, y se acepta recíprocamente, el presente Contrato de Prestación de Servicios, que se rige por las siguientes cláusulas:',
            t_objeto: 'Objeto', t_ambito: 'Ejecución de los Servicios', t_p: 'Obligaciones del Prestador', t_c: 'Obligaciones del Cliente', t_rev: 'Revisiones y aprobaciones', t_esp: 'Condiciones específicas de los Servicios',
            t_preco: 'Precio y pago', t_duracao: 'Duración y renovación', t_cessacao: 'Terminación del Contrato', t_pi: 'Propiedad intelectual', t_conf: 'Confidencialidad',
            t_rgpd: 'Protección de datos personales', t_resp: 'Responsabilidad', t_indep: 'Independencia de las Partes y subcontratación', t_forca: 'Fuerza mayor', t_com: 'Comunicaciones',
            t_cessao: 'Cesión de la posición contractual', t_extra: 'Cláusulas adicionales', t_gerais: 'Disposiciones generales', t_lei: 'Ley aplicable y fuero', t_assinatura: 'Firma y ejemplares',
            objeto_1: 'El presente Contrato tiene por objeto la prestación, por el Prestador al Cliente, de los servicios descritos en el Anexo I (los «Servicios»), en régimen de prestación de servicios.',
            objeto_2: 'Los Servicios fueron propuestos en la propuesta comercial n.º {prop}, aceptada por el Cliente, cuyo contenido se considera integrado en este Contrato en todo lo que no lo contradiga.',
            objeto_3: 'Forman parte integrante del Contrato el Anexo I (Servicios y precios) y el Anexo II (Calendario de pagos){anexo3}. En caso de contradicción, prevalece el cuerpo del Contrato sobre los Anexos y estos sobre la propuesta comercial.',
            anexo3_txt: ' y el Anexo III (Tratamiento de datos personales)',
            ambito_1: 'El Prestador se obliga a ejecutar los Servicios con la diligencia, la competencia técnica y el profesionalismo exigibles, según las buenas prácticas de su actividad. La obligación del Prestador es de medios y no de resultado.',
            ambito_2: 'Los servicios no previstos en el Anexo I, así como los cambios relevantes de alcance, plazos o entregables, solo se ejecutarán tras acuerdo escrito de las Partes, con el correspondiente presupuesto.',
            ambito_3: 'Salvo indicación en contrario en el Anexo I, los plazos de entrega indicados son estimaciones de buena fe, contados desde que el Prestador reciba del Cliente todos los elementos necesarios.',
            p_1: 'Ejecutar los Servicios con los medios humanos y técnicos adecuados, respetando la ley aplicable, incluidas las normas de publicidad y de protección de datos.',
            p_2: 'Indicar al Cliente un interlocutor para el seguimiento de los Servicios e informarle con regularidad de su avance.',
            p_3: 'Presentar al Cliente, con la periodicidad indicada en el Anexo I (o, en su defecto, mensualmente en los servicios de ejecución continuada), un informe de situación de los Servicios.',
            p_4: 'Comunicar de inmediato al Cliente cualquier circunstancia que pueda afectar a la ejecución de los Servicios o a los plazos acordados.',
            c_1: 'Facilitar al Prestador, a tiempo, la información, los contenidos, los materiales, los accesos (cuentas, plataformas, dominio, alojamiento) y las aprobaciones necesarios para los Servicios, garantizando que son exactos y que dispone de los derechos necesarios para utilizarlos.',
            c_2: 'Designar un interlocutor con poderes para tomar decisiones y aprobar entregables en nombre del Cliente.',
            c_3: 'Pronunciarse sobre los entregables presentados en el plazo de {dias} días hábiles. A falta de respuesta, el Prestador enviará una notificación de recordatorio concediendo un plazo adicional de 2 días hábiles. Transcurrido ese plazo sin pronunciamiento del Cliente, el entregable se considera aprobado, sin perjuicio de la responsabilidad del Prestador por defectos técnicos o disconformidades no razonablemente detectables en el momento de la aprobación.',
            c_4: 'Los retrasos del Cliente en el cumplimiento de sus obligaciones prorrogan, por igual período, los plazos del Prestador, sin derecho a reducción del precio.',
            c_5: 'Pagar el precio conforme a la cláusula «Precio y pago».',
            rev_1: 'Cada entregable incluye {n} ronda(s) de revisión, entendiéndose cada ronda como un conjunto consolidado de cambios comunicados por el Cliente en una única comunicación escrita. Las revisiones deben respetar el briefing previamente aprobado. La corrección de errores, omisiones o disconformidades imputables al Prestador no se contabiliza como ronda de revisión ni da lugar a costes adicionales.',
            rev_2: 'Los cambios sustanciales al concepto o al briefing ya aprobado, las nuevas direcciones creativas o las revisiones adicionales constituyen servicio adicional y se presupuestarán antes de empezar.',
            esp_intro: 'A los Servicios indicados se aplican las siguientes condiciones específicas, además de las demás cláusulas:',
            preco_total: 'El precio de los Servicios es el indicado en el Anexo I. El valor total del Contrato es de {total}{iva}.',
            preco_mensal: 'La remuneración mensual de los Servicios es de {mensal}{iva}, y se mantiene mientras el Contrato esté vigente.',
            preco_pontual: 'Los servicios de ejecución puntual tienen un valor de {pontual}{iva}.',
            iva_mais: ', más IVA al tipo legal vigente', iva_incl: ', IVA incluido', iva_isento: ', exento de IVA',
            preco_pagamento: 'Las facturas se emiten en las fechas indicadas en el Anexo II y se pagan por {metodo}, {venc}. Los plazos de pago de servicios adicionales y de remuneración variable son de {prazo} días desde la fecha de la factura.',
            venc_antecipado: 'con vencimiento en la fecha indicada en dicho Anexo (por anticipado, al inicio de cada período de servicio al que corresponde)',
            venc_datas: 'con vencimiento en las fechas indicadas en dicho Anexo',
            preco_iban: 'Los pagos se realizan a la cuenta bancaria con IBAN {iban}, u otra que el Prestador indique por escrito.',
            preco_terceiros: 'El precio no incluye costes de terceros — como presupuesto de anuncios, licencias de software, imágenes o fuentes, plataformas, tasas o desplazamientos — que solo se asumirán previa aprobación escrita del Cliente, que debe identificar el importe o el límite máximo del gasto. Los gastos que excedan el importe o el límite aprobado no son exigibles al Cliente sin nueva aprobación escrita; los costes aprobados se facturarán al Cliente o los pagará él directamente.',
            preco_mora: 'El retraso en el pago da derecho al Prestador a intereses de demora al tipo legal aplicable a las operaciones comerciales y, transcurridos 15 días desde la notificación escrita, a suspender los Servicios hasta la regularización, sin perjuicio del derecho de resolución. Los plazos de ejecución quedan suspendidos durante la suspensión.',
            preco_antecipado: 'Los pagos anticipados corresponden a la reserva de capacidad y a la prestación de los servicios en el período mensual respectivo. En caso de terminación anticipada del Contrato, se determinarán los servicios efectivamente prestados, los trabajos en curso y los gastos previamente aprobados y no recuperables. Los importes pagados correspondientes a servicios no prestados serán objeto de ajuste entre las Partes, conforme a la cláusula «Terminación del Contrato».',
            preco_sucesso: 'La parte variable de la remuneración ({lista}) se calcula sobre el importe efectivamente facturado y cobrado por el Cliente como resultado de los Servicios. El Cliente facilitará al Prestador, antes del 5.º día hábil de cada mes, la información necesaria para el cálculo, y el Prestador emitirá la factura correspondiente. El Prestador puede verificar la información facilitada.',
            preco_atualiza: 'En contratos renovados o de duración indefinida, el Prestador puede actualizar los precios mediante comunicación escrita con una antelación mínima de 60 días.',
            dur_fixo: 'El Contrato produce efectos en la fecha de la última firma y los Servicios comienzan el {inicio}. El Contrato tiene una duración de {n} {unid}, y termina el {fim}.',
            dur_fixo_renova: 'Al término, se renueva automáticamente por períodos sucesivos de igual duración, salvo que cualquiera de las Partes comunique a la otra por escrito su oposición a la renovación con una antelación mínima de {aviso} días.',
            dur_fixo_nao: 'Al término, el Contrato finaliza sin necesidad de aviso, pudiendo renovarse por acuerdo escrito de las Partes.',
            dur_indet: 'El Contrato produce efectos en la fecha de la última firma y los Servicios comienzan el {inicio}. El Contrato tiene duración indefinida y puede ser denunciado por cualquiera de las Partes conforme a la cláusula «Terminación del Contrato».',
            dur_projeto: 'El Contrato produce efectos en la fecha de la última firma y los Servicios comienzan el {inicio}. El Contrato permanece vigente hasta la conclusión y aceptación de los entregables previstos en el Anexo I{fim}.',
            dur_projeto_fim: ', estando prevista su conclusión hasta el {fim}',
            ces_1: 'Cualquiera de las Partes puede poner fin al Contrato, sin invocar justa causa, mediante comunicación escrita con una antelación mínima de {aviso} días. En caso de terminación anticipada, serán debidos los importes correspondientes a los servicios efectivamente prestados, al período de preaviso y a los trabajos en curso, en proporción al trabajo realizado, así como los gastos previamente aprobados y no recuperables. Los importes pagados por adelantado correspondientes a servicios no prestados serán objeto de ajuste y, en su caso, reembolso, sin perjuicio de otros importes legítimamente debidos.',
            ces_2: 'Cualquiera de las Partes puede resolver el Contrato con efectos inmediatos en caso de incumplimiento grave de la otra Parte que no se subsane en 15 días desde la recepción de una notificación escrita que lo describa, así como en caso de insolvencia de la otra Parte.',
            ces_3: 'Con la terminación, el Prestador entregará al Cliente los trabajos ya pagados y la información a la que el Cliente tenga derecho conforme a la cláusula «Propiedad intelectual», y cada Parte devolverá o eliminará los materiales, accesos e información confidencial de la otra.',
            ces_4: 'Subsisten a la terminación, mientras sea necesario, las cláusulas sobre pago, propiedad intelectual, confidencialidad, protección de datos, responsabilidad y ley aplicable y fuero.',
            pi_1: 'Los materiales creados específicamente para el Cliente en el marco de los Servicios (como logotipos, piezas gráficas, contenidos, vídeos y textos) e identificados en el Anexo I se ceden al Cliente, en exclusiva, para la finalidad para la que fueron encargados. La cesión abarca los derechos patrimoniales de uso, reproducción, adaptación, distribución y comunicación pública, dentro de los límites legalmente permitidos, y produce efectos tras el pago íntegro de los importes debidos; hasta ese pago, el Cliente solo dispone de una licencia de uso temporal y revocable.',
            pi_2: 'Siguen siendo propiedad del Prestador (o de terceros) los métodos, modelos, herramientas, software, bibliotecas, ideas y materiales preexistentes o de uso general, que se distinguen de los materiales cedidos al Cliente, y sobre los que el Cliente recibe una licencia no exclusiva en la medida necesaria para usar los entregables.',
            pi_3: 'Los elementos de terceros (imágenes de bancos de imágenes, tipografías, música, plugins y software) están sujetos a sus licencias, que el Cliente debe cumplir.',
            pi_4: 'El Cliente garantiza que los contenidos y materiales que facilita no infringen derechos de terceros y mantendrá indemne al Prestador frente a cualquier reclamación relativa a ellos.',
            pi_5: 'El Prestador podrá mencionar al Cliente y mostrar los trabajos realizados en el marco de este Contrato en su portafolio y comunicaciones comerciales, con autorización previa y escrita del Cliente, sin poder divulgar información confidencial, datos personales ni materiales aún no hechos públicos sin autorización específica.',
            conf_1: 'Cada Parte se obliga a mantener confidencial, y a usar solo para los fines de este Contrato, toda la información no pública de carácter comercial, técnico, financiero o estratégico de la otra Parte a la que tenga acceso, durante el Contrato y los {anos} años siguientes a su terminación.',
            conf_2: 'La obligación no abarca la información que sea o llegue a ser pública sin violación del Contrato, que ya fuera conocida legítimamente por la Parte receptora, o cuya divulgación exija la ley o una autoridad competente (en cuyo caso se avisará a la otra Parte siempre que la ley lo permita).',
            rgpd_1: 'Cada Parte cumplirá la Ley brasileña n.º 13.709/2018 (Ley General de Protección de Datos Personales – LGPD) y demás legislación de protección de datos aplicable. Cada Parte es responsable del tratamiento de los datos personales de sus propios empleados y representantes a efectos de gestión de este Contrato.',
            rgpd_2: 'Cuando, en la ejecución de los Servicios, el Prestador trate datos personales por cuenta del Cliente, actuará como encargado del tratamiento (operador), conforme a la LGPD y al Anexo III, tratándolos solo según las instrucciones documentadas del Cliente. El Cliente, como responsable del tratamiento (controlador), garantiza que tiene base legal (artículos 7 y 11 de la LGPD) para dicho tratamiento.',
            rgpd_3: 'El Prestador adoptará medidas técnicas y organizativas adecuadas, garantizará la confidencialidad de las personas autorizadas a tratar los datos, notificará al Cliente en un plazo razonable tras tener conocimiento de un incidente de seguridad que pueda acarrear riesgo o daño relevante a los titulares, para que el Cliente cumpla el artículo 48 de la LGPD y, al término de los Servicios, suprimirá o devolverá los datos, a elección del Cliente, salvo obligación legal de conservación.',
            rgpd_4: 'El Cliente autoriza de forma general el recurso a subencargados necesarios para la prestación de los Servicios (por ejemplo, plataformas de gestión de redes sociales, de correo o de alojamiento), a quienes el Prestador impone obligaciones equivalentes y sobre los que informará al Cliente cuando lo solicite.',
            resp_1: 'El Prestador no garantiza resultados comerciales o de comunicación — como ventas, contactos, seguidores, alcance, posicionamiento en buscadores o retorno de la inversión —, que dependen de factores externos, incluidas las decisiones y reglas de las plataformas digitales.',
            resp_2: 'La responsabilidad de cada Parte frente a la otra por daños derivados del Contrato queda limitada, en su conjunto, {limite}. Este límite se aplica a ambas Partes, no abarca el pago del precio debido y no se aplica en caso de dolo o culpa grave, de violación de los deberes de confidencialidad, de las normas de protección de datos personales o de infracción de derechos de propiedad intelectual de la otra Parte, ni en otros casos en que la ley no permita limitar o excluir la responsabilidad. Salvo en esos casos, ninguna de las Partes responde por lucro cesante ni por daños indirectos.',
            resp_3: 'El Prestador no responde por retrasos o fallos causados por información, materiales o aprobaciones que el Cliente no facilite a tiempo, por decisiones del Cliente contrarias a las recomendaciones del Prestador, ni por fallos de servicios de terceros.',
            indep_1: 'El Prestador actúa con autonomía técnica y organizativa, sin que exista entre las Partes, ni entre el Cliente y los empleados del Prestador, relación laboral, societaria o de agencia.',
            indep_2: 'El Prestador puede recurrir a colaboradores y subcontratistas para ejecutar los Servicios, y sigue siendo plenamente responsable ante el Cliente de esa ejecución.',
            forca_1: 'Ninguna de las Partes responde por el incumplimiento o retraso causado por fuerza mayor, como catástrofes naturales, pandemias, guerra, actos de autoridad, fallos generalizados de energía, telecomunicaciones o plataformas digitales, siempre que lo comunique a la otra Parte lo antes posible y haga lo que esté a su alcance para limitar los efectos. Si el impedimento dura más de 60 días, cualquiera de las Partes puede resolver el Contrato sin indemnización.',
            com_1: 'Las comunicaciones entre las Partes relativas al Contrato se harán por escrito, a las direcciones electrónicas y postales indicadas al inicio del Contrato, o a otras que una Parte comunique a la otra, y se consideran recibidas el día hábil siguiente al envío.',
            cessao_1: 'Ninguna de las Partes puede ceder su posición contractual ni los derechos y obligaciones derivados del Contrato sin el consentimiento previo y escrito de la otra Parte.',
            gerais_1: 'El Contrato, con sus Anexos, constituye el acuerdo íntegro de las Partes sobre su objeto y sustituye todos los entendimientos anteriores. Cualquier modificación o renuncia solo es válida si se hace por escrito y firmada por ambas Partes.',
            gerais_2: 'Si alguna disposición es o llega a ser nula o ineficaz, las demás siguen en vigor, y las Partes la sustituirán por otra de efecto equivalente. La tolerancia de una Parte ante el incumplimiento de la otra no implica renuncia a ningún derecho.',
            lei_1: 'El Contrato se rige por la ley brasileña.',
            lei_2: 'Para la resolución de cualquier litigio derivado del Contrato, las Partes se someten a los tribunales de la comarca de {foro}, con renuncia expresa a cualquier otro fuero.',
            ass_1: 'El Contrato puede firmarse electrónicamente, incluso mediante firma electrónica cualificada, avanzada o simple, con el valor jurídico que la ley le atribuye, y en ejemplares que en conjunto constituyen un único instrumento. Cada Parte conserva un ejemplar.',
            assina_titulo: 'Firmas', em: 'El', data_lbl: 'Fecha', local_lbl: 'Lugar', assinatura: 'Firma', nome: 'Nombre', cargo_lbl: 'Cargo', pelo: 'Por {nome}',
            sig_intro: 'Hecho en {local}, el {data}, en dos ejemplares, uno para cada Parte.',
            anexo1: 'Servicios y precios', anexo2: 'Calendario de pagos', anexo3: 'Tratamiento de datos personales',
            th_servico: 'Servicio', th_modelo: 'Modelo', th_valor: 'Importe', m_mensal: 'Mensual', m_pontual: 'Puntual', m_sucesso: 'Sobre resultados', mes: 'mes', do_fechado: 'del valor de lo que se cierre',
            entregaveis: 'Entregables', total_simples: 'Total', total_mensal: 'Total mensual', total_pontual: 'Total puntual', desconto: 'Descuento aplicado', total_contrato: 'Valor total del contrato ({n} {unid})', sem_iva: 'Importes sin IVA. El IVA se añade al tipo legal vigente.',
            iva_nota_incl: 'Importes con IVA incluido.', iva_nota_isento: 'Importes exentos de IVA.',
            th_pagamento: 'Pago', th_vencimento: 'Vencimiento', pag_assinatura: 'A la firma del Contrato', pag_inicio: 'Inicio de la prestación del servicio', pag_mes: 'Inicio del mes {n}', pag_ultimo: 'Inicio del último mes', pag_mensal_todos: 'Inicio de cada mes de servicio',
            pag_entrada: 'Entrada ({pct}%)', pag_saldo: 'Saldo ({pct}%) — a la conclusión de los Servicios', pag_unico: 'Pago único', pag_pontual: 'Importe puntual (a la firma)', pag_nota_antecipado: 'Pago anticipado: cada mensualidad se paga al inicio de su mes de servicio.',
            pag_variavel: 'Remuneración variable: {lista}, calculada y facturada conforme al Contrato.', mes_n: 'mes {n}',
            rgpd_a_obj: 'Objeto y finalidad', rgpd_a_obj_t: 'Tratamiento de datos personales por el Prestador, por cuenta del Cliente, en la medida necesaria para la ejecución de los Servicios descritos en el Anexo I.',
            rgpd_a_dur: 'Duración', rgpd_a_dur_t: 'La del Contrato, hasta la supresión o devolución de los datos conforme a la cláusula «Protección de datos personales».',
            rgpd_a_nat: 'Naturaleza del tratamiento', rgpd_a_nat_t: 'Recogida, registro, organización, consulta, utilización, publicación y supresión, en cuentas y plataformas del Cliente o del Prestador, según los Servicios.',
            rgpd_a_tipo: 'Tipos de datos', rgpd_a_tipo_t: 'Datos de identificación y contacto, imágenes y vídeos, contenidos publicados, datos de interacción (mensajes, comentarios) y datos de rendimiento de campañas.',
            rgpd_a_tit: 'Categorías de interesados', rgpd_a_tit_t: 'Clientes, clientes potenciales, seguidores y usuarios de las plataformas, empleados del Cliente y creadores de contenido.',
            rgpd_a_obrig: 'Obligaciones del Prestador', rgpd_a_obrig_t: 'Tratar los datos solo según instrucciones documentadas del Cliente; garantizar la confidencialidad; adoptar medidas de seguridad adecuadas; asistir al Cliente en el ejercicio de los derechos de los interesados y en el cumplimiento de los artículos 46 a 48 de la LGPD; comunicar incidentes de seguridad en un plazo razonable; poner a disposición la información necesaria para demostrar el cumplimiento y permitir auditorías razonables; suprimir o devolver los datos al término de los Servicios.',
            esp: {
                sistemas: ['El Prestador desarrolla el sistema, la plataforma o el panel descritos en el Anexo I, por fases y con validación del Cliente en cada entrega. Los cambios del alcance aprobado se acuerdan por escrito y pueden alterar precio y plazo.', 'El Cliente facilita, en tiempo útil, las reglas de negocio, los datos y los accesos necesarios. Alojamiento, bases de datos, dominios, licencias y servicios de terceros no están incluidos, salvo indicación en el Anexo I, y se contratan en nombre y a expensas del Cliente.', 'El Prestador corrige, sin coste, los fallos reportados en los 30 días siguientes a la entrega. Mantenimiento, soporte y nuevas funcionalidades son servicios adicionales.'],
                website: ['El sitio web se considera entregado cuando se pone a disposición para aprobación o se publica. El Cliente facilita, a tiempo, textos, imágenes, logotipos y accesos (dominio y alojamiento).', 'Dominio, alojamiento, certificados, licencias de plugins o temas y herramientas de terceros no están incluidos, salvo indicación en el Anexo I, y se contratarán a nombre y por cuenta del Cliente.', 'El Prestador corrige, sin coste, los errores de funcionamiento notificados en los 30 días siguientes a la publicación. Mantenimiento, actualizaciones y nuevas funcionalidades son servicios adicionales.', 'El código desarrollado específicamente para el Cliente se cede conforme a la cláusula «Propiedad intelectual»; los componentes de terceros y de código abierto se rigen por sus licencias.'],
                marketing_digital: ['El presupuesto de anuncios (media) lo paga el Cliente directamente a las plataformas y no está incluido en el precio, salvo indicación en el Anexo I. Las cuentas de anuncios son y siguen siendo propiedad del Cliente, a quien corresponde dar acceso al Prestador.', 'El Prestador gestiona las campañas dentro del presupuesto y los objetivos aprobados y presenta informes periódicos. No controla los algoritmos, los costes ni las políticas de las plataformas (incluido el rechazo de anuncios y la suspensión de cuentas) y no garantiza resultados.', 'El Cliente informará a tiempo al Prestador de cambios en precios, ofertas, stock o condiciones que afecten a las campañas.'],
                redes_sociais: ['Las cuentas de redes sociales son y siguen siendo propiedad del Cliente, que concede al Prestador los accesos o permisos de administración necesarios.', 'El Prestador somete el plan editorial a la aprobación del Cliente con la antelación indicada en el Anexo I (en su defecto, hasta 5 días hábiles antes del inicio de cada mes) y publica tras la aprobación, expresa o tácita conforme a la cláusula «Obligaciones del Cliente».', 'El Prestador no responde por contenidos facilitados por el Cliente ni por decisiones de las plataformas (como restricciones o suspensión de cuentas), ni garantiza seguidores, alcance o interacciones. Los anuncios de pago no están incluidos, salvo indicación en el Anexo I.'],
                automacao_ia: ['El Prestador configura las automatizaciones, integraciones y asistentes de IA descritos en el Anexo I. El Cliente concede los accesos a las herramientas implicadas (por ejemplo WhatsApp, CRM, hojas de cálculo y pagos) y sigue siendo titular de esas cuentas.', 'Los costes de terceros (APIs, mensajería, licencias y consumo de modelos de IA) no están incluidos, salvo indicación en el Anexo I, y los asume el Cliente. El Prestador no controla cambios, límites ni caídas de servicios de terceros.', 'Los asistentes de IA pueden producir respuestas imprecisas; el Cliente es responsable de definir sus límites y de revisar los casos sensibles. El Prestador no garantiza resultados concretos.'],
                design_grafico: ['El Prestador entrega las piezas gráficas en los formatos indicados en el Anexo I; los archivos finales y editables se ponen a disposición tras el pago íntegro. Las fuentes, imágenes y elementos de terceros siguen sus licencias.'],
                outro: []
            }
        }
    };

    // ======================= PAÍSES E IDENTIFICAÇÃO FISCAL =======================
    // Nem todos os países usam NIF: cada um tem a sua identificação de empresa (CNPJ no Brasil, EIN nos EUA...). Para os que não estão na lista fica «identificação fiscal».
    const FISCAL = {
        PT: 'NIF/NIPC', BR: 'CNPJ', US: 'EIN', GB: 'Company no. / VAT no.', IE: 'Company no. / VAT no.', ES: 'NIF/CIF', FR: 'SIREN / n.º TVA', DE: 'USt-IdNr. / HRB', IT: 'Partita IVA / Codice fiscale',
        NL: 'KvK / BTW', BE: 'BCE / TVA', LU: 'RCS / TVA', CH: 'UID / MWST', AT: 'UID / FN', PL: 'NIP / KRS', SE: 'Org.nr / VAT', DK: 'CVR', FI: 'Y-tunnus', NO: 'Org.nr', LV: 'Reg. no. / PVN', LT: 'Įm. kodas / PVM',
        EE: 'Registrikood / KMKR', CA: 'BN (Business Number)', MX: 'RFC', AR: 'CUIT', CL: 'RUT', CO: 'NIT', PE: 'RUC', UY: 'RUT', AO: 'NIF', MZ: 'NUIT', CV: 'NIF', AU: 'ABN', NZ: 'NZBN', IN: 'GSTIN / PAN',
        AE: 'TRN / Licence no.', SG: 'UEN', JP: 'Corporate Number', CN: 'USCC', ZA: 'Reg. no. / VAT no.', IL: 'Company no.', TR: 'VKN', GR: 'AFM', RO: 'CUI', CZ: 'IČO / DIČ', HU: 'Adószám', BG: 'EIK / VAT'
    };
    const ALIAS_PAIS = { inglaterra: 'GB', england: 'GB', 'reino unido': 'GB', 'united kingdom': 'GB', uk: 'GB', escocia: 'GB', scotland: 'GB', eua: 'US', usa: 'US', 'estados unidos da america': 'US', 'estados unidos': 'US', 'united states': 'US', 'united states of america': 'US', brasil: 'BR', brazil: 'BR', espanha: 'ES', spain: 'ES', espana: 'ES', letonia: 'LV', latvia: 'LV' };
    const semAcentos = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    let mapaPaises = null;
    function nomePais(codigo, idioma) { try { return new Intl.DisplayNames([idioma || 'pt'], { type: 'region' }).of(codigo) || codigo; } catch { return codigo; } }
    // devolve o código ISO (PT, BR...) a partir do que está escrito: o código, ou o nome em português, inglês ou espanhol; null se não reconhecer
    function codigoPais(texto) {
        const x = semAcentos(texto); if (!x) return null;
        if (/^[a-z]{2}$/.test(x) && FISCAL[x.toUpperCase()]) return x.toUpperCase();
        if (ALIAS_PAIS[x]) return ALIAS_PAIS[x];
        if (!mapaPaises) { mapaPaises = new Map(); for (const c of Object.keys(FISCAL)) for (const l of ['pt', 'en', 'es']) mapaPaises.set(semAcentos(nomePais(c, l)), c); }
        return mapaPaises.get(x) || null;
    }
    // rótulo da identificação fiscal: null se o país não é reconhecido (quem chama escolhe o texto geral)
    const rotuloFiscal = (pais) => { const c = codigoPais(pais); return c ? FISCAL[c] : null; };

    // ======================= UTILITÁRIOS =======================
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const arred = (n) => Math.round(n * 100) / 100;
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    // Soma de meses a uma data AAAA-MM-DD (no fim do mês fica no último dia: 31 jan + 1 mês = 28/29 fev)
    function somarMeses(iso, n) {
        const [a, m, d] = iso.split('-').map(Number);
        const x = new Date(Date.UTC(a, m - 1 + n, 1));
        const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
        x.setUTCDate(Math.min(d, ultimo));
        return x.toISOString().slice(0, 10);
    }
    const somarDias = (iso, n) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    // fim previsto = início + duração (menos um dia); sem duração, só se foi indicado
    function fimPrevisto(d) {
        if (d.fim) return d.fim;
        const n = Math.round(num(d.duracao_meses));
        return d.inicio && n > 0 ? somarDias(somarMeses(d.inicio, n), -1) : null;
    }

    // Tipo de contrato: duração determinada (tem mensalidade e meses), indeterminada (mensalidade sem meses) ou por projeto (sem mensalidade)
    function tipoContrato(d) {
        const temMensal = d.itens.some((i) => i.modelo === 'mensal' && num(i.valor) > 0);
        const meses = Math.round(num(d.duracao_meses));
        if (temMensal && meses > 0) return 'fixo';
        if (temMensal) return 'indeterminado';
        return 'projeto';
    }

    function totais(d) {
        const soma = (m) => arred(d.itens.filter((i) => i.modelo === m).reduce((s, i) => s + num(i.valor), 0));
        const desc = (v) => arred(v * (1 - num(d.desconto_pct) / 100));
        const mensal = soma('mensal'), pontual = soma('pontual');
        const meses = tipoContrato(d) === 'fixo' ? Math.round(num(d.duracao_meses)) : 0;
        const mensalL = desc(mensal), pontualL = desc(pontual);
        return { mensal, pontual, mensal_liquido: mensalL, pontual_liquido: pontualL, desconto_pct: num(d.desconto_pct), meses,
            total_contrato: meses > 0 ? arred(pontualL + mensalL * meses) : (mensal ? null : pontualL), sucesso: d.itens.filter((i) => i.modelo === 'sucesso') };
    }

    // Linhas do calendário de pagamentos: [{ chave, n, valor, data }]; a data só existe se há data de início (ou é a da assinatura)
    function calendario(d) {
        const t = totais(d), tipo = tipoContrato(d), plano = d.pagamento?.plano || (tipo === 'projeto' ? 'entrada_saldo' : 'mensal_antecipado');
        const linhas = [];
        const dataMes = (n) => (d.inicio ? somarMeses(d.inicio, n) : null);
        if (plano === 'unico') {
            const total = t.total_contrato != null ? t.total_contrato : arred(t.pontual_liquido);
            if (total > 0) linhas.push({ chave: 'unico', valor: total, data: null });
        } else if (plano === 'entrada_saldo') {
            const total = t.total_contrato != null ? t.total_contrato : t.pontual_liquido;
            const pct = Math.min(Math.max(num(d.pagamento?.entrada_pct) || 50, 1), 99);
            if (total > 0) {
                const entrada = arred(total * pct / 100);
                linhas.push({ chave: 'entrada', pct, valor: entrada, data: null });
                linhas.push({ chave: 'saldo', pct: arred(100 - pct), valor: arred(total - entrada), data: tipo === 'fixo' && d.inicio ? dataMes(t.meses - 1) : null });
            }
        } else {                                                                   // mensal antecipado
            if (t.pontual_liquido > 0) linhas.push({ chave: 'pontual', valor: t.pontual_liquido, data: null });
            if (tipo === 'fixo') for (let n = 0; n < t.meses; n++) linhas.push({ chave: n === 0 ? 'inicio' : n === t.meses - 1 && t.meses > 2 ? 'ultimo' : 'mes', n: n + 1, valor: t.mensal_liquido, data: dataMes(n) });
            else if (tipo === 'indeterminado') linhas.push({ chave: 'todos', valor: t.mensal_liquido, data: null });
        }
        return linhas;
    }

    const unidade = (l, n) => l.unidade[n === 1 ? 0 : 1];

    // ======================= CLÁUSULAS =======================
    // devolve [{ titulo, paragrafos: [texto | { lista: [] }] }] já com o idioma do contrato
    function clausulas(d, l, ctx) {
        const { t, tipo, fmt, data } = ctx;
        const ivaTxt = { mais_iva: l.iva_mais, incluido: l.iva_incl, isento: l.iva_isento }[d.iva] || l.iva_mais;
        const out = [];
        const nomes = d.itens.filter((i) => i.modelo === 'sucesso').map((i) => `${i.nome}: ${num(i.valor)}%`).join('; ');
        out.push({ titulo: l.t_objeto, paragrafos: [l.objeto_1, d.proposta_numero ? sub(l.objeto_2, { prop: d.proposta_numero }) : null, sub(l.objeto_3, { anexo3: d.dados_pessoais ? l.anexo3_txt : '' })] });
        out.push({ titulo: l.t_ambito, paragrafos: [l.ambito_1, l.ambito_2, l.ambito_3] });
        out.push({ titulo: l.t_p, paragrafos: [l.p_1, l.p_2, l.p_3, l.p_4] });
        out.push({ titulo: l.t_c, paragrafos: [l.c_1, l.c_2, sub(l.c_3, { dias: num(d.prazo_aprovacao_dias) || 5 }), l.c_4, l.c_5] });
        out.push({ titulo: l.t_rev, paragrafos: [sub(l.rev_1, { n: Math.max(Math.round(num(d.revisoes)), 0) || 2 }), l.rev_2] });
        const servicos = [...new Set(d.itens.map((i) => i.servico))].filter((s) => l.esp[s]?.length);
        if (servicos.length) {
            const nomeDe = (s) => d.itens.find((i) => i.servico === s)?.nome || s;
            out.push({ titulo: l.t_esp, paragrafos: [l.esp_intro, ...servicos.map((s) => ({ sub: nomeDe(s), lista: l.esp[s] }))] });
        }
        const preco = [];
        if (t.total_contrato != null && tipo === 'fixo') preco.push(sub(l.preco_total, { total: fmt(t.total_contrato), iva: ivaTxt }));
        else if (tipo === 'indeterminado') { preco.push(sub(l.preco_mensal, { mensal: fmt(t.mensal_liquido), iva: ivaTxt })); if (t.pontual_liquido) preco.push(sub(l.preco_pontual, { pontual: fmt(t.pontual_liquido), iva: ivaTxt })); }
        else preco.push(sub(l.preco_total, { total: fmt(t.total_contrato ?? t.pontual_liquido), iva: ivaTxt }));
        const plano = d.pagamento?.plano || (tipo === 'projeto' ? 'entrada_saldo' : 'mensal_antecipado');
        preco.push(sub(l.preco_pagamento, { metodo: d.pagamento?.metodo || '—', venc: plano === 'mensal_antecipado' ? l.venc_antecipado : l.venc_datas, prazo: num(d.pagamento?.prazo_dias) || 8 }));
        if (d.pagamento?.iban) preco.push(sub(l.preco_iban, { iban: d.pagamento.iban }));
        preco.push(l.preco_terceiros);
        if (nomes) preco.push(sub(l.preco_sucesso, { lista: nomes }));
        preco.push(l.preco_mora);
        if (plano === 'mensal_antecipado' && tipo !== 'projeto') preco.push(l.preco_antecipado);
        if (tipo !== 'projeto') preco.push(l.preco_atualiza);
        out.push({ titulo: l.t_preco, paragrafos: preco });
        const fim = fimPrevisto(d), aviso = num(d.aviso_dias) || 30;
        const dur = [];
        if (tipo === 'fixo') {
            dur.push(sub(l.dur_fixo, { inicio: data(d.inicio) || '—', n: Math.round(num(d.duracao_meses)), unid: unidade(l, Math.round(num(d.duracao_meses))), fim: data(fim) || '—' }));
            dur.push(d.renovacao === 'automatica' ? sub(l.dur_fixo_renova, { aviso }) : l.dur_fixo_nao);
        } else if (tipo === 'indeterminado') dur.push(sub(l.dur_indet, { inicio: data(d.inicio) || '—' }));
        else dur.push(sub(l.dur_projeto, { inicio: data(d.inicio) || '—', fim: fim ? sub(l.dur_projeto_fim, { fim: data(fim) }) : '' }));
        out.push({ titulo: l.t_duracao, paragrafos: dur });
        out.push({ titulo: l.t_cessacao, paragrafos: [sub(l.ces_1, { aviso }), l.ces_2, l.ces_3, l.ces_4] });
        out.push({ titulo: l.t_pi, paragrafos: [l.pi_1, null, l.pi_2, l.pi_3, l.pi_4, l.pi_5] });
        out.push({ titulo: l.t_conf, paragrafos: [sub(l.conf_1, { anos: num(d.confidencialidade_anos) || 3 }), l.conf_2] });
        if (d.dados_pessoais) out.push({ titulo: l.t_rgpd, paragrafos: [l.rgpd_1, l.rgpd_2, l.rgpd_3, l.rgpd_4] });
        out.push({ titulo: l.t_resp, paragrafos: [l.resp_1, sub(l.resp_2, { limite: tipo === 'indeterminado' ? l.resp_lim_12m : l.resp_lim_total }), l.resp_3] });
        out.push({ titulo: l.t_indep, paragrafos: [l.indep_1, l.indep_2] });
        out.push({ titulo: l.t_forca, paragrafos: [l.forca_1] });
        out.push({ titulo: l.t_com, paragrafos: [l.com_1] });
        out.push({ titulo: l.t_cessao, paragrafos: [l.cessao_1] });
        if (d.clausulas_extra?.length) out.push({ titulo: l.t_extra, paragrafos: d.clausulas_extra });
        out.push({ titulo: l.t_gerais, paragrafos: [l.gerais_1, l.gerais_2] });
        out.push({ titulo: l.t_lei, paragrafos: [l.lei_1, sub(l.lei_2, { foro: d.foro || 'São Paulo' })] });
        out.push({ titulo: l.t_assinatura, paragrafos: [l.ass_1] });
        return out;
    }

    // ======================= RENDER =======================
    // contrato = { numero, criado_em, dados, empresa: { nome } }; marca = { marca, lema, email, nome }
    function render(contrato, marca) {
        const d = contrato.dados, l = T[d.idioma] || T.pt;
        const fmt = (v) => new Intl.NumberFormat(l.locale, { style: 'currency', currency: d.moeda || 'EUR', minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
        const data = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString(l.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
        const t = totais(d), tipo = tipoContrato(d);
        const ctx = { t, tipo, fmt, data };
        const dataContrato = d.data_contrato || (contrato.criado_em ? String(contrato.criado_em).slice(0, 10) : new Date().toISOString().slice(0, 10));
        const parte = (p, alias, fim) => sub(fim ? l.parte_c_fim : l.parte, { nome: `<b>${esc(p.nome || '________________')}</b>`, morada: esc(p.morada || '________________'), fiscal: esc(rotuloFiscal(alias === 'p' ? 'PT' : p.pais) ? (rotuloFiscal(alias === 'p' ? 'PT' : p.pais) + (d.idioma === 'en' ? ' no.' : ' n.º')) : l.fiscal_geral), nif: esc(p.nif || '__________'),
            rep: `<b>${esc(p.representante || '________________')}</b>`, cargo: p.cargo ? sub(l.cargo, { c: esc(p.cargo) }) : '', email: esc(p.email || '________________'), alias: l['alias_' + alias] });
        const lista = clausulas(d, l, ctx);
        const corpo = lista.map((c, n) => {
            let sub_n = 0;
            const paras = c.paragrafos.filter(Boolean).map((p) => {
                if (typeof p === 'object') return `<div class="ct-esp"><b>${esc(p.sub)}</b><ul>${p.lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
                sub_n++;
                return `<p><span class="ct-n">${n + 1}.${sub_n}</span>${esc(p)}</p>`;
            }).join('');
            return `<section class="ct-cl"><h3><span>${esc(l.clausula)} ${n + 1}.ª</span> ${esc(c.titulo)}</h3>${paras}</section>`;
        }).join('');

        // ----- anexo I -----
        const modeloNome = (m) => l['m_' + m];
        const linhasAnexo = d.itens.map((i) => `<tr><td><b>${esc(i.nome)}</b>${i.descricao ? `<p>${esc(i.descricao)}</p>` : ''}${i.entregaveis?.length ? `<p class="ct-ent"><i>${esc(l.entregaveis)}:</i></p><ul>${i.entregaveis.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${i.nota ? `<p class="ct-nota">${esc(i.nota)}</p>` : ''}</td>
            <td>${esc(modeloNome(i.modelo))}</td><td class="num">${i.modelo === 'sucesso' ? `${esc(String(num(i.valor)))}% <small>${esc(l.do_fechado)}</small>` : esc(fmt(i.valor))}${i.modelo === 'mensal' ? ` <small>/ ${esc(l.mes)}</small>` : ''}</td></tr>`).join('');
        const tot = [];
        if (t.mensal) tot.push(`<tr class="tot"><td colspan="2">${esc(l.total_mensal)}</td><td class="num">${esc(fmt(t.mensal))}</td></tr>`);
        if (t.pontual) tot.push(`<tr class="tot"><td colspan="2">${esc(l.total_pontual)}</td><td class="num">${esc(fmt(t.pontual))}</td></tr>`);
        if (t.desconto_pct > 0 && (t.mensal || t.pontual)) tot.push(`<tr class="liq"><td colspan="2">${esc(l.desconto)} (−${t.desconto_pct}%)</td><td class="num">${esc(fmt(arred(t.mensal + t.pontual - t.mensal_liquido - t.pontual_liquido)))}</td></tr>`);
        if (t.total_contrato != null && t.meses > 0) tot.push(`<tr class="tot final"><td colspan="2">${esc(sub(l.total_contrato, { n: t.meses, unid: unidade(l, t.meses) }))}</td><td class="num">${esc(fmt(t.total_contrato))}</td></tr>`);
        const ivaNota = { mais_iva: l.sem_iva, incluido: l.iva_nota_incl, isento: l.iva_nota_isento }[d.iva] || l.sem_iva;

        // ----- anexo II -----
        const cal = calendario(d);
        const rotuloPag = (p) => ({ unico: l.pag_unico, entrada: sub(l.pag_entrada, { pct: p.pct }), saldo: sub(l.pag_saldo, { pct: p.pct }), pontual: l.pag_pontual, inicio: l.pag_inicio, ultimo: l.pag_ultimo, todos: l.pag_mensal_todos, mes: sub(l.pag_mes, { n: p.n }) })[p.chave];
        const vencimento = (p) => (p.data ? data(p.data) : (p.chave === 'unico' || p.chave === 'entrada' || p.chave === 'pontual' ? l.pag_assinatura : p.chave === 'saldo' ? '' : ''));
        const total2 = t.total_contrato != null ? t.total_contrato : null;
        const sucessoNota = t.sucesso.length ? `<p class="ct-nota">${esc(sub(l.pag_variavel, { lista: t.sucesso.map((i) => `${i.nome}: ${num(i.valor)}%`).join('; ') }))}</p>` : '';
        const plano = d.pagamento?.plano || (tipo === 'projeto' ? 'entrada_saldo' : 'mensal_antecipado');
        const anexo2 = `<table class="ct-tab"><thead><tr><th>${esc(l.th_pagamento)}</th><th>${esc(l.th_vencimento)}</th><th class="num">${esc(l.th_valor)}</th></tr></thead><tbody>
            ${cal.map((p) => `<tr><td>${esc(rotuloPag(p))}</td><td>${esc(vencimento(p))}</td><td class="num">${esc(fmt(p.valor))}${p.chave === 'todos' ? ` <small>/ ${esc(l.mes)}</small>` : ''}</td></tr>`).join('')}
            ${total2 != null ? `<tr class="tot final"><td colspan="2">${esc(t.meses > 0 ? sub(l.total_contrato, { n: t.meses, unid: unidade(l, t.meses) }) : l.total_simples)}</td><td class="num">${esc(fmt(total2))}</td></tr>` : ''}</tbody></table>
            <p class="ct-nota">${esc(ivaNota)}${plano === 'mensal_antecipado' && tipo !== 'projeto' ? ' ' + esc(l.pag_nota_antecipado) : ''}</p>${sucessoNota}`;

        // ----- anexo III -----
        const anexo3 = d.dados_pessoais ? `<section class="ct-anexo"><h2>${esc(l.anexo)} III — ${esc(l.anexo3)}</h2><dl class="ct-dl">${['obj', 'dur', 'nat', 'tipo', 'tit', 'obrig'].map((k) => `<div><dt>${esc(l['rgpd_a_' + k])}</dt><dd>${esc(l['rgpd_a_' + k + '_t'])}</dd></div>`).join('')}</dl></section>` : '';

        const sig = (p, titulo) => `<div class="ct-sig"><span class="ct-sig-t">${esc(titulo)}</span><i></i><b>${esc(p.representante || p.nome || '')}</b><small>${esc(p.cargo ? p.cargo + ' · ' : '')}${esc(p.nome || '')}</small><small class="ct-sig-d">${esc(l.data_lbl)}: ____ / ____ / ________</small></div>`;
        const local = d.local || 'São Paulo';

        return `<div class="ct-doc">
            <header class="ct-cab"><div class="ct-marca"><img src="/assets/images/logo.png" alt=""><div><b>${esc(marca.marca)}</b><span>${esc(marca.lema)}</span></div></div>
                <div class="ct-meta"><span>${esc(l.numero)} ${esc(contrato.numero || '—')}</span><span>${esc(data(dataContrato))}</span><span>${esc(marca.email)}</span></div></header>
            <div class="ct-barra"></div>
            <h1>${esc(l.contrato)}</h1>
            <section class="ct-partes"><p class="ct-lbl">${esc(l.primeiros)}</p>
                <p><span class="ct-parte">${esc(l.parte_p)}</span> ${parte(d.prestador, 'p', false)}</p>
                <p class="ct-lbl">${esc(l.e)}</p>
                <p><span class="ct-parte">${esc(l.parte_c)}</span> ${parte(d.cliente, 'c', true)}</p>
                <p class="ct-nota">${esc(l.alias_p)} / ${esc(l.alias_c)} — ${esc(l.ambos)}.</p></section>
            <section class="ct-rec"><p class="ct-lbl">${esc(l.considerando)}</p>
                <ol type="A"><li>${esc(l.rec_a)}</li><li>${esc(l.rec_b)}</li><li>${esc(l.rec_c)}</li></ol>
                <p>${esc(l.celebram)}</p></section>
            ${corpo}
            <section class="ct-fim"><h3>${esc(l.assina_titulo)}</h3><p>${esc(sub(l.sig_intro, { local, data: data(dataContrato) }))}</p>
                <div class="ct-assinaturas">${sig(d.prestador, sub(l.pelo, { nome: d.prestador.nome || l.alias_p }))}${sig(d.cliente, sub(l.pelo, { nome: d.cliente.nome || l.alias_c }))}</div></section>
            <section class="ct-anexo ct-quebra"><h2>${esc(l.anexo)} I — ${esc(l.anexo1)}</h2>
                <table class="ct-tab"><thead><tr><th>${esc(l.th_servico)}</th><th>${esc(l.th_modelo)}</th><th class="num">${esc(l.th_valor)}</th></tr></thead><tbody>${linhasAnexo}${tot.join('')}</tbody></table>
                <p class="ct-nota">${esc(ivaNota)}</p></section>
            <section class="ct-anexo"><h2>${esc(l.anexo)} II — ${esc(l.anexo2)}</h2>${anexo2}</section>
            ${anexo3}
            <footer class="ct-rodape"><b>${esc(marca.nome)}</b><span>${esc(marca.email)}</span><span>${esc(l.numero)} ${esc(contrato.numero || '—')}</span></footer>
        </div>`;
    }

    // Imprime só o contrato (o browser abre o diálogo; escolher «Guardar como PDF»). O título do documento passa a ser o nome do ficheiro.
    function imprimir(contrato, marca) {
        const caixa = document.createElement('div');
        caixa.id = 'ct-impressao';
        caixa.innerHTML = render(contrato, marca);
        document.body.appendChild(caixa);
        document.body.classList.add('imprimir-contrato');
        const tituloAntes = document.title;
        const limpo = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
        document.title = limpo(`${marca.nome} - ${contrato.numero || (T[contrato.dados.idioma] || T.pt).contrato} - ${contrato.empresa?.nome || ''}`);
        const fim = () => { document.body.classList.remove('imprimir-contrato'); caixa.remove(); document.title = tituloAntes; window.removeEventListener('afterprint', fim); };
        window.addEventListener('afterprint', fim);
        const img = caixa.querySelector('img');
        const agora = () => setTimeout(() => window.print(), 50);
        if (img && !img.complete) { img.addEventListener('load', agora, { once: true }); img.addEventListener('error', agora, { once: true }); } else agora();
    }

    return { render, imprimir, totais, calendario, tipoContrato, fimPrevisto, somarMeses, clausulas, rotuloFiscal, codigoPais, nomePais, PAISES: Object.keys(FISCAL), rotulos: T };
})();
