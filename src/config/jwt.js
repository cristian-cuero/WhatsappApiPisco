const fastifyJwt = require('@fastify/jwt');

async function registerJwt(app) {
    await app.register(fastifyJwt, {
        secret: process.env.JWT_SECRET
    });
}

module.exports = registerJwt;