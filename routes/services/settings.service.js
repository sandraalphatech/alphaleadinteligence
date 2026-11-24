// Definições da plataforma (Etapa 9): perfil de cada utilizador, equipa e papéis (só o admin), estado das integrações e limites em vigor.
//  - O perfil guarda o idioma preferido NA CONTA (coluna utilizadores.idioma), para ser o mesmo em qualquer computador.
//  - Mudar o papel de alguém é coisa de admin, e há duas travas: ninguém muda o próprio papel e tem de ficar sempre pelo menos um admin.
//  - As integrações mostram só SE estão configuradas (sim/não) e dados que não são segredos. Nunca devolvem chaves, tokens nem palavras-passe.
//  - Os limites são os que estão em vigor (vêm do código e do .env): aqui só se vêem; mudam-se no .env.
const { supabaseAdmin } = require('./supabase.service');

const IDIOMAS = ['pt', 'en', 'es'];
const PAPEIS = ['admin', 'comercial', 'leitura'];
const UUID = /^[0-9a-f-]{36}$/i;
const erro = (codigo, mensagem, extra = {}) => Object.assign(new Error(mensagem), { codigo }, extra);
const BD_NAO_PRONTA = 'A base de dados ainda não está pronta para as definições (corra database/settings.sql).';
const nome = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- perfil ----------
// A coluna «idioma» pode ainda não existir (se o SQL não foi corrido): nesse caso o perfil funciona sem ela.
async function idiomaGuardado(id) {
    const { data, error } = await supabaseAdmin.from('utilizadores').select('id, idioma').eq('id', id).maybeSingle();
    return { existe: !error, idioma: !error && IDIOMAS.includes(data?.idioma) ? data.idioma : null };
}
async function obterPerfil(utilizador) {
    const g = await idiomaGuardado(utilizador.id);
    return { id: utilizador.id, nome: utilizador.nome, email: utilizador.email, papel: utilizador.papel, idioma: g.idioma, idioma_disponivel: g.existe };
}
async function atualizarPerfil(utilizador, corpo = {}) {
    const mudanca = {};
    if ('nome' in corpo) {
        const n = nome(corpo.nome);
        if (n.length < 2 || n.length > 80) throw erro('INVALIDO', 'O nome tem de ter entre 2 e 80 caracteres.');
        mudanca.nome = n;
    }
    if ('idioma' in corpo) {
        if (!IDIOMAS.includes(corpo.idioma)) throw erro('INVALIDO', 'Idioma inválido.');
        mudanca.idioma = corpo.idioma;
    }
    if (!Object.keys(mudanca).length) throw erro('VAZIO', 'Nada para alterar.');
    const { error } = await supabaseAdmin.from('utilizadores').update(mudanca).eq('id', utilizador.id);
    if (error) {
        console.error('Perfil:', error.message);
        throw 'idioma' in mudanca ? erro('CONFIG', BD_NAO_PRONTA) : new Error(error.message);
    }
    return obterPerfil({ ...utilizador, ...(mudanca.nome ? { nome: mudanca.nome } : {}) });
}

// ---------- equipa ----------
async function listarEquipa() {
    const { data, error } = await supabaseAdmin.from('utilizadores').select('id, nome, email, papel, criado_em').order('nome');
    if (error) throw new Error(error.message);
    return (data || []).map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, criado_em: u.criado_em }));
}
async function mudarPapel(quem, id, papel) {
    if (!PAPEIS.includes(papel)) throw erro('INVALIDO', 'Papel inválido.');
    if (!UUID.test(String(id || ''))) throw erro('NAO_ENCONTRADA', 'Utilizador não encontrado.');
    if (id === quem.id) throw erro('INVALIDO', 'Não pode alterar o seu próprio papel.');
    const { data: alvo } = await supabaseAdmin.from('utilizadores').select('id, nome, papel').eq('id', id).maybeSingle();
    if (!alvo) throw erro('NAO_ENCONTRADA', 'Utilizador não encontrado.');
    if (alvo.papel === 'admin' && papel !== 'admin') {
        const { data: admins } = await supabaseAdmin.from('utilizadores').select('id').eq('papel', 'admin');
        if ((admins || []).filter((a) => a.id !== id).length < 1) throw erro('INVALIDO', 'Tem de haver pelo menos um administrador.');
    }
    const { error } = await supabaseAdmin.from('utilizadores').update({ papel }).eq('id', id);
    if (error) throw new Error(error.message);
    return { id: alvo.id, nome: alvo.nome, papel };
}

// ---------- integrações (só sim/não e dados públicos: nunca segredos) ----------
function estadoIntegracoes() {
    const e = process.env;
    const email = require('./email.service');
    const wa = require('./whatsapp.service');
    const o = require('./outreach.service');
    const la = require('./lead-analysis.service');
    const modelos = [
        ['rascunhos', o.MODELO], ['analise_lead_forte', la.MODELO_FORTE], ['analise_lead_rapida', la.MODELO_RAPIDO],
        ['propostas', require('./proposal.service').MODELO_IA], ['analise_mensal', require('./monthly-analysis.service').MODELO],
        ['radar_analise', require('./analysis.service').MODELO], ['identificacao', require('./identification.service').MODELO], ['enriquecimento', require('./enrichment.service').MODELO],
        ['qualidade', require('./quality.service').MODELO], ['traducao', require('./translation.service').MODELO]
    ].map(([uso, modelo]) => ({ uso, modelo }));
    return {
        ia: { configurada: !!e.ANTHROPIC_API_KEY, modelos },
        email: { configurado: email.configurado(), servidor: e.SMTP_TESTE === 'json' ? 'teste' : (e.SMTP_HOST || 'smtp.gmail.com'), porta: parseInt(e.SMTP_PORT, 10) || 465 },
        whatsapp: { configurado: wa.configurado(), webhook: !!(wa.ambiente.segredo() && wa.ambiente.verificacao()), waba: !!e.WHATSAPP_WABA_ID, versao_api: wa.versao() },
        endereco: { url: e.APP_URL || null, local: !e.APP_URL || /localhost|127\.0\.0\.1/.test(e.APP_URL) }
    };
}

// ---------- limites em vigor ----------
function limites() {
    const o = require('./outreach.service');
    const li = require('./linkedin.service');
    const ig = require('./instagram.service');
    const wa = require('./whatsapp.service');
    const wr = require('./whatsapp-reply.service');
    const imp = require('./csv.service');
    const exp = require('./export.service');
    return {
        diarios: [['email', o.LIMITE_DIARIO, 'EMAIL_LIMITE_DIARIO'], ['linkedin', li.LIMITE_DIARIO, 'LINKEDIN_LIMITE_DIARIO'], ['instagram', ig.LIMITE_DIARIO, 'INSTAGRAM_LIMITE_DIARIO'],
            ['whatsapp', wa.LIMITE_DIARIO, 'WHATSAPP_LIMITE_DIARIO'], ['whatsapp_respostas', wr.LIMITE_RESPOSTAS, 'WHATSAPP_LIMITE_RESPOSTAS']].map(([canal, valor, variavel]) => ({ canal, valor, variavel })),
        regras: { dias_entre_mensagens: o.DIAS_ENTRE_MENSAGENS, followups: o.MAX_FOLLOWUPS, dias_descanso: o.DIAS_DESCANSO, rascunhos_por_hora: o.RASCUNHOS_POR_HORA },
        ficheiros: { importacao_linhas: imp.MAX_LINHAS, exportacao_linhas: exp.MAX_LINHAS, leads_quadro: 600 }
    };
}

module.exports = { obterPerfil, atualizarPerfil, listarEquipa, mudarPapel, estadoIntegracoes, limites, IDIOMAS, PAPEIS };
