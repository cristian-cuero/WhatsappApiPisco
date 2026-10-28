-- CreateTable
CREATE TABLE "mensajes" (
    "id" SERIAL NOT NULL,
    "messageId" VARCHAR(150),
    "direccion" VARCHAR(20) NOT NULL,
    "tipo" VARCHAR(30) NOT NULL DEFAULT 'TEXT',
    "contenido" TEXT,
    "fechaMensaje" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversacionId" INTEGER NOT NULL,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" SERIAL NOT NULL,
    "telefono" VARCHAR(30) NOT NULL,
    "nombreContacto" VARCHAR(150),
    "estado" VARCHAR(30) NOT NULL DEFAULT 'ABIERTA',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensajes_conversacionId_idx" ON "mensajes"("conversacionId");

-- CreateIndex
CREATE INDEX "mensajes_messageId_idx" ON "mensajes"("messageId");

-- CreateIndex
CREATE INDEX "conversaciones_tenantId_idx" ON "conversaciones"("tenantId");

-- CreateIndex
CREATE INDEX "conversaciones_sessionId_idx" ON "conversaciones"("sessionId");

-- CreateIndex
CREATE INDEX "conversaciones_telefono_idx" ON "conversaciones"("telefono");

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "whatsapp_sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
