
function normalizarTexto(texto = "") {
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!,.;]/g, "")
    .replace(/\s+/g, " ");
}

function detectarIntencionPago(texto = "") {
  const textoNormalizado = normalizarTexto(texto);

  const opcionesPago = [
    "4",
    "pagar",
    "pago",
    "pagos",
    "quiero pagar",
    "deseo pagar",
    "hacer pago",
    "hacer un pago",
    "realizar pago",
    "realizar un pago",
    "voy a pagar",
    "necesito pagar",
    "abonar",
    "quiero abonar"
  ];

  return opcionesPago.includes(textoNormalizado);
}

module.exports = {
  normalizarTexto,
  detectarIntencionPago
};
