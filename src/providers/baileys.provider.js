const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");

const path = require("path");
const fs = require("fs");

class BaileysProvider {
  constructor() {
    this.sessions = new Map();
  }

  async connect({ sessionId, tenantId, onQr, onConnection, onMessage }) {
    const sessionKey = `${tenantId}:${sessionId}`;

    /*
     * Si ya existe una conexión para esta sesión,
     * reutilizamos la sesión existente.
     */
    if (this.sessions.has(sessionKey)) {
      return this.sessions.get(sessionKey);
    }

    const sessionPath = path.join(
      process.cwd(),
      "sessions",
      String(tenantId),
      String(sessionId),
    );

    fs.mkdirSync(sessionPath, {
      recursive: true,
    });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      auth: state,
      markOnlineOnConnect: false,
    });

    const session = {
      sessionId,
      tenantId,
      sock,
      qr: null,
      estado: "CONECTANDO",
    };

    this.sessions.set(sessionKey, session);

    /*
     * Baileys actualiza aquí las credenciales
     * necesarias para mantener la sesión de WhatsApp.
     */
    sock.ev.on("creds.update", saveCreds);

    /// escuchamos le mensajes

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // evitamos responder a los mensajes que no sean de tipo "notify"
      if (type !== "notify") {
        return;
      }

      for (const message of messages) {
        if (!message.message) {
          continue;
        }

        // ecitamos reponder a los mensajes que enviamos nosotros mismos
        if (message.key.fromMe) {
          continue;
        }

        if (onMessage) {
          await onMessage(message);
        }
      }
    });

    /*
     * Eventos de conexión de WhatsApp.
     */
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      /*
       * Baileys generó un QR.
       */
      if (qr) {
        session.qr = qr;
        session.estado = "ESPERANDO_QR";

        if (onQr) {
          await onQr(qr);
        }
      }

      /*
       * WhatsApp quedó conectado.
       */
      if (connection === "open") {
        session.qr = null;
        session.estado = "CONECTADO";

        if (onConnection) {
          await onConnection({
            estado: "CONECTADO",
            telefono: sock.user?.id || null,
          });
        }
      }

      /*
       * WhatsApp perdió la conexión.
       */
      if (connection === "close") {
        const statusCode = new Boom(lastDisconnect?.error).output.statusCode;

        const loggedOut = statusCode === DisconnectReason.loggedOut;

        /*
         * Eliminamos la conexión actual
         * de memoria.
         */
        this.sessions.delete(sessionKey);

        /*
         * Si el usuario cerró sesión desde
         * WhatsApp, no debemos reconectar.
         */
        if (loggedOut) {
          session.estado = "DESCONECTADO";

          if (onConnection) {
            await onConnection({
              estado: "DESCONECTADO",
              telefono: null,
            });
          }

          return;
        }

        /*
         * Para los demás casos intentamos
         * establecer nuevamente la conexión.
         */
        session.estado = "RECONNECTING";

        await this.connect({
          sessionId,
          tenantId,
          onQr,
          onConnection,
          onMessage,
        });
      }
    });

    return session;
  }

  getQr({ sessionId, tenantId }) {
    const sessionKey = `${tenantId}:${sessionId}`;

    const session = this.sessions.get(sessionKey);

    if (!session) {
      return {
        disponible: false,
        qr: null,
        estado: null,
        mensaje: "La sesión no está conectada al proveedor",
      };
    }

    return {
      disponible: !!session.qr,
      qr: session.qr || null,
      estado: session.estado,
      mensaje: null,
    };
  }

  getSession({ sessionId, tenantId }) {
    const sessionKey = `${tenantId}:${sessionId}`;

    return this.sessions.get(sessionKey);
  }

  async sendMessage({ sessionId, tenantId, telefono, jid, texto }) {
    const sessionKey = `${tenantId}:${sessionId}`;

    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new Error("La sesión de WhatsApp no está conectada");
    }

    if (session.estado !== "CONECTADO") {
      throw new Error("La sesión de WhatsApp no está conectada");
    }
    // Si ya tenemos un JID, lo usamos directamente.
    // Si no hay JID, construimos el destinatario a partir del teléfono.
    const destinatario =
      jid ||
      (telefono
        ? telefono.includes("@")
          ? telefono
          : `${telefono}@s.whatsapp.net`
        : null);

    if (!destinatario) {
      throw new Error("No se encontró un destinatario válido");
    }

    console.log("Destinatario:", destinatario);
    return session.sock.sendMessage(destinatario, {
      text: texto,
    });
  }
  async disconnect({ sessionId, tenantId }) {
    const sessionKey = `${tenantId}:${sessionId}`;

    const session = this.sessions.get(sessionKey);

    if (!session) {
      return;
    }

    await session.sock.logout();

    this.sessions.delete(sessionKey);
  }
}

module.exports = BaileysProvider;
