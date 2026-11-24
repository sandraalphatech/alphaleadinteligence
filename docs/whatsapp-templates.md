# Modelos de WhatsApp de texto fixo

Gerado a partir de `config/whatsapp-templates.json` (não editar à mão: altere o JSON e volte a gerar). Cada modelo tem de ser criado na Meta com **exatamente** o mesmo **nome**, **idioma** e **texto**, na categoria **Marketing**, com os **dois botões de resposta rápida** («Resposta rápida»). Os modelos são de texto fixo: **não têm variáveis**.

**Como criar na Meta:** WhatsApp Manager → **Modelos de mensagem** → **Criar modelo** → categoria **Marketing** → nome → idioma → corpo (cole o texto, com os asteriscos e os sublinhados: *negrito* e _itálico_) → botões **Resposta rápida** (cole os dois textos) → enviar para análise. (Ou: `node scripts/create-whatsapp-templates.js`, com um token que tenha a permissão whatsapp_business_management.)

**Atenção aos botões:** a Meta costuma limitar cada botão de resposta rápida a **25 caracteres**. Se o formulário recusar, use estas versões curtas (o texto do modelo não muda): PT «Sim, quero saber mais» / «Não, obrigado»; BR «Sim, quero saber mais» / «Não, obrigado»; EN «Yes, tell me more» / «No, thanks»; ES «Sí, más información» / «No, gracias». Os botões não têm de ser iguais aos do sistema: o cliente só vê o que a Meta aprovou.

**Antes de enviar a alguém:** só modelos com estado **Aprovado**, só a quem deu **consentimento (opt-in)**, e quem carregar em «Não, obrigado» (ou escrever PARAR) não volta a ser contactado.

**Follow-up:** quem não respondeu à 1.ª mensagem recebe **uma** segunda, passados **3 dias úteis**, com o modelo `followup_*`. A plataforma cria a tarefa «Follow-up WhatsApp» para essa data e a empresa aparece em «Contactar hoje → WhatsApp» quando chegar o dia. Quem responder, ou já tiver recebido o follow-up, não volta a receber.

## Sistemas

### Português (Portugal)

- **Nome:** `sistemas_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a Alpha Tech Solutions e ajudamos empresas a reforçar a sua presença no mercado através de soluções de desenvolvimento web, sistemas, automação e IA, marketing digital e comunicação.

Estivemos a conhecer um pouco do vosso negócio e acreditamos que existem oportunidades interessantes para potenciar a vossa marca, atrair novos clientes e fortalecer o vosso posicionamento.

Gostaríamos de vos apresentar algumas ideias concretas que poderão fazer a diferença no crescimento da empresa.

Faria sentido agendarmos uma breve reunião para vos mostrar o que poderíamos desenvolver em conjunto?
```

### Português (Brasil)

- **Nome:** `sistemas_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a Alpha Tech Solutions e ajudamos empresas a reforçar sua presença no mercado por meio de soluções de desenvolvimento web, sistemas, automação e IA, marketing digital e comunicação.

Conhecemos um pouco do seu negócio e acreditamos que existem oportunidades interessantes para potencializar a sua marca, atrair novos clientes e fortalecer o seu posicionamento.

Gostaríamos de apresentar algumas ideias concretas que podem fazer a diferença no crescimento da empresa.

Faria sentido agendarmos uma breve reunião para mostrar o que poderíamos desenvolver juntos?
```

### Inglês

- **Nome:** `sistemas_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are Alpha Tech Solutions, and we work with businesses looking to strengthen their brand identity and stand out in an increasingly competitive market.

A strong, consistent brand can make a significant difference in how customers recognise, perceive and value your business.

We would love to share some ideas on how to improve your brand identity and market positioning.

Would you be available for a brief meeting to explore some opportunities for your brand?
```

### Espanhol

- **Nome:** `sistemas_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
Hola!

Somos Alpha Tech Solutions y trabajamos con empresas que buscan fortalecer su identidad de marca y diferenciarse en un mercado cada vez más competitivo.

Una marca sólida, coherente y bien posicionada puede marcar una gran diferencia en la forma en que los clientes reconocen, perciben y valoran vuestro negocio.

Nos gustaría compartir algunas ideas para potenciar la identidad y el posicionamiento de vuestra marca.

Estaríais disponibles para una breve reunión y descubrir algunas oportunidades para vuestra marca?
```

## Website

### Português (Portugal)

- **Nome:** `website_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos empresas a desenvolver a sua presença digital através de websites profissionais, modernos e orientados para resultados.

Hoje, ter um website não é apenas uma questão de presença online: é também uma oportunidade para transmitir credibilidade, apresentar serviços e transformar visitantes em potenciais clientes.

_Gostaríamos de apresentar algumas possibilidades para reforçar a presença digital da vossa empresa._

*Faria sentido marcarmos uma reunião de 15 minutos para vos mostrar como um website estratégico poderia gerar novas oportunidades de negócio?*
```

### Português (Brasil)

- **Nome:** `website_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos empresas a desenvolver sua presença digital por meio de sites profissionais, modernos e orientados a resultados.

Hoje, ter um site não é apenas uma questão de presença online: é também uma oportunidade de transmitir credibilidade, apresentar serviços e transformar visitantes em potenciais clientes.

_Gostaríamos de apresentar algumas possibilidades para fortalecer a presença digital da sua empresa._

*Faria sentido marcarmos uma reunião de 15 minutos para mostrar como um site estratégico poderia gerar novas oportunidades de negócio?*
```

### Inglês

- **Nome:** `website_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are *Alpha Tech Solutions*, and we help businesses build their digital presence through professional, modern, results-driven websites.

Today, having a website is not just about being online: it is also an opportunity to build credibility, showcase your services and turn visitors into potential customers.

_We would love to share a few possibilities to strengthen your company’s digital presence._

*Would it make sense to schedule a 15-minute meeting to show you how a strategic website could create new business opportunities?*
```

### Espanhol

- **Nome:** `website_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
¡Hola!

Somos *Alpha Tech Solutions* y ayudamos a empresas a desarrollar su presencia digital mediante sitios web profesionales, modernos y orientados a resultados.

Hoy, tener un sitio web no es solo una cuestión de presencia en línea: es también una oportunidad para transmitir credibilidad, presentar servicios y convertir visitantes en potenciales clientes.

_Nos gustaría presentaros algunas posibilidades para reforzar la presencia digital de vuestra empresa._

*¿Tendría sentido concertar una reunión de 15 minutos para mostraros cómo un sitio web estratégico podría generar nuevas oportunidades de negocio?*
```

## Marketing digital

### Português (Portugal)

- **Nome:** `marketing_digital_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos empresas a aumentar a sua visibilidade e a captar novos clientes através de estratégias de marketing digital.

Acreditamos que existem oportunidades para melhorar o alcance da vossa marca, chegar ao público certo e transformar a presença digital em resultados comerciais.

_Gostaríamos de apresentar algumas estratégias que poderão contribuir para o crescimento do vosso negócio._

*Se vos conseguíssemos apresentar formas de atrair mais clientes através do digital, estariam disponíveis para uma breve reunião?*
```

### Português (Brasil)

- **Nome:** `marketing_digital_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos empresas a aumentar sua visibilidade e a conquistar novos clientes por meio de estratégias de marketing digital.

Acreditamos que existem oportunidades para ampliar o alcance da sua marca, chegar ao público certo e transformar a presença digital em resultados comerciais.

_Gostaríamos de apresentar algumas estratégias que podem contribuir para o crescimento do seu negócio._

*Se conseguíssemos mostrar formas de atrair mais clientes pelo digital, você teria disponibilidade para uma breve reunião?*
```

### Inglês

- **Nome:** `marketing_digital_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are *Alpha Tech Solutions*, and we help businesses increase their visibility and win new customers through digital marketing strategies.

We believe there are opportunities to extend your brand’s reach, connect with the right audience and turn your digital presence into business results.

_We would like to share a few strategies that could help your business grow._

*If we could show you ways to attract more customers through digital channels, would you be available for a short meeting?*
```

### Espanhol

- **Nome:** `marketing_digital_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
¡Hola!

Somos *Alpha Tech Solutions* y ayudamos a empresas a aumentar su visibilidad y a captar nuevos clientes mediante estrategias de marketing digital.

Creemos que existen oportunidades para ampliar el alcance de vuestra marca, llegar al público adecuado y convertir la presencia digital en resultados comerciales.

_Nos gustaría presentaros algunas estrategias que pueden contribuir al crecimiento de vuestro negocio._

*Si pudiéramos mostraros formas de atraer más clientes a través del entorno digital, ¿estaríais disponibles para una breve reunión?*
```

## Redes sociais

### Português (Portugal)

- **Nome:** `redes_sociais_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e trabalhamos na gestão e estratégia de redes sociais para empresas que pretendem reforçar a sua presença digital e aproximar-se dos seus potenciais clientes.

Uma presença consistente nas redes sociais pode representar uma excelente oportunidade para aumentar a notoriedade da marca, gerar confiança e atrair novos negócios.

_Gostaríamos de partilhar algumas ideias para tornar a comunicação digital da vossa empresa mais estratégica e eficaz._

*Podemos agendar uma breve reunião para vos apresentar algumas oportunidades de melhoria e crescimento nas vossas redes sociais?*
```

### Português (Brasil)

- **Nome:** `redes_sociais_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e trabalhamos com a gestão e a estratégia de redes sociais para empresas que querem fortalecer sua presença digital e se aproximar dos potenciais clientes.

Uma presença consistente nas redes sociais pode ser uma excelente oportunidade para aumentar o reconhecimento da marca, gerar confiança e atrair novos negócios.

_Gostaríamos de compartilhar algumas ideias para tornar a comunicação digital da sua empresa mais estratégica e eficaz._

*Podemos agendar uma breve reunião para apresentar algumas oportunidades de melhoria e crescimento nas suas redes sociais?*
```

### Inglês

- **Nome:** `redes_sociais_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are *Alpha Tech Solutions*, and we work on social media management and strategy for businesses that want to strengthen their digital presence and get closer to potential customers.

A consistent social media presence can be an excellent opportunity to increase brand awareness, build trust and attract new business.

_We would like to share a few ideas to make your company’s digital communication more strategic and effective._

*Can we schedule a short meeting to present some opportunities to improve and grow your social media channels?*
```

### Espanhol

- **Nome:** `redes_sociais_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
¡Hola!

Somos *Alpha Tech Solutions* y trabajamos en la gestión y la estrategia de redes sociales para empresas que quieren reforzar su presencia digital y acercarse a sus potenciales clientes.

Una presencia constante en redes sociales puede ser una excelente oportunidad para aumentar la notoriedad de la marca, generar confianza y atraer nuevos negocios.

_Nos gustaría compartir algunas ideas para que la comunicación digital de vuestra empresa sea más estratégica y eficaz._

*¿Podemos agendar una breve reunión para presentaros algunas oportunidades de mejora y crecimiento en vuestras redes sociales?*
```

## Marketing de influência

### Português (Portugal)

- **Nome:** `automacao_ia_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos marcas a desenvolver estratégias de automação e IA, aproximando empresas de criadores de conteúdo relevantes para o seu público.

Acreditamos que existem oportunidades interessantes para aumentar a visibilidade da vossa marca, alcançar novas audiências e fortalecer a confiança dos consumidores através de parcerias estratégicas.

_Gostaríamos de apresentar algumas possibilidades de colaboração pensadas para o vosso negócio._

*Estariam disponíveis para uma reunião rápida para descobrir como o automação e IA poderia trazer novas oportunidades à vossa marca?*
```

### Português (Brasil)

- **Nome:** `automacao_ia_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos marcas a desenvolver estratégias de automação e IA, aproximando empresas de criadores de conteúdo relevantes para o seu público.

Acreditamos que existem oportunidades interessantes para aumentar a visibilidade da sua marca, alcançar novas audiências e fortalecer a confiança dos consumidores por meio de parcerias estratégicas.

_Gostaríamos de apresentar algumas possibilidades de colaboração pensadas para o seu negócio._

*Você teria disponibilidade para uma reunião rápida para descobrir como o automação e IA poderia trazer novas oportunidades para a sua marca?*
```

### Inglês

- **Nome:** `automacao_ia_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are *Alpha Tech Solutions*, and we help brands develop influencer marketing strategies, connecting businesses with content creators who are relevant to their audience.

We believe there are interesting opportunities to increase your brand’s visibility, reach new audiences and strengthen consumer trust through strategic partnerships.

_We would like to present a few collaboration possibilities designed for your business._

*Would you be available for a quick meeting to find out how influencer marketing could bring new opportunities to your brand?*
```

### Espanhol

- **Nome:** `automacao_ia_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
¡Hola!

Somos *Alpha Tech Solutions* y ayudamos a marcas a desarrollar estrategias de marketing de influencia, acercando a las empresas a creadores de contenido relevantes para su público.

Creemos que existen oportunidades interesantes para aumentar la visibilidad de vuestra marca, llegar a nuevas audiencias y fortalecer la confianza de los consumidores mediante alianzas estratégicas.

_Nos gustaría presentaros algunas posibilidades de colaboración pensadas para vuestro negocio._

*¿Estaríais disponibles para una reunión rápida para descubrir cómo el marketing de influencia podría traer nuevas oportunidades a vuestra marca?*
```

## Design gráfico

### Português (Portugal)

- **Nome:** `design_grafico_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos empresas a comunicar melhor através de soluções de design gráfico e comunicação visual.

Acreditamos que uma comunicação visual profissional e consistente é fundamental para destacar uma marca, transmitir confiança e criar uma imagem diferenciadora junto dos clientes.

_Gostaríamos de apresentar algumas ideias para valorizar a comunicação visual da vossa empresa._

*Fariam sentido 15 minutos de conversa para vos mostrarmos como poderíamos elevar a imagem e a comunicação da vossa marca?*
```

### Português (Brasil)

- **Nome:** `design_grafico_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Somos a *Alpha Tech Solutions* e ajudamos empresas a se comunicar melhor por meio de soluções de design gráfico e comunicação visual.

Acreditamos que uma comunicação visual profissional e consistente é fundamental para destacar uma marca, transmitir confiança e criar uma imagem diferenciada junto aos clientes.

_Gostaríamos de apresentar algumas ideias para valorizar a comunicação visual da sua empresa._

*Faria sentido uma conversa de 15 minutos para mostrarmos como poderíamos elevar a imagem e a comunicação da sua marca?*
```

### Inglês

- **Nome:** `design_grafico_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are *Alpha Tech Solutions*, and we help businesses communicate better through graphic design and visual communication solutions.

We believe professional, consistent visual communication is essential to make a brand stand out, build trust and create a distinctive image with customers.

_We would like to share a few ideas to enhance your company’s visual communication._

*Would 15 minutes of conversation make sense, so we can show you how we could elevate your brand’s image and communication?*
```

### Espanhol

- **Nome:** `design_grafico_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
¡Hola!

Somos *Alpha Tech Solutions* y ayudamos a empresas a comunicar mejor mediante soluciones de diseño gráfico y comunicación visual.

Creemos que una comunicación visual profesional y coherente es fundamental para destacar una marca, transmitir confianza y crear una imagen diferenciadora ante los clientes.

_Nos gustaría presentaros algunas ideas para valorizar la comunicación visual de vuestra empresa._

*¿Tendrían sentido 15 minutos de conversación para mostraros cómo podríamos elevar la imagen y la comunicación de vuestra marca?*
```

## Follow-up (quem não respondeu, 3 dias úteis depois)

### Português (Portugal)

- **Nome:** `followup_pt_eu`
- **Idioma na Meta:** pt_PT
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Voltamos ao contacto porque acreditamos que poderá existir uma oportunidade interessante de colaboração entre a vossa empresa e a *Alpha Tech Solutions.*

Gostaríamos de partilhar algumas ideias e perceber se existe interesse em explorar novas possibilidades para o vosso negócio.

*Faz sentido reservarmos 15 minutos esta semana para percebermos se podemos acrescentar valor à vossa empresa?*
```

### Português (Brasil)

- **Nome:** `followup_pt_br`
- **Idioma na Meta:** pt_BR
- **Categoria:** Marketing
- **Botões:** «Sim, mais informações por favor!» · «Não, obrigado!»

```text
Olá!

Voltamos a entrar em contato porque acreditamos que pode existir uma oportunidade interessante de colaboração entre a sua empresa e a *Alpha Tech Solutions.*

Gostaríamos de compartilhar algumas ideias e entender se existe interesse em explorar novas possibilidades para o seu negócio.

*Faz sentido reservarmos 15 minutos esta semana para entendermos se podemos agregar valor à sua empresa?*
```

### Inglês

- **Nome:** `followup_en`
- **Idioma na Meta:** en
- **Categoria:** Marketing
- **Botões:** «Yes, more information please!» · «No, Thanks!»

```text
Hello!

We are getting back in touch because we believe there may be an interesting opportunity for collaboration between your company and *Alpha Tech Solutions.*

We would like to share a few ideas and understand whether there is interest in exploring new possibilities for your business.

*Does it make sense to set aside 15 minutes this week to see whether we can add value to your company?*
```

### Espanhol

- **Nome:** `followup_es`
- **Idioma na Meta:** es
- **Categoria:** Marketing
- **Botões:** «Sí, más información, por favor!» · «No, gracias!»

```text
¡Hola!

Volvemos a ponernos en contacto porque creemos que puede existir una oportunidad interesante de colaboración entre vuestra empresa y *Alpha Tech Solutions.*

Nos gustaría compartir algunas ideas y saber si existe interés en explorar nuevas posibilidades para vuestro negocio.

*¿Tiene sentido reservar 15 minutos esta semana para ver si podemos aportar valor a vuestra empresa?*
```

## Genérico (reserva, com variáveis)

O modelo genérico `alpha_intro_*` mantém-se (tem as variáveis {{1}}, {{2}} e {{3}}, que a IA propõe). É usado quando o serviço recomendado ainda não tem modelo aprovado.
