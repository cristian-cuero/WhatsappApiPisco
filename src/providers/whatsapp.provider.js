//aqui seleccionamos el proveedor de whatsapp que vamos a usar, 
// por ahora solo tenemos uno, pero en un futuro podemos agregar mas

const BaileysProvider = require('./baileys.provider');

const providerBaileys= new BaileysProvider();

function getWhatsAppProvider(nombre = 'BAILEYS') {

    switch (nombre) {

        case 'BAILEYS':
            return providerBaileys;

        default:
            throw new Error(
                `Proveedor WhatsApp no soportado: ${nombre}`
            );
    }
}

module.exports = {
    getWhatsAppProvider
};