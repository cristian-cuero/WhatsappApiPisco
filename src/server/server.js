
const buildApp = require("./app");
const config = require("../config/env");

const {
    recuperarSesionesWhatsApp,
} = require("../services/whatsapp-startup.service");

const {
    cerrarConversacionesVencidas,
} = require("../services/consercacion.service");

async function start() {
    const app = await buildApp();

    let temporizadorConversaciones;
    let revisandoConversaciones = false;

    // Registrar el hook antes de iniciar Fastify.
    app.addHook("onClose", async () => {
        if (temporizadorConversaciones) {
            clearInterval(temporizadorConversaciones);
        }
    });

    try {
        await app.listen({
            port: config.port,
            host: config.host,
        });

        console.log(`${config.appName} iniciado en puerto ${config.port}`);

        // Recuperar las sesiones de WhatsApp guardadas.
        try {
            await recuperarSesionesWhatsApp();
        } catch (error) {
            app.log.error(
                { err: error },
                "Error al recuperar sesiones de WhatsApp"
            );
        }

        // Revisar las conversaciones vencidas.
        const revisarConversaciones = async () => {
            if (revisandoConversaciones) return;

            revisandoConversaciones = true;

            try {
                console.log("Revisando conversaciones vencidas...");

                await cerrarConversacionesVencidas();
            } catch (error) {
                app.log.error(
                    { err: error },
                    "Error cerrando conversaciones por inactividad"
                );
            } finally {
                revisandoConversaciones = false;
            }
        };

        // Primera revisión al iniciar.
        await revisarConversaciones();

        // Revisiones posteriores cada 15 segundos.
        temporizadorConversaciones = setInterval(
            revisarConversaciones,
            15_000
        );

        temporizadorConversaciones.unref();

    } catch (error) {
        app.log.error({ err: error }, "Error iniciando el servidor");

        if (temporizadorConversaciones) {
            clearInterval(temporizadorConversaciones);
        }

        await app.close();
        process.exitCode = 1;
    }
}

start();
