/*
  Warnings:

  - You are about to drop the column `additionalDocuments` on the `doctors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "doctors" DROP COLUMN "additionalDocuments",
ADD COLUMN     "additionalFiles" JSONB,
ADD COLUMN     "resumePublicId" TEXT;
