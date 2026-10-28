function obtenerTelefonoMensaje(message) {
    
    const jidAlternativo = message.key?.remoteJidAlt;
    const jidOriginal = message.key?.remoteJid;

    // Preferimos el JID telefónico si WhatsApp lo proporciona.
    const jid = jidAlternativo?.endsWith("@s.whatsapp.net")
        ? jidAlternativo
        : jidOriginal;

    if (!jid) {
        return {
            telefono: null,
            jid: null,
        };
    }

    // Solo extraemos el teléfono cuando realmente tenemos un JID telefónico.
    const telefono = jid.endsWith("@s.whatsapp.net")
        ? jid.replace("@s.whatsapp.net", "")
        : null;

    return {
        telefono,
        jid,
    };

}

module.exports = {
    obtenerTelefonoMensaje,
};  