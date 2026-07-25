-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "model_year",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "powertrain" TEXT;

