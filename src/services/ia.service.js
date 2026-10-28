const fs = require("node:fs/promises");
const path = require("node:path");
const prisma = require("../config/prisma");

const {
  obtenerTokenPisco,
  invalidarTokenPisco,
} = require("./pisco-api.service");

const RUTA_INSTRUCCIONES = path.join(
  __dirname,
  "../config/ia/intrucciones.txt",
);

const RUTA_OPERACIONES = path.join(__dirname, "../config/ia/operaciones.json");

const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";

async function obtenerInstrucciones() {
  return fs.readFile(RUTA_INSTRUCCIONES, "utf8");
}

async function obtenerOperaciones() {
  return JSON.parse(await fs.readFile(RUTA_OPERACIONES, "utf8"));
}

function crearHerramientas(operaciones) {
  return Object.entries(operaciones)
    .filter(([, operacion]) => operacion.metodo && operacion.ruta)
    .map(([nombre, operacion]) => ({
      type: "function",
      function: {
        name: nombre,
        description: operacion.descripcion,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(operacion.parametros || {}).map(
              ([nombreParametro, parametro]) => [
                nombreParametro,
                {
                  type: parametro.tipo,
                  description: parametro.descripcion,
                },
              ],
            ),
          ),
          required: Object.entries(operacion.parametros || {})
            .filter(([, parametro]) => parametro.requerido)
            .map(([nombre]) => nombre),
          additionalProperties: false,
        },
      },
    }));
}

function validarArgumentos(operacion, argumentos) {
  if (
    !argumentos ||
    typeof argumentos !== "object" ||
    Array.isArray(argumentos)
  ) {
    throw new Error("Los parámetros no son válidos.");
  }

  const parametros = operacion.parametros;

  for (const nombre of Object.keys(argumentos)) {
    if (!Object.hasOwn(parametros, nombre)) {
      throw new Error("Se recibió un parámetro no autorizado.");
    }
  }

  for (const [nombre, definicion] of Object.entries(parametros)) {
    const valor = argumentos[nombre];

    if (
      definicion.requerido &&
      (valor === undefined || valor === null || String(valor).trim() === "")
    ) {
      throw new Error(`Falta el parámetro ${nombre}.`);
    }

    if (valor === undefined) continue;

    if (typeof valor !== "string" && typeof valor !== "number") {
      throw new Error(`El parámetro ${nombre} no es válido.`);
    }

    if (definicion.patron) {
      const patron = new RegExp(definicion.patron);

      if (!patron.test(String(valor))) {
        throw new Error(`El parámetro ${nombre} no tiene un formato válido.`);
      }
    }
  }
}

async function validarSeguridadOperacion({
  tenantId,
  conversacionId,
  operacion,
  argumentos,
}) {
  const seguridad = operacion.seguridad;

  // Las operaciones sin reglas adicionales conservan su comportamiento.
  if (!seguridad) return;

  if (seguridad.requiereConfirmacion) {
    if (!conversacionId) {
      throw new Error(
        "No se puede verificar la confirmación de esta conversación.",
      );
    }

    const conversacion = await prisma.conversacion.findFirst({
      where: {
        id: conversacionId,
        tenantId,
        estado: "ABIERTA",
      },
      select: {
        flujoPago: true,
      },
    });

    if (!conversacion) {
      throw new Error("No se encontró la conversación activa.");
    }

    const flujo = conversacion.flujoPago;

    if (
      !flujo ||
      flujo.paso !== "CONFIRMADO" ||
      flujo.confirmacion?.confirmado !== true
    ) {
      throw new Error(
        "El cliente debe confirmar el pago antes de generar el enlace.",
      );
    }

    if (
      seguridad.requiereContratoConsultado &&
      (typeof flujo.contratoSeleccionado !== "string" ||
        !Array.isArray(flujo.contratosConsultados) ||
        !flujo.contratosConsultados.some(
          (contrato) =>
            String(contrato.idcontrato) === flujo.contratoSeleccionado,
        ))
    ) {
      throw new Error("El contrato no está validado en la conversación.");
    }

    if (seguridad.validarValorEnServidor) {
      const cantidad = flujo.cantidadCuotas;
      const cuota = flujo.cuotaMensual;
      const total = flujo.valorTotal;

      if (
        !Number.isInteger(cantidad) ||
        cantidad < 1 ||
        cantidad > 12 ||
        !Number.isSafeInteger(cuota) ||
        cuota <= 0 ||
        !Number.isSafeInteger(total) ||
        total !== cuota * cantidad ||
        argumentos.contrato !== flujo.contratoSeleccionado ||
        argumentos.valor !== total
      ) {
        throw new Error(
          "El contrato o el valor del pago no coincide con los datos confirmados.",
        );
      }
    }
  }
}

async function ejecutarPeticionPisco({
  tenantId,
  operacion,
  argumentos,
  conversacionId,
}) {
  validarArgumentos(operacion, argumentos);

  await validarSeguridadOperacion({
    tenantId,
    conversacionId,
    operacion,
    argumentos,
  });

  const metodo = String(operacion.metodo).toUpperCase();

  console.log("[PISCO] Método:", metodo);
  console.log("[PISCO] Ruta:", operacion.ruta);

  if (!["GET", "POST"].includes(metodo)) {
    throw new Error("Método HTTP no autorizado.");
  }

  // POST solo está permitido para generar enlaces de pago.
  if (metodo === "POST" && operacion.ruta !== "/api/contrato/crearLinkPago") {
    throw new Error("Esta operación POST no está autorizada.");
  }

  const apiUrl = process.env.PISCO_API_URL;

  if (!apiUrl) {
    throw new Error("Falta configurar PISCO_API_URL.");
  }

  const base = apiUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${operacion.ruta}`);
  const body = {};

  for (const [nombre, definicion] of Object.entries(operacion.parametros)) {
    const valor = argumentos[nombre];

    if (valor === undefined) continue;

    if (metodo === "GET" && definicion.ubicacion === "query") {
      url.searchParams.set(nombre, String(valor));
      continue;
    }

    if (metodo === "POST" && definicion.ubicacion === "body") {
      body[nombre] = valor;
      continue;
    }

    throw new Error(`Ubicación no autorizada para el parámetro ${nombre}.`);
  }

  for (let intento = 0; intento < 2; intento++) {
    const token = await obtenerTokenPisco(tenantId);

    const opciones = {
      method: metodo,
      headers: {
        "x-token": token,
      },
      signal: AbortSignal.timeout(20000),
    };

    if (metodo === "POST") {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(body);
    }

    const respuesta = await fetch(url, opciones);

    if (respuesta.status === 401 && intento === 0) {
      invalidarTokenPisco(tenantId);
      continue;
    }

    if (!respuesta.ok) {
      throw new Error(`Pisco respondió con HTTP ${respuesta.status}.`);
    }

    const texto = await respuesta.text();

    let resultado;

    try {
      resultado = JSON.parse(texto);
    } catch {
      throw new Error("Pisco devolvió una respuesta no válida.");
    }

    await guardarResultadoEnFlujoPago({
      tenantId,
      conversacionId,
      operacion,
      resultado,
    });

    // Validar la respuesta del generador de enlaces.
    if (metodo === "POST" && operacion.ruta === "/api/contrato/crearLinkPago") {
      const shortUrl = resultado?.shortUrl;

      if (typeof shortUrl !== "string") {
        throw new Error("Pisco no devolvió el enlace de pago esperado.");
      }

      let enlace;

      try {
        enlace = new URL(shortUrl);
      } catch {
        throw new Error("Pisco devolvió un enlace no válido.");
      }

      if (enlace.protocol !== "https:") {
        throw new Error("El enlace de pago debe utilizar HTTPS.");
      }

      return { shortUrl };
    }

    return resultado;
  }

  throw new Error("No fue posible autenticar la consulta en Pisco.");
}


async function consultarGroq({
  tenantId,
  mensaje,
  historial = [],
  conversacionId,
}) {
  const apiKey = process.env.GROQ_API_KEY;
  const modelo = process.env.GROQ_MODEL;

  if (!apiKey || !modelo) {
    throw new Error("Configura GROQ_API_KEY y GROQ_MODEL en el archivo .env.");
  }

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("El tenantId no es válido.");
  }

  const [instrucciones, operaciones] = await Promise.all([
    obtenerInstrucciones(),
    obtenerOperaciones(),
  ]);

  const herramientas = crearHerramientas(operaciones);

  console.log("[IA] Herramientas disponibles:", Object.keys(operaciones));

  const mensajes = [
    { role: "system", content: instrucciones },
    ...historial,
    { role: "user", content: mensaje },
  ];

  for (let ronda = 0; ronda < 5; ronda++) {
    const opcionesGroq = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        tools: herramientas,
        tool_choice: "auto",
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    };

    let respuesta;

    // Reintentar hasta 3 veces cuando Groq responde HTTP 429.
    for (let intento = 0; intento < 3; intento++) {
      respuesta = await fetch(URL_GROQ, opcionesGroq);

      if (respuesta.status !== 429) break;

      const detalle = await respuesta.text();

      if (intento === 2) {
        throw new Error(
          `Groq sigue limitado después de 3 intentos: ${detalle}`,
        );
      }

      const esperaIndicada = detalle.match(
        /try again in\s+([\d.]+)s/i,
      );

      const retryAfter = Number(respuesta.headers.get("retry-after"));

      const segundos = esperaIndicada
        ? Number(esperaIndicada[1])
        : Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : 4;

      const esperaMs = Math.ceil((segundos + 0.5) * 1000);

      console.warn(
        `[GROQ] HTTP 429. Reintentando en ${esperaMs} ms.`,
      );

      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text();

      console.error("[GROQ] Error HTTP:", respuesta.status);
      console.error("[GROQ] Detalle:", detalle);

      throw new Error(`Error de Groq: HTTP ${respuesta.status}`);
    }

    const datos = await respuesta.json();
    const mensajeIA = datos.choices?.[0]?.message;

    if (!mensajeIA) {
      throw new Error("Groq no devolvió una respuesta válida.");
    }

    console.log("[IA] Respuesta de Groq:", {
      contenido: mensajeIA.content,
      herramientasSolicitadas:
        mensajeIA.tool_calls?.map(
          (llamada) => llamada.function?.name,
        ) ?? [],
    });

    if (!mensajeIA.tool_calls?.length) {
      if (typeof mensajeIA.content !== "string") {
        throw new Error("Groq devolvió una respuesta vacía.");
      }

      return mensajeIA.content;
    }

    mensajes.push(mensajeIA);

    for (const llamada of mensajeIA.tool_calls) {
      const nombreOriginal = llamada.function?.name || "";
      const nombre = nombreOriginal.split("<|")[0].trim();

      let resultado;

      try {
        const operacion = operaciones[nombre];

        if (!operacion) {
          throw new Error("Operación no autorizada.");
        }

        const argumentos = JSON.parse(
          llamada.function.arguments || "{}",
        );

        resultado = await ejecutarPeticionPisco({
          tenantId,
          operacion,
          argumentos,
          conversacionId,
        });
      } catch (error) {
        console.error(
          `[IA] Error ejecutando herramienta ${nombre}:`,
          error.message,
        );

        resultado = {
          error: error.message || "No se pudo completar la consulta.",
        };
      }

      mensajes.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: JSON.stringify(resultado),
      });
    }
  }

  throw new Error("Se alcanzó el límite de llamadas a herramientas.");
}


async function guardarResultadoEnFlujoPago({
  tenantId,
  conversacionId,
  operacion,
  resultado,
}) {
  const config = operacion.flujoPago;

  if (!config?.guardarResultado || !conversacionId) {
    return;
  }

  const conversacion = await prisma.conversacion.findFirst({
    where: {
      id: conversacionId,
      tenantId,
      estado: "ABIERTA",
    },
    select: {
      flujoPago: true,
    },
  });

  if (!conversacion) {
    throw new Error("No se encontró la conversación activa.");
  }

  const flujoActual = conversacion.flujoPago || {};

  

  const registros = Array.isArray(resultado) ? resultado : [];
  const campos = config.campos || {};

  const contratos = registros
    .map((registro) => {
      const contrato = {};

      for (const [destino, origen] of Object.entries(campos)) {
        if (registro[origen] !== undefined) {
          contrato[destino] = registro[origen];
        }
      }

      if (contrato.idcontrato !== undefined) {
        contrato.idcontrato = String(contrato.idcontrato);
      }

      if (contrato.cuota !== undefined) {
        contrato.cuota = Number(contrato.cuota);
      }

      return contrato;
    })
    .filter(
      (contrato) =>
        typeof contrato.idcontrato === "string" &&
        contrato.idcontrato.trim() !== "" &&
        Number.isSafeInteger(contrato.cuota) &&
        contrato.cuota > 0,
    );

  let paso = "SIN_CONTRATOS";
  let seleccionado = null;

  if (contratos.length === 1) {
    paso = "ESPERANDO_CUOTAS";
    seleccionado = contratos[0];
  } else if (contratos.length > 1) {
    paso = "ESPERANDO_CONTRATO";
  }

  await prisma.conversacion.update({
    where: {
      id: conversacionId,
    },
    data: {
      flujoPago: {
        ...flujoActual,
        contratosConsultados: contratos,
        contratoSeleccionado: seleccionado?.idcontrato ?? null,
        cuotaMensual: seleccionado?.cuota ?? null,
        cantidadCuotas: null,
        valorTotal: null,
        confirmacion: {
          confirmado: false,
        },
        paso,
      },
    },
  });
}
module.exports = {
  obtenerInstrucciones,
  consultarGroq,
};
