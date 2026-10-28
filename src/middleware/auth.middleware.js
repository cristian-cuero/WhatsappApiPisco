async function autenticar(request, reply) {
    try {
        await request.jwtVerify();
    } catch (error) {
        return reply.code(401).send({
            ok: false,
            mensaje: 'No autorizado'
        });
    }
}

module.exports = autenticar;