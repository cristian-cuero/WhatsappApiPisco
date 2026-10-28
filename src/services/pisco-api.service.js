
const prisma = require("../config/prisma");
const { descifrar } = require("../utils/crypto");

const tokensPorTenant = new Map();

function obtenerExpiracionToken(token) {
    try {
        const partes = token.split(".");
        const payload = JSON.parse(
            Buffer.from(partes[1], "base64url").toString("utf8")
        );

        return typeof payload.exp === "number"
            ? payload.exp * 1000
            : null;
    } catch {
        return null;
    }
}

async function obtenerTokenPisco(tenantId) {
    const guardado = tokensPorTenant.get(tenantId);
  
    if (
        guardado?.expiraEn &&
        guardado.expiraEn > Date.now() + 60_000
    ) {
        return guardado.token;
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            estado: true,
            apiUsername: true,
            apiPasswordEncrypted: true,
            apiActivo: true,
        },
    });

    if (!tenant || tenant.estado !== "ACTIVO") {
        throw new Error("El tenant no existe o está inactivo");
    }

    if (
        !tenant.apiActivo ||
        !tenant.apiUsername ||
        !tenant.apiPasswordEncrypted
    ) {
        throw new Error(
            "La integración de Pisco no está configurada o está desactivada"
        );
    }

    const apiUrl = process.env.PISCO_API_URL;

    if (!apiUrl) {
        throw new Error("Falta configurar PISCO_API_URL");
    }

    const password = tenant.apiPasswordEncrypted

      

    const respuesta = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/api/users/login`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: tenant.apiUsername,
                password,
            }),
            signal: AbortSignal.timeout(15_000),
        }
    );

    if (!respuesta.ok) {
        throw new Error(
            `Error autenticando con Pisco: HTTP ${respuesta.status}`
        );
    }

    const datos = await respuesta.json();

    if (
        typeof datos.token !== "string" ||
        !datos.token.trim()
    ) {
        throw new Error("Pisco no devolvió un token válido");
    }

    const expiraEn = obtenerExpiracionToken(datos.token);

    if (expiraEn && expiraEn > Date.now() + 60_000) {
        tokensPorTenant.set(tenantId, {
            token: datos.token,
            expiraEn,
        });
    }

    return datos.token;
}

function invalidarTokenPisco(tenantId) {
    tokensPorTenant.delete(tenantId);
}






module.exports = {
    obtenerTokenPisco,
    invalidarTokenPisco,
}


