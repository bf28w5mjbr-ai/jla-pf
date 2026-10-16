-- AlterEnum
-- QualificationHistoryChangeType に CONFIRMATION_INVALIDATED を追加する。
-- 同一トランザクション内でこの値を DML に使えないため、列追加は次の migration に分離する。
ALTER TYPE "QualificationHistoryChangeType" ADD VALUE 'CONFIRMATION_INVALIDATED';
