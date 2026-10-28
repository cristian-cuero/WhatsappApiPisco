const config = require('./env');

const tenant = {
    id: config.tenantId,
    nombre: 'Pisco Company Tics',
    estado: 'ACTIVO'
};

function getTenant() {
    return tenant;
}

function getTenantId() {
    return tenant.id;
}

module.exports = {
    getTenant,
    getTenantId
};