require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.disable('x-powered-by');
// No Render (que define a variável RENDER) há sempre um proxy à frente: liga-se sozinho.
const PROXY = process.env.TRUST_PROXY || (process.env.RENDER ? 'true' : '');
if (PROXY) app.set('trust proxy', PROXY === 'true' ? 1 : PROXY);   // atrás de um proxy, para o limite por IP ver o IP real

// Cabeçalhos de segurança. A CSP só deixa correr scripts do próprio servidor (limita o estrago de um XSS).
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: null      // a aplicação corre em http no PC local; o HTTPS é tratado pelo proxy em produção
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS: a aplicação é servida pelo próprio servidor (mesma origem). Só aceitamos outra origem se for a do APP_URL.
const origemPermitida = (() => { try { return new URL(process.env.APP_URL || '').origin; } catch { return null; } })();
app.use(cors({ origin: (origem, cb) => cb(null, !origem || origem === origemPermitida) }));

// Limites de tentativas (por IP) nas rotas de autenticação: travam adivinhação de palavras-passe e abuso do envio de emails
const limite = (max, minutos) => rateLimit({
    windowMs: minutos * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { erro: 'Demasiadas tentativas. Aguarde alguns minutos e tente de novo.', codigo: 'LIMITE' }
});
app.use('/api/auth/login', limite(10, 15));
app.use('/api/auth/recover', limite(5, 60));
app.use('/api/auth/redefine', limite(10, 15));
app.use('/api/auth/refresh', limite(60, 15));
app.use('/api/outreach', express.json({ limit: '1mb' }));      // só aqui: a assinatura pode levar uma imagem pequena (o resto da API mantém o limite normal)
app.use('/api/whatsapp', express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));     // o webhook precisa do corpo em bruto para validar a assinatura da Meta
app.use('/api/clientes', express.json({ limit: '15mb' }));      // só aqui: o contrato assinado (PDF ou imagem, até 10 MB) segue em base64
app.use('/api/dados', express.json({ limit: '2mb' }));          // só aqui: os ficheiros CSV da importação podem ter até 2 MB
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        application: 'Alpha Leads Intelligence'
    });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/leads', require('./routes/leads.routes'));
app.use('/api/radar', require('./routes/radar.routes'));
app.use('/api/outreach', require('./routes/outreach.routes'));
app.use('/api/pipeline', require('./routes/pipeline.routes'));
app.use('/api/whatsapp', require('./routes/whatsapp.routes'));
app.use('/api/documentos', require('./routes/documents.routes'));
app.use('/api/dados', require('./routes/data.routes'));
app.use('/api/relatorios', require('./routes/reports.routes'));
app.use('/api/definicoes', require('./routes/settings.routes'));
app.use('/api/negocios', require('./routes/deals.routes'));
app.use('/api/tarefas', require('./routes/tasks.routes'));
app.use('/api/clientes', require('./routes/clients.routes'));
app.use('/api/google', require('./routes/google.routes'));

// Frontend: só servimos a pasta "assets" e o index.html.
// NUNCA servir a raiz do projecto, senão o ficheiro .env ficaria público.
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Rotas /api inexistentes devolvem JSON (não HTML)
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.', codigo: 'NAO_ENCONTRADA' }));

// Último recurso: nunca mostrar stack traces nem caminhos do disco ao browser
app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    const estado = erro.status || erro.statusCode || 500;
    if (estado >= 500) console.error('Erro não tratado:', erro);
    res.status(estado).json({
        erro: estado === 413 ? 'O pedido é demasiado grande.' : estado < 500 ? 'Pedido inválido.' : 'Ocorreu um erro no servidor.',
        codigo: estado === 413 ? 'GRANDE' : estado < 500 ? 'INVALIDO' : 'ERRO'
    });
});

const PORT = process.env.PORT || 3000;

// No Express 5, o 1.º argumento do callback é o erro (se existir)
app.listen(PORT, (erro) => {
    if (erro) {
        console.error(erro.code === 'EADDRINUSE'
            ? `A porta ${PORT} já está ocupada por outro processo. Feche-o ou mude PORT no .env.`
            : erro);
        process.exit(1);
    }
    console.log(`Servidor iniciado na porta ${PORT}`);
    try { if (require('./routes/services/email-replies.service').iniciar()) console.log('Leitura das respostas por email ligada.'); } catch (e) { console.error('Respostas por email:', String(e.message).slice(0, 120)); }
});