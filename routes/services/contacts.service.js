// Contatos acrescentados à mão na ficha do Radar (um email que a equipe encontrou, um telefone, uma pessoa...).
// Os dados passam pela mesma validação da importação e ficam no histórico com a origem «manual».
const { supabaseAdmin } = require('./supabase.service');
const { actualizarEmpresa } = require('./dedup.service');
const { normalizarNomePessoa, normalizarEmail, validarEmail, normalizarTelefone } = require('./normalization.service');
const { categoriaDoCargo } = require('./import.service');
const linkedin = require('./linkedin.service');
const instagram = require('./instagram.service');

const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });
const limpar = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

async function lerEmail(valor) {
    const email = normalizarEmail(valor);
    if (!email) throw erro('INVALIDO', 'O email não é válido.');
    return { email, estado: await validarEmail(email) };
}

function lerTelefone(valor, pais, rotulo) {
    const numero = normalizarTelefone(valor, pais);
    if (!numero) throw erro('INVALIDO', `O ${rotulo} não é válido. Use o código do país, por exemplo +55 11 91234-5678 ou +351 912 345 678.`);
    return numero;
}

// Só mexe nos campos enviados: um texto vazio apaga o contato, um campo ausente fica como está.
async function guardarContactos(empresaId, corpo) {
    const { data: empresa, error } = await supabaseAdmin.from('empresas').select('id, pais, redes').eq('id', empresaId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa) throw erro('NAO_ENCONTRADA', 'Empresa não encontrada.');

    const veio = (campo) => typeof corpo[campo] === 'string';
    const valor = (campo) => limpar(corpo[campo], 300);
    const alterar = {};
    const redes = { ...(empresa.redes || {}) };

    if (veio('email')) {
        const e = valor('email') ? await lerEmail(valor('email')) : { email: null, estado: null };
        alterar.email_geral = e.email;
        alterar.email_geral_estado = e.estado;
    }
    if (veio('telefone')) alterar.telefone = valor('telefone') ? lerTelefone(valor('telefone'), empresa.pais, 'telefone') : null;
    if (veio('whatsapp')) {
        if (valor('whatsapp')) redes.whatsapp = lerTelefone(valor('whatsapp'), empresa.pais, 'WhatsApp'); else delete redes.whatsapp;
    }
    if (veio('instagram')) {
        const bruto = valor('instagram');
        if (bruto) {
            // aceita o link completo, «@conta» ou só o nome da conta
            const link = /instagram\.com/i.test(bruto) ? bruto : `https://www.instagram.com/${bruto.replace(/^@/, '')}`;
            const conta = instagram.contaInstagram(link);
            if (!conta) throw erro('INVALIDO', 'O Instagram não é válido. Use o link do perfil ou @conta.');
            redes.instagram = conta.url;
        } else delete redes.instagram;
    }
    if (veio('linkedin')) {
        if (valor('linkedin')) {
            const url = linkedin.urlPagina(valor('linkedin'));
            if (!url) throw erro('INVALIDO', 'O LinkedIn da empresa tem de ser um link linkedin.com/company/…');
            redes.linkedin = url;
        } else delete redes.linkedin;
    }
    if (veio('whatsapp') || veio('instagram') || veio('linkedin')) alterar.redes = redes;
    if (!Object.keys(alterar).length) throw erro('INVALIDO', 'Não há nada para salvar.');

    await actualizarEmpresa(empresaId, alterar, 'manual');
    return { ok: true };
}

async function adicionarPessoa(empresaId, corpo) {
    const nome = limpar(corpo.nome, 90);
    if (!nome) throw erro('INVALIDO', 'Escreva o nome da pessoa.');
    const cargo = limpar(corpo.cargo, 90) || null;
    const e = limpar(corpo.email, 200) ? await lerEmail(corpo.email) : { email: null, estado: null };
    let linkedinUrl = null;
    if (limpar(corpo.linkedin, 300)) {
        linkedinUrl = linkedin.urlPerfil(limpar(corpo.linkedin, 300));
        if (!linkedinUrl) throw erro('INVALIDO', 'O LinkedIn da pessoa tem de ser um link linkedin.com/in/…');
    }

    const { data: empresa } = await supabaseAdmin.from('empresas').select('id').eq('id', empresaId).maybeSingle();
    if (!empresa) throw erro('NAO_ENCONTRADA', 'Empresa não encontrada.');

    const { error } = await supabaseAdmin.from('decisores').insert({
        empresa_id: empresaId, nome, nome_normalizado: normalizarNomePessoa(nome), cargo, categoria: categoriaDoCargo(cargo),
        email: e.email, email_estado: e.estado, linkedin_url: linkedinUrl,
        fonte_url: 'manual', recolhido_em: new Date().toISOString(), ultima_origem: 'manual'
    });
    if (error?.code === '23505') throw erro('DUPLICADO', 'Já existe uma pessoa com este nome, email ou LinkedIn.');
    if (error) throw new Error(error.message);
    return { ok: true };
}

module.exports = { guardarContactos, adicionarPessoa };
