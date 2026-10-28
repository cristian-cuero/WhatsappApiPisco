const autenticar = require("../middleware/auth.middleware");

const QRCode = require("qrcode");

const {
    crearSesion,
    listarSesiones,
    desconectarSesion
} = require("../services/whatsapp.service");


async function whatsappRoutes(app) {

    /*
     * Crear una nueva sesión de WhatsApp
     */
    app.post(
        "/api/whatsapp/sessions",
        {
            preHandler: autenticar
        },
        async (request, reply) => {
            
            const { nombre } = request.body || {};

            if (!nombre) {
                return reply.code(400).send({
                    ok: false,
                    mensaje: "El nombre de la sesión es obligatorio"
                });
            }

            try {

                const sesion = await crearSesion({
                    tenantId: request.user.tenantId,
                    nombre
                });

                return {
                    ok: true,
                    sesion
                };

            } catch (error) {

                return reply.code(400).send({
                    ok: false,
                    mensaje: error.message
                });
            }
        }
    );


    /*
     * Listar las sesiones del tenant
     */
    app.get(
        "/api/whatsapp/sessions",
        {
            preHandler: autenticar
        },
        async (request) => {

            const sesiones = await listarSesiones(
                request.user.tenantId
            );

            return {
                ok: true,
                sesiones
            };
        }
    );


    /*
     * Obtener una sesión específica
     */
    app.get(
        "/api/whatsapp/sessions/:id",
        {
            preHandler: autenticar
        },
        async (request, reply) => {

            const sessionId =
                Number(request.params.id);

            const sesion = await obtenerSesion({
                tenantId: request.user.tenantId,
                sessionId
            });

            if (!sesion) {
                return reply.code(404).send({
                    ok: false,
                    mensaje: "Sesión no encontrada"
                });
            }

            return {
                ok: true,
                sesion
            };
        }
    );


    /*
     * Obtener QR de una sesión
     */
    app.get(
        "/api/whatsapp/sessions/:id/qr",
        {
            preHandler: autenticar
        },
        async (request, reply) => {

            const sessionId =
                Number(request.params.id);

            try {

                const resultado =
                    await obtenerQrSesion({
                        tenantId: request.user.tenantId,
                        sessionId
                    });

                /*
                 * No hay QR porque la sesión
                 * ya está conectada o todavía
                 * no está disponible.
                 */
                if (!resultado.qr) {

                    return {
                        ok: true,
                        disponible: false,
                        estado: resultado.estado,
                        telefono: resultado.sesion.telefono
                    };
                }

                /*
                 * Convertimos el QR de Baileys
                 * en una imagen PNG.
                 */
                const imagenQr =
                    await QRCode.toDataURL(
                        resultado.qr
                    );

                return {
                    ok: true,
                    disponible: true,
                    estado: resultado.estado,
                    telefono: resultado.sesion.telefono,
                    qr: imagenQr
                };

            } catch (error) {

                return reply.code(404).send({
                    ok: false,
                    mensaje: error.message
                });
            }
        }
    );


    /*
     * Desconectar una sesión
     */
    app.post(
        "/api/whatsapp/sessions/:id/disconnect",
        {
            preHandler: autenticar
        },
        async (request, reply) => {

            const sessionId =
                Number(request.params.id);

            try {

                const sesion =
                    await desconectarSesion({
                        tenantId: request.user.tenantId,
                        sessionId
                    });

                return {
                    ok: true,
                    sesion
                };

            } catch (error) {

                return reply.code(404).send({
                    ok: false,
                    mensaje: error.message
                });
            }
        }
    );

}


module.exports = whatsappRoutes;