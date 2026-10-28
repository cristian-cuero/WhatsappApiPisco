
require("dotenv").config();

const { consultarGroq } = require("./services/ia.service");

async function probar() {
    const tenantId = 1; // Usa el ID real de tu tenant

    const historial = [
        { role: "user", content: "1" },
        {
            role: "assistant",
            content: "Para consultar tu contrato, por favor indícame tu número de cédula.",
        },
    ];

    const respuesta = await consultarGroq({
        tenantId,
        mensaje: "1116275562", // Reemplaza por una cédula de prueba autorizada
        historial,
    });

    console.log("\nRespuesta de la IA:\n");
    console.log(respuesta);
}

probar().catch((error) => {
    console.error("Error en la prueba:", error.message);
});
