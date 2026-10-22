-- AlterTable
ALTER TABLE "Hand" ADD COLUMN     "dealt" JSONB;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "scores" JSONB;

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "botAvatarId" TEXT,
ADD COLUMN     "botNickname" TEXT,
ADD COLUMN     "ratingBefore" INTEGER;
