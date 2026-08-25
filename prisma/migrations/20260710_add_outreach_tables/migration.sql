-- OutreachCampaign table
DO $$ BEGIN
  CREATE TABLE "OutreachCampaign" (
      "id" TEXT NOT NULL,
      "businessId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "totalLeads" INTEGER NOT NULL DEFAULT 0,
      "sent" INTEGER NOT NULL DEFAULT 0,
      "delivered" INTEGER NOT NULL DEFAULT 0,
      "replied" INTEGER NOT NULL DEFAULT 0,
      "clicked" INTEGER NOT NULL DEFAULT 0,
      "template" TEXT NOT NULL,
      "followUpRules" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_table THEN
  RAISE NOTICE 'Table OutreachCampaign already exists, skipping';
END $$;

-- OutreachLog table
DO $$ BEGIN
  CREATE TABLE "OutreachLog" (
      "id" TEXT NOT NULL,
      "campaignId" TEXT NOT NULL,
      "contactId" TEXT NOT NULL,
      "businessId" TEXT NOT NULL,
      "messageType" TEXT NOT NULL DEFAULT 'initial',
      "message" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "whatsappMsgId" TEXT,
      "sentAt" TIMESTAMP(3),
      "deliveredAt" TIMESTAMP(3),
      "readAt" TIMESTAMP(3),
      "repliedAt" TIMESTAMP(3),
      "replyContent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OutreachLog_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_table THEN
  RAISE NOTICE 'Table OutreachLog already exists, skipping';
END $$;

-- CreateIndex (safe — IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "OutreachCampaign_businessId_idx" ON "OutreachCampaign"("businessId");
CREATE INDEX IF NOT EXISTS "OutreachCampaign_status_idx" ON "OutreachCampaign"("status");
CREATE INDEX IF NOT EXISTS "OutreachLog_campaignId_idx" ON "OutreachLog"("campaignId");
CREATE INDEX IF NOT EXISTS "OutreachLog_contactId_idx" ON "OutreachLog"("contactId");
CREATE INDEX IF NOT EXISTS "OutreachLog_businessId_idx" ON "OutreachLog"("businessId");

-- AddForeignKey (safe — only if constraint doesn't exist)
DO $$ BEGIN
  ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'FK OutreachCampaign_businessId_fkey already exists';
END $$;

DO $$ BEGIN
  ALTER TABLE "OutreachLog" ADD CONSTRAINT "OutreachLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'FK OutreachLog_businessId_fkey already exists';
END $$;

DO $$ BEGIN
  ALTER TABLE "OutreachLog" ADD CONSTRAINT "OutreachLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'FK OutreachLog_campaignId_fkey already exists';
END $$;

DO $$ BEGIN
  ALTER TABLE "OutreachLog" ADD CONSTRAINT "OutreachLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'FK OutreachLog_contactId_fkey already exists';
END $$;
