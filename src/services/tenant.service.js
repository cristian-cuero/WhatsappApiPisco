const prisma = require('../config/prisma');

async function crearTenant({ codigo, nombre }) {
    return prisma.tenant.create({
        data: {
            codigo,
            nombre,
            estado: 'ACTIVO'
        }
    });
}

async function obtenerTenantPorCodigo(codigo) {
    return prisma.tenant.findUnique({
        where: {
            codigo
        }
    });
}

async function configurarIntegracionPisco({
    tenantId,
    apiUsername,
    apiPassword,
}) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new Error('El tenant no es válido');
    }

    if (
        typeof apiUsername !== 'string' ||
        !apiUsername.trim() ||
        typeof apiPassword !== 'string' ||
        !apiPassword
    ) {
        throw new Error(
            'El usuario y la contraseña de Pisco son obligatorios'
        );
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
    });

    if (!tenant) {
        throw new Error('Tenant no encontrado');
    }

    const apiPasswordEncrypted = cifrar(apiPassword);

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            apiUsername: apiUsername.trim(),
            apiPasswordEncrypted,
            apiActivo: true,
        },
    });

    return {
        ok: true,
        configurado: true,
    };
}

async function obtenerEstadoIntegracionPisco(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            apiUsername: true,
            apiActivo: true,
            apiPasswordEncrypted: true,
        },
    });

    if (!tenant) {
        throw new Error('Tenant no encontrado');
    }

    return {
        configurado: Boolean(
            tenant.apiUsername &&
            tenant.apiPasswordEncrypted
        ),
        activo: tenant.apiActivo,
        usuario: tenant.apiUsername,
    };
}

// Activar o desactivar la integración sin borrar las credenciales.
async function cambiarEstadoIntegracionPisco({
    tenantId,
    activo,
}) {
    if (typeof activo !== 'boolean') {
        throw new Error('El estado debe ser verdadero o falso');
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            apiUsername: true,
            apiPasswordEncrypted: true,
        },
    });

    if (!tenant) {
        throw new Error('Tenant no encontrado');
    }

    if (
        activo &&
        (!tenant.apiUsername || !tenant.apiPasswordEncrypted)
    ) {
        throw new Error(
            'Debes configurar las credenciales antes de activar Pisco'
        );
    }

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            apiActivo: activo,
        },
    });

    return {
        ok: true,
        activo,
    };
}


module.exports = {
    crearTenant,
    obtenerTenantPorCodigo,
    configurarIntegracionPisco,
    obtenerEstadoIntegracionPisco,
    cambiarEstadoIntegracionPisco,
};