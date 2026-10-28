-- AlterTable
ALTER TABLE "conversaciones" ADD COLUMN     "fechaCierre" TIMESTAMP(3),
ADD COLUMN     "intentosInvalidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "motivoCierre" VARCHAR(50);

-- AlterTable
ALTER TABLE "whatsapp_sesiones" ADD COLUMN     "intentosInvalidos" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "mensajeBienvenida" TEXT,
ADD COLUMN     "mensajeDespedida" TEXT,
ADD COLUMN     "timeoutConversacion" INTEGER NOT NULL DEFAULT 2;

-- CreateIndex
CREATE INDEX "conversaciones_estado_idx" ON "conversaciones"("estado");
