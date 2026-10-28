require('dotenv').config();

module.exports = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 9070,
    host: process.env.HOST || '0.0.0.0',
    appName: process.env.APP_NAME || 'Pisco WhatsApp IA',
    tenantId: process.env.TENANT_ID || 'TEN_001'
};