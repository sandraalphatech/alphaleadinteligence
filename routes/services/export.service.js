// Exportação de dados em CSV (Etapa 8): leads, empresas, pessoas de contacto, interações e a lista «Não contactar».
//  - Os leads exportam-se com os MESMOS filtros da página Leads (o que se vê é o que se exporta; no máximo os 600 que o quadro mostra).
//  - O ficheiro abre direto no Excel (UTF-8 com BOM e «;») e neutraliza fórmulas (ver csv.service.js).
//  - Os textos das mensagens só saem se se pedir (conteudo=1): são dados pessoais e pesam muito.
const { supabaseAdmin } = require('./supabase.service');
const { construirCsv } = require('./csv.service');
const pipeline = require('./pipeline.service');

const TIPOS = ['leads', 'empresas', 'decisores', 'interaccoes', 'nao_contactar'];
const MAX_LINHAS = 20000;
const PAGINA = 1000;
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });

// Lê tudo, página a página (a base de dados devolve no máximo 1000 de cada vez).
async function lerTudo(consulta) {
    const todas = [];
    for (let de = 0; de < MAX_LINHAS; de += PAGINA) {
        const { data, error } = await consulta().range(de, de + PAGINA - 1);
        if (error) throw new Error(error.message);
        todas.push(...(data || []));
        if ((data || []).length < PAGINA) break;
    }
    return todas;
}
const dia = (iso) => (iso ? String(iso).slice(0, 10) : '');
const dataHora = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : '');
const redes = (e, k) => (e.redes && e.redes[k]) || '';

const COLUNAS = {
    leads: [
        { titulo: 'Empresa', valor: (l) => l.empresa?.nome }, { titulo: 'País', valor: (l) => l.empresa?.pais }, { titulo: 'Setor', valor: (l) => l.empresa?.sector },
        { titulo: 'Estado', valor: (l) => l.estado }, { titulo: 'Serviço de interesse', valor: (l) => l.servico_interesse }, { titulo: 'Pontuação', valor: (l) => l.pontuacao },
        { titulo: 'Classificação', valor: (l) => l.classificacao }, { titulo: 'Responsável', valor: (l) => l.responsavel?.nome },
        { titulo: 'Tarefas abertas', valor: (l) => l.tarefas_abertas }, { titulo: 'Próxima tarefa', valor: (l) => l.proxima_tarefa?.titulo }, { titulo: 'Prazo da próxima tarefa', valor: (l) => l.proxima_tarefa?.prazo },
        { titulo: 'Último contacto', valor: (l) => dia(l.ultima_interaccao?.ocorrida_em) }, { titulo: 'Canal do último contacto', valor: (l) => l.ultima_interaccao?.canal },
        { titulo: 'Interações', valor: (l) => l.interaccoes }, { titulo: 'Não contactar', valor: (l) => !!l.empresa?.nao_contactar }
    ],
    empresas: [
        { titulo: 'Empresa', chave: 'nome' }, { titulo: 'Site', chave: 'website' }, { titulo: 'País', chave: 'pais' }, { titulo: 'Cidade', chave: 'cidade' }, { titulo: 'Setor', chave: 'sector' },
        { titulo: 'Idioma', chave: 'idioma' }, { titulo: 'Tipo', chave: 'tipo_empresa' }, { titulo: 'Email geral', chave: 'email_geral' }, { titulo: 'Estado do email', chave: 'email_geral_estado' },
        { titulo: 'Telefone', chave: 'telefone' }, { titulo: 'LinkedIn', valor: (e) => redes(e, 'linkedin') }, { titulo: 'Instagram', valor: (e) => redes(e, 'instagram') },
        { titulo: 'WhatsApp', valor: (e) => redes(e, 'whatsapp') }, { titulo: 'Descrição', valor: (e) => e.sobre || e.descricao }, { titulo: 'Notícia de origem', chave: 'origem_titulo' },
        { titulo: 'Ligação de origem', chave: 'origem_url' }, { titulo: 'Fonte', valor: (e) => e.fonte_nome }, { titulo: 'Não contactar', valor: (e) => !!e.nao_contactar }, { titulo: 'Criada em', valor: (e) => dia(e.criado_em) }
    ],
    decisores: [
        { titulo: 'Nome', chave: 'nome' }, { titulo: 'Cargo', chave: 'cargo' }, { titulo: 'Categoria', chave: 'categoria' }, { titulo: 'Empresa', valor: (d) => d.empresa_nome },
        { titulo: 'Email', chave: 'email' }, { titulo: 'Estado do email', chave: 'email_estado' }, { titulo: 'LinkedIn', chave: 'linkedin_url' }, { titulo: 'Onde aparece', chave: 'fonte_url' },
        { titulo: 'Recolhido em', valor: (d) => dia(d.recolhido_em) }, { titulo: 'Não contactar', valor: (d) => !!d.nao_contactar }
    ],
    interaccoes: [
        { titulo: 'Data', valor: (i) => dataHora(i.ocorrida_em) }, { titulo: 'Empresa', valor: (i) => i.empresa_nome }, { titulo: 'Canal', chave: 'canal' }, { titulo: 'Direção', chave: 'direcao' },
        { titulo: 'Tipo', chave: 'tipo' }, { titulo: 'Assunto', chave: 'assunto' }, { titulo: 'Resultado', chave: 'resultado' }, { titulo: 'Destinatário', chave: 'destinatario' },
        { titulo: 'Método', chave: 'metodo' }, { titulo: 'Idioma', chave: 'idioma' }, { titulo: 'Gerada por IA', valor: (i) => !!i.gerado_por_ia }
    ],
    nao_contactar: [
        { titulo: 'Tipo', chave: 'tipo' }, { titulo: 'Nome', chave: 'nome' }, { titulo: 'Empresa', chave: 'empresa' }, { titulo: 'País', chave: 'pais' }, { titulo: 'Desde', chave: 'desde' }, { titulo: 'Origem', chave: 'origem' }
    ]
};
const NOMES = { leads: 'leads', empresas: 'empresas', decisores: 'pessoas-de-contacto', interaccoes: 'interacoes', nao_contactar: 'nao-contactar' };

async function nomesDeEmpresas(ids) {
    const mapa = new Map();
    const unicos = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unicos.length; i += 100) {
        const { data, error } = await supabaseAdmin.from('empresas').select('id, nome, pais').in('id', unicos.slice(i, i + 100));
        if (error) throw new Error(error.message);
        (data || []).forEach((e) => mapa.set(e.id, e));
    }
    return mapa;
}

// Devolve { nome (sugestão de nome do ficheiro), csv, linhas }
async function exportar(tipo, { filtros = {}, separador = ';', conteudo = false, naoContactar } = {}) {
    if (!TIPOS.includes(tipo)) throw erro('INVALIDO', 'Tipo de exportação desconhecido.');
    let colunas = COLUNAS[tipo], linhas;
    if (tipo === 'leads') {
        linhas = (await pipeline.listarLeads(filtros)).leads;
    } else if (tipo === 'empresas') {
        linhas = await lerTudo(() => supabaseAdmin.from('empresas').select('*').order('nome'));
        const { data: fontes } = await supabaseAdmin.from('fontes').select('id, nome');
        const nomes = new Map((fontes || []).map((f) => [f.id, f.nome]));
        linhas = linhas.map((e) => ({ ...e, fonte_nome: nomes.get(e.fonte_id) || '' }));
    } else if (tipo === 'decisores') {
        linhas = await lerTudo(() => supabaseAdmin.from('decisores').select('*').order('nome'));
        const empresas = await nomesDeEmpresas(linhas.map((d) => d.empresa_id));
        linhas = linhas.map((d) => ({ ...d, empresa_nome: empresas.get(d.empresa_id)?.nome || '' }));
    } else if (tipo === 'interaccoes') {
        linhas = await lerTudo(() => supabaseAdmin.from('interaccoes').select('*').order('ocorrida_em', { ascending: false }));
        const empresas = await nomesDeEmpresas(linhas.map((i) => i.empresa_id));
        linhas = linhas.map((i) => ({ ...i, empresa_nome: empresas.get(i.empresa_id)?.nome || '' }));
        if (conteudo) colunas = [...colunas, { titulo: 'Mensagem', chave: 'conteudo' }];
    } else {
        linhas = (await naoContactar()).itens;
    }
    return { nome: NOMES[tipo], csv: construirCsv(colunas, linhas, separador), linhas: linhas.length, limite: linhas.length >= MAX_LINHAS };
}

module.exports = { exportar, TIPOS, COLUNAS, MAX_LINHAS };
