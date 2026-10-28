const {
    obtenerUsuarioPorUsuario,
    validarPassword
} = require('../services/user.service');

async function authRoutes(app) {

    app.post('/api/auth/login', async (request, reply) => {
        const { usuario, password } = request.body || {};

        if (!usuario || !password) {
            return reply.code(400).send({
                ok: false,
                mensaje: 'Usuario y contraseña son obligatorios'
            });
        }

        const user = await obtenerUsuarioPorUsuario(usuario);

        if (!user || user.estado !== 'ACTIVO') {
            return reply.code(401).send({
                ok: false,
                mensaje: 'Usuario o contraseña incorrectos'
            });
        }

        const passwordValida = await validarPassword(
            password,
            user.password
        );

        if (!passwordValida) {
            return reply.code(401).send({
                ok: false,
                mensaje: 'Usuario o contraseña incorrectos'
            });
        }

        const token = app.jwt.sign({
            userId: user.id,
            tenantId: user.tenantId,
            usuario: user.usuario
        });

        return {
            ok: true,
            mensaje: 'Login correcto',
            token,
            usuario: {
                id: user.id,
                usuario: user.usuario,
                nombre: user.nombre,
                tenantId: user.tenantId
            }
        };
    });

}

module.exports = authRoutes;