-- 既存の全資格を「申請資格」（ユーザー申請由来）に統一する。
-- recordOrigin 追加時の既定値と整合させ、万一 ASSOCIATION_IMPORT のまま残っている行も申請側に寄せる。
UPDATE "Qualification" SET "recordOrigin" = 'USER_APPLICATION';
