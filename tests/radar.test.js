// O Radar só aceita empresas privadas com nome próprio. Correr com: npm test
const test = require('node:test');
const assert = require('node:assert');
const { validar } = require('../routes/services/analysis.service');

const aceita = (nome, tipo_entidade = 'empresa') => validar({ tem_empresa: true, tipo_entidade, nome }).tem_empresa;

test('recusa órgãos públicos, associações e nomes genéricos', () => {
    for (const nome of ['Prefeitura de Niterói', 'Câmara Municipal de Braga', 'Escola de samba de São Paulo',
                        'Escola Municipal Paulo Freire', 'Startup de picape e SUV de baixo preço']) {
        assert.strictEqual(aceita(nome), false, nome);
    }
    for (const tipo of ['orgao_publico', 'associacao', 'sem_nome']) assert.strictEqual(aceita('Acme', tipo), false, tipo);
});

test('aceita empresas privadas, mesmo com nomes parecidos', () => {
    for (const nome of ['Clínica do Joelho', 'Escola de Idiomas Atlas', 'Empresa de Cervejas da Madeira', 'Governa', 'Payhawk']) {
        assert.strictEqual(aceita(nome), true, nome);
    }
});
