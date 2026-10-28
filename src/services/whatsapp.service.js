const prisma = require("../config/prisma");
const { obtenerTelefonoMensaje } = require("../helper/helperWhatsapp");
const { getWhatsAppProvider } = require("../providers/whatsapp.provider");
const { consultarGroq } = require("./ia.service");
const {
  activarFlujoPago,
  procesarRespuestaFlujoPago,
} = require("./pago.service");

const {
  buscarOCrearConversacion,
  guardarMensajeEntrante,
  actualizarActividadConversacion,
  obtenerHistorialConversacion,
  enviarMensajeConversacion,
} = require("./consercacion.service");
const { detectarIntencionPago } = require("../utils/inteciones");

// vrea el primer registro de sesión activa para un tenant
async function crearSesion({ tenantId, nombre }) {
  const sesionExistente = await prisma.whatsAppSession.findFirst({
    where: {
      tenantId,
      estado: {
        in: [
          "CREANDO",
          "CONECTANDO",
          "ESPERANDO_QR",
          "CONECTADO",
          "RECONNECTING",
        ],
      },
    },
  });

  if (sesionExistente) {
    return sesionExistente;
  }

  const sesion = await prisma.whatsAppSession.create({
    data: {
      nombre,
      provider: "BAILEYS",
      estado: "CREANDO",
      tenantId,
    },
  });

  const provider = getWhatsAppProvider(sesion.provider);

  await conectarSesion(sesion, provider);

  return prisma.whatsAppSession.findUnique({
    where: {
      id: sesion.id,
    },
  });
}

// Es una función interna para no repetir el mismo código cuando:

// creamos una sesión nueva;
// recuperamos una sesión existente después de reiniciar Node.

async function listarSesiones(tenantId) {
  return prisma.whatsAppSession.findMany({
    where: {
      tenantId,
    },
    orderBy: {
      id: "desc",
    },
  });
}

// por ahora solo estamos trabajando con texto E Imagenes Nada Mas
function obtenerTextoMensaje(message) {
  const contenido = message.message;

  if (contenido?.conversation) {
    return contenido.conversation;
  }

  if (contenido?.extendedTextMessage?.text) {
    return contenido.extendedTextMessage.text;
  }

  return null;
}

//manejando un hitorial De Los Mensajes

async function procesarMensajeEntrante({ tenantId, sessionId, message }) {
  // Evitar procesar mensajes enviados por el propio bot.
  if (message.key?.fromMe) return;

  // obtenemos El numero de telefono del mensaje entrante
  const { telefono, jid } = obtenerTelefonoMensaje(message);

  const identificador = telefono || jid;

  if (!telefono && !jid) return;

  const texto = obtenerTextoMensaje(message);

  // Por ahora procesamos únicamente mensajes de texto.
  if (!texto) return;

  const messageId = message.key?.id || null;
  const nombreContacto = message.pushName || null;

  // Evitar procesar dos veces el mismo mensaje de WhatsApp.
  if (messageId) {
    const mensajeExistente = await prisma.mensaje.findFirst({
      where: {
        messageId,
        conversacion: {
          tenantId,
          sessionId,
        },
      },
    });

    if (mensajeExistente) return;
  }

  // aqui buscamos La conversacion abierta para el telefono entrante y si no hay una conversacion abierta se crea una nueva
  const { conversacion, esNuevaConversacion } = await buscarOCrearConversacion({
    tenantId,
    sessionId,
    identificador,
    nombreContacto,
  });

  // Guardar el mensaje recibido.
  const mensajeGuardado = await guardarMensajeEntrante({
    messageId,
    texto,
    conversacionId: conversacion.id,
  });
  // Actualizar actividad y nombre del contacto.
  await actualizarActividadConversacion({
    conversacion,
    nombreContacto,
  });

  // El menú se envía solamente al iniciar una conversación.
  if (esNuevaConversacion) {
    const sesion = await obtenerSesion({
      tenantId,
      sessionId,
    });

    if (sesion?.mensajeBienvenida) {
      await enviarMensajeConversacion({
        tenantId,
        sessionId,
        telefono,
        jid,
        texto: sesion.mensajeBienvenida,
        conversacionId: conversacion.id,
      });
    }

    return; // Evita que la IA responda en este momento
  }

  // Recuperar los últimos 12 mensajes anteriores al actual.

  // Activar el flujo de pago cuando el usuario elige la opción 4.

  const conversacionActual = await prisma.conversacion.findUnique({
    where: { id: conversacion.id },
    select: { flujoPago: true },
  });

  const flujoPago = conversacionActual?.flujoPago;
  if (detectarIntencionPago(texto)) {
    await activarFlujoPago(conversacion.id, tenantId);
  }

  // Procesar la respuesta del flujo de pago si está activo. Para No tener que Usar La IA en este caso y que el flujo de pago sea mas controlado
  const respuestaProcesada = await procesarRespuestaFlujoPago({
    tenantId,
    sessionId,
    telefono,
    jid,
    conversacionId: conversacion.id,
    texto,
  });
  if (respuestaProcesada) return;

  const historial = await obtenerHistorialConversacion({
    conversacionId: conversacion.id,
    excluirMensajeId: mensajeGuardado.id,
    limite: 12,
  });

  let respuestaIA;

  try {
    console.log("[WHATSAPP] Consultando IA:", {
      tenantId,
      sessionId,
      conversacionId: conversacion.id,
    });

    respuestaIA = await consultarGroq({
      tenantId,
      mensaje: texto,
      historial,
      conversacionId: conversacion.id,
    });
  } catch (error) {
    console.error("[WHATSAPP] Error consultando IA:", error);

    await enviarMensajeConversacion({
      tenantId,
      sessionId,
      telefono,
      jid,
      texto:
        "Lo siento, en este momento no pude procesar tu solicitud. " +
        "Por favor, inténtalo nuevamente en unos minutos.",
      conversacionId: conversacion.id,
    });

    return;
  }

  if (!respuestaIA?.trim()) return;

  // Enviar la respuesta de la IA y guardarla en PostgreSQL.
  await enviarMensajeConversacion({
    tenantId,
    sessionId,
    telefono,
    jid,
    texto: respuestaIA,
    conversacionId: conversacion.id,
  });
}

async function conectarSesion(sesion, provider) {
  await provider.connect({
    sessionId: sesion.id,

    tenantId: sesion.tenantId,

    onQr: async () => {
      await prisma.whatsAppSession.update({
        where: {
          id: sesion.id,
        },
        data: {
          estado: "ESPERANDO_QR",
        },
      });
    },

    onConnection: async ({ estado, telefono }) => {
      await prisma.whatsAppSession.update({
        where: {
          id: sesion.id,
        },
        data: {
          estado,
          telefono,
          ultimaConexion: estado === "CONECTADO" ? new Date() : undefined,
        },
      });
    },

    onMessage: async (message) => {
      await procesarMensajeEntrante({
        tenantId: sesion.tenantId,
        sessionId: sesion.id,
        message,
      });
    },
  });
}

//Busca primero la sesión en PostgreSQL:

async function obtenerQrSesion({ tenantId, sessionId }) {
  const sesion = await obtenerSesion({
    tenantId,
    sessionId,
  });

  if (!sesion) {
    throw new Error("Sesión de WhatsApp no encontrada");
  }

  const provider = getWhatsAppProvider(sesion.provider);

  let resultadoQr = provider.getQr({
    tenantId,
    sessionId,
  });

  /*
   * La sesión existe en PostgreSQL,
   * pero no está cargada en memoria.
   */
  if (resultadoQr.estado === null) {
    await conectarSesion(sesion, provider);

    resultadoQr = provider.getQr({
      tenantId,
      sessionId,
    });
  }

  return {
    sesion,
    ...resultadoQr,
  };
}

async function desconectarSesion({ tenantId, sessionId }) {
  const sesion = await obtenerSesion({
    tenantId,
    sessionId,
  });

  if (!sesion) {
    throw new Error("Sesión de WhatsApp no encontrada");
  }

  const provider = getWhatsAppProvider(sesion.provider);

  await provider.disconnect({
    sessionId: sesion.id,
    tenantId: sesion.tenantId,
  });

  return prisma.whatsAppSession.update({
    where: {
      id: sesion.id,
    },
    data: {
      estado: "DESCONECTADO",
      telefono: null,
    },
  });
}

async function obtenerSesion({ tenantId, sessionId }) {
  return prisma.whatsAppSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
    },
  });
}

module.exports = {
  crearSesion,
  listarSesiones,
  obtenerQrSesion,
  desconectarSesion,
  conectarSesion,
  obtenerSesion,
};
