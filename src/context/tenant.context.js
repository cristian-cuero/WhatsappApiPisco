const { getTenant } = require('../config/tentant');

function createTenantContext() {

    const tenant = getTenant();

    return {
        tenantId: tenant.id,
        tenant: tenant
    };
}

module.exports = {
    createTenantContext
};