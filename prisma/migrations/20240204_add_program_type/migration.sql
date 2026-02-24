-- Add programType column to ZkosTransfer table
ALTER TABLE "ZkosTransfer" ADD COLUMN "programType" TEXT;

-- Create index for efficient filtering
CREATE INDEX "ZkosTransfer_programType_idx" ON "ZkosTransfer"("programType");
