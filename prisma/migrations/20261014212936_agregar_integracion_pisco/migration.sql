-- AlterTable
ALTER TABLE "mensajes" ADD COLUMN     "apiActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "apiPasswordEncrypted" VARCHAR(500),
ADD COLUMN     "apiUsername" VARCHAR(100);
