-- Instagram addresses the same professional account by two different ids: the
-- account id Graph uses, and an app-scoped id that appears in messaging
-- webhooks and that Graph cannot resolve. Recording the second one lets an
-- incoming event be matched to the account it belongs to.

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN "messagingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_messagingId_key" ON "InstagramAccount"("messagingId");
