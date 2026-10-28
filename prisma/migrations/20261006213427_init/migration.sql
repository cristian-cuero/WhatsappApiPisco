-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "usuario" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(150),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sesiones" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(30),
    "provider" VARCHAR(30) NOT NULL DEFAULT 'BAILEYS',
    "estado" VARCHAR(30) NOT NULL DEFAULT 'CREANDO',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaConexion" TIMESTAMP(3),
    "tenantId" INTEGER NOT NULL,

    CONSTRAINT "whatsapp_sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_codigo_key" ON "tenants"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- CreateIndex
CREATE INDEX "usuarios_tenantId_idx" ON "usuarios"("tenantId");

-- CreateIndex
CREATE INDEX "whatsapp_sesiones_tenantId_idx" ON "whatsapp_sesiones"("tenantId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sesiones" ADD CONSTRAINT "whatsapp_sesiones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
