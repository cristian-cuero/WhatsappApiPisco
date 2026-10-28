const prisma = require("../config/prisma");
const { getWhatsAppProvider } = require("../providers/whatsapp.provider");
const { conectarSesion } = require("./whatsapp.service");

async function recuperarSesionesWhatsApp() {
  const sesiones = await prisma.whatsAppSession.findMany({
    where: {
      estado: {
        in: ["CONECTADO", "ESPERANDO_QR", "CONECTANDO", "CREANDO"],
      },
    },
    select: {
      id: true,
      tenantId: true,
      nombre: true,
      estado: true,
      provider: true,
    },
  });

  console.log(`Recuperando ${sesiones.length} sesiones de WhatsApp...`);

  for (const sesion of sesiones) {
    try {
      let provider = getWhatsAppProvider(sesion.provider);
      await conectarSesion(sesion, provider);

      console.log(`Sesión ${sesion.id} (${sesion.nombre}) inicializada`);
    } catch (error) {
      console.error(`Error recuperando sesión ${sesion.id}:`, error.message);
    }
  }
}





module.exports = {
  recuperarSesionesWhatsApp

};
