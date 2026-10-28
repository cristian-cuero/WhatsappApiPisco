/*
  Warnings:

  - You are about to drop the column `apiActivo` on the `mensajes` table. All the data in the column will be lost.
  - You are about to drop the column `apiPasswordEncrypted` on the `mensajes` table. All the data in the column will be lost.
  - You are about to drop the column `apiUsername` on the `mensajes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "mensajes" DROP COLUMN "apiActivo",
DROP COLUMN "apiPasswordEncrypted",
DROP COLUMN "apiUsername";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "apiActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "apiPasswordEncrypted" VARCHAR(500),
ADD COLUMN     "apiUsername" VARCHAR(100);
