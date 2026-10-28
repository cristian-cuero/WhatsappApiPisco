
const prisma = require("../config/prisma");
const {
  enviarMensajeConversacion,
} = require("./consercacion.service");


async function activarFlujoPago(conversacionId, tenantId) {
  const conversacion = await prisma.conversacion.findFirst({
    where: {
      id: conversacionId,
      tenantId,
      estado: "ABIERTA",
    },
  });

  if (!conversacion) return;

  const flujoActual =
    conversacion.flujoPago &&
    typeof conversacion.flujoPago === "object"
      ? conversacion.flujoPago
      : {};

  // No reiniciar un flujo que ya está en curso.
  if (flujoActual.activo === true) return;

  const contratos = Array.isArray(flujoActual.contratosConsultados)
    ? flujoActual.contratosConsultados
    : [];

  let paso = "ESPERANDO_CEDULA";
  let contratoSeleccionado = null;

  if (contratos.length === 1) {
    paso = "ESPERANDO_CUOTAS";
    contratoSeleccionado = contratos[0];
  } else if (contratos.length > 1) {
    paso = "ESPERANDO_CONTRATO";
  }

  await prisma.conversacion.update({
    where: { id: conversacionId },
    data: {
      flujoPago: {
        ...flujoActual,
        activo: true,
        paso,
        contratosConsultados: contratos,
        contratoSeleccionado:
          contratoSeleccionado?.idcontrato ?? null,
        cuotaMensual: contratoSeleccionado?.cuota ?? null,
        cantidadCuotas: null,
        valorTotal: null,
        confirmacion: { confirmado: false },
      },
    },
  });
}



async function procesarRespuestaFlujoPago({
  tenantId,
  sessionId,
  telefono,
  jid,
  conversacionId,
  texto,
}) {
  const conversacion = await prisma.conversacion.findFirst({
    where: {
      id: conversacionId,
      tenantId,
      sessionId,
      estado: "ABIERTA",
    },
  });

  if (!conversacion) return false;

  const flujo = conversacion.flujoPago;

  if (!flujo || flujo.activo !== true) return false;

  const respuesta = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // PASO 1: Seleccionar contrato
  if (flujo.paso === "ESPERANDO_CONTRATO") {
    const contratos = flujo.contratosConsultados || [];

    const contratoSeleccionado =
      contratos.find(
        (contrato) => contrato.idcontrato.toLowerCase() === respuesta,
      ) || contratos[Number(respuesta) - 1];

    if (!contratoSeleccionado || !contratos.includes(contratoSeleccionado)) {
      await enviarMensajeConversacion({
        tenantId,
        sessionId,
        telefono,
        jid,
        conversacionId,
        texto: "Por favor, selecciona un número de contrato válido.",
      });

      return true;
    }

    await prisma.conversacion.update({
      where: { id: conversacionId },
      data: {
        flujoPago: {
          ...flujo,
          paso: "ESPERANDO_CUOTAS",
          contratoSeleccionado: contratoSeleccionado.idcontrato,
          cuotaMensual: Number(contratoSeleccionado.cuota),
          cantidadCuotas: null,
          valorTotal: null,
          confirmacion: { confirmado: false },
        },
      },
    });

    await enviarMensajeConversacion({
      tenantId,
      sessionId,
      telefono,
      jid,
      conversacionId,
      texto:
        `Contrato: ${contratoSeleccionado.idcontrato}\n` +
        `Plan: ${contratoSeleccionado.nombreplan}\n` +
        `Cuota mensual: $${Number(contratoSeleccionado.cuota).toLocaleString("es-CO")}\n\n` +
        "¿Cuántas cuotas deseas pagar? Puedes elegir de 1 a 12.",
    });

    return true;
  }

  // PASO 2: Elegir cantidad de cuotas
  if (flujo.paso === "ESPERANDO_CUOTAS") {
    const cantidad = Number(respuesta);

    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 12) {
      await enviarMensajeConversacion({
        tenantId,
        sessionId,
        telefono,
        jid,
        conversacionId,
        texto: "Ingresa una cantidad válida de cuotas, entre 1 y 12.",
      });

      return true;
    }

    const cuotaMensual = Number(flujo.cuotaMensual);

    if (
      !Number.isFinite(cuotaMensual) ||
      cuotaMensual <= 0 ||
      !flujo.contratoSeleccionado
    ) {
      await enviarMensajeConversacion({
        tenantId,
        sessionId,
        telefono,
        jid,
        conversacionId,
        texto:
          "No pude validar los datos del contrato. Escribe 4 para iniciar nuevamente el pago.",
      });

      return true;
    }

    const valorTotal = cuotaMensual * cantidad;

    await prisma.conversacion.update({
      where: { id: conversacionId },
      data: {
        flujoPago: {
          ...flujo,
          paso: "ESPERANDO_CONFIRMACION",
          cantidadCuotas: cantidad,
          valorTotal,
          confirmacion: { confirmado: false },
        },
      },
    });

    await enviarMensajeConversacion({
      tenantId,
      sessionId,
      telefono,
      jid,
      conversacionId,
      texto:
        `Contrato: ${flujo.contratoSeleccionado}\n` +
        `Cuotas: ${cantidad}\n` +
        `Valor por cuota: $${cuotaMensual.toLocaleString("es-CO")}\n` +
        `Total a pagar: $${valorTotal.toLocaleString("es-CO")}\n\n` +
        "¿Confirmas que deseas generar el enlace de pago? Responde Sí o No.",
    });

    return true;
  }

  // PASO 3: Confirmar o cancelar
  if (flujo.paso === "ESPERANDO_CONFIRMACION") {
    if (["si", "confirmo", "confirmar", "acepto"].includes(respuesta)) {
      await prisma.conversacion.update({
        where: { id: conversacionId },
        data: {
          flujoPago: {
            ...flujo,
            paso: "CONFIRMADO",
            confirmacion: { confirmado: true },
          },
        },
      });

      // El siguiente paso generará el enlace directamente en el backend.
      // Por ahora se devuelve false para permitir que continúe el procesamiento.
      return false;
    }

    if (["no", "cancelar", "cancelo"].includes(respuesta)) {
      await prisma.conversacion.update({
        where: { id: conversacionId },
        data: {
          flujoPago: {
            ...flujo,
            activo: false,
            paso: "CANCELADO",
            confirmacion: { confirmado: false },
          },
        },
      });

      await enviarMensajeConversacion({
        tenantId,
        sessionId,
        telefono,
        jid,
        conversacionId,
        texto:
          "De acuerdo, cancelé la solicitud de pago. No se generó ningún enlace.",
      });

      return true;
    }

    await enviarMensajeConversacion({
      tenantId,
      sessionId,
      telefono,
      jid,
      conversacionId,
      texto: "Por favor, responde Sí para confirmar o No para cancelar.",
    });

    return true;
  }

  return false;
}

module.exports = {
  activarFlujoPago,
  procesarRespuestaFlujoPago,
};