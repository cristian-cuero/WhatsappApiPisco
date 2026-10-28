const Fastify = require('fastify');

const registerJwt = require('../config/jwt');
const authRoutes = require('../routes/auth.routes');
const whatsappRoutes = require('../routes/whatsapp.routes');

async function buildApp() {

    const app = Fastify({
        logger: true
    });

    // Rutas
    app.register(authRoutes);
    app.register(whatsappRoutes)
    // JWT
    await registerJwt(app);
    return app;
}

module.exports = buildApp;