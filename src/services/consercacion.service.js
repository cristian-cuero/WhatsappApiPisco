const prisma = require("../config/prisma");
const { getWhatsAppProvider } = require("../providers/whatsapp.provider");


// Buscar una conversación abierta o crearla.
async function buscarOCrearConversacion({
  tenantId,
  sessionId,
  identificador,
  nombreContacto,
}) {
  let conversacion = await prisma.conversacion.findFirst({
    where: {
      tenantId,
      sessionId,
      telefono: identificador,
      estado: "ABIERTA",
    },
  });

  if (conversacion) {
    return {
      conversacion,
      esNuevaConversacion: false,
    };
  }

  conversacion = await prisma.conversacion.create({
    data: {
      tenantId,
      sessionId,
      telefono: identificador,
      nombreContacto,
      estado: "ABIERTA",
      ultimaActividad: new Date(),
    },
  });

  return {
    conversacion,
    esNuevaConversacion: true,
  };
}

// Guardar un mensaje entrante.
async function guardarMensajeEntrante({ messageId, texto, conversacionId }) {
  return prisma.mensaje.create({
    data: {
      messageId,
      direccion: "ENTRANTE",
      tipo: "TEXT",
      contenido: texto,
      conversacionId,
    },
  });
}

// Actualizar la actividad de una conversación.
async function actualizarActividadConversacion({
  conversacion,
  nombreContacto,
}) {
  return prisma.conversacion.update({
    where: {
      id: conversacion.id,
    },
    data: {
      ultimaActividad: new Date(),
      nombreContacto: nombreContacto || conversacion.nombreContacto,
    },
  });
}

// Obtener el historial para enviarlo a Groq.
async function obtenerHistorialConversacion({
  conversacionId,
  excluirMensajeId,
  limite = 12,
}) {
  const mensajes = await prisma.mensaje.findMany({
    where: {
      conversacionId,
      ...(excluirMensajeId != null ? { id: { not: excluirMensajeId } } : {}),
    },
    orderBy: {
      id: "desc",
    },
    take: limite,
  });

  return mensajes.reverse().map((mensaje) => ({
    role: mensaje.direccion === "ENTRANTE" ? "user" : "assistant",
    content: mensaje.contenido,
  }));
}

// Enviar un mensaje y registrarlo en la base de datos.
async function enviarMensajeConversacion({
  tenantId,
  sessionId,
  telefono,
  jid,
  texto,
  conversacionId,
}) {
  const sesion = await prisma.whatsAppSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
    },
  });

  if (!sesion) {
    throw new Error("Sesión de WhatsApp no encontrada");
  }

  if (!sesion) {
    throw new Error("Sesión de WhatsApp no encontrada");
  }

  const provider = getWhatsAppProvider(sesion.provider);

  const resultado = await provider.sendMessage({
    sessionId,
    tenantId,
    telefono,
    jid,
    texto,
  });

  await prisma.mensaje.create({
    data: {
      messageId: resultado?.key?.id || null,
      direccion: "SALIENTE",
      tipo: "TEXT",
      contenido: texto,
      conversacionId,
    },
  });

  return resultado;
}

// Cerrar conversaciones vencidas por inactividad.
async function cerrarConversacionesVencidas() {
  const ahora = new Date();

  const conversaciones = await prisma.conversacion.findMany({
    where: {
      estado: "ABIERTA",
    },
    select: {
      id: true,
      ultimaActividad: true,
      session: {
        select: {
          timeoutConversacion: true,
        },
      },
    },
  });

  for (const conversacion of conversaciones) {
    const minutosInactividad = conversacion.session?.timeoutConversacion;

    if (
      minutosInactividad == null ||
      !Number.isFinite(Number(minutosInactividad)) ||
      Number(minutosInactividad) <= 0 ||
      !conversacion.ultimaActividad
    ) {
      continue;
    }

    const fechaLimite = new Date(
      ahora.getTime() - Number(minutosInactividad) * 60 * 1000,
    );

    if (conversacion.ultimaActividad <= fechaLimite) {
      await prisma.conversacion.updateMany({
        where: {
          id: conversacion.id,
          estado: "ABIERTA",
          ultimaActividad: {
            lte: fechaLimite,
          },
        },
        data: {
          estado: "CERRADA",
          fechaCierre: ahora,
          motivoCierre: "INACTIVIDAD",
        },
      });
    }
  }
}

module.exports = {
  buscarOCrearConversacion,
  guardarMensajeEntrante,
  actualizarActividadConversacion,
  obtenerHistorialConversacion,
  enviarMensajeConversacion,
  cerrarConversacionesVencidas,
};
