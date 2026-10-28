const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

async function crearUsuario({
    usuario,
    password,
    nombre,
    tenantId
}) {
    const passwordHash = await bcrypt.hash(password, 10);

    return prisma.user.create({
        data: {
            usuario,
            password: passwordHash,
            nombre,
            tenantId,
            estado: 'ACTIVO'
        }
    });
}

async function obtenerUsuarioPorUsuario(usuario) {
    return prisma.user.findUnique({
        where: {
            usuario
        }
    });
}

async function validarPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

module.exports = {
    crearUsuario,
    obtenerUsuarioPorUsuario,
    validarPassword
};