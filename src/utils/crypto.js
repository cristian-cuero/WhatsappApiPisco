
const crypto = require("node:crypto");

function obtenerClave() {
    const valor = process.env.PISCO_CREDENTIALS_KEY;

    if (!valor || !/^[a-f0-9]{64}$/i.test(valor)) {
        throw new Error(
            "PISCO_CREDENTIALS_KEY debe contener 64 caracteres hexadecimales"
        );
    }

    return Buffer.from(valor, "hex");
}

function cifrar(texto) {
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        obtenerClave(),
        iv
    );

    const cifrado = Buffer.concat([
        cipher.update(texto, "utf8"),
        cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return [
        iv.toString("hex"),
        tag.toString("hex"),
        cifrado.toString("hex"),
    ].join(":");
}

function descifrar(valor) {
    const partes = valor.split(":");

    if (partes.length !== 3) {
        throw new Error("Formato de credencial cifrada inválido");
    }

    const [ivHex, tagHex, contenidoHex] = partes;

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        obtenerClave(),
        Buffer.from(ivHex, "hex")
    );

    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    return Buffer.concat([
        decipher.update(Buffer.from(contenidoHex, "hex")),
        decipher.final(),
    ]).toString("utf8");
}

module.exports = {
    cifrar,
    descifrar,
};
