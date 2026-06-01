-- Supabase: all public Prisma tables — RLS with no policies; revoke PostgREST roles.
-- One statement per table to avoid long-lived locks / deadlocks during migrate.

ALTER TABLE public."Association" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Association" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Association" FROM PUBLIC;

ALTER TABLE public."AssociationAdmin" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AssociationAdmin" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AssociationAdmin" FROM PUBLIC;

ALTER TABLE public."AssociationLicense" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AssociationLicense" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AssociationLicense" FROM PUBLIC;

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AuditLog" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AuditLog" FROM PUBLIC;

ALTER TABLE public."BankAccount" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."BankAccount" FROM anon, authenticated;
REVOKE ALL ON TABLE public."BankAccount" FROM PUBLIC;

ALTER TABLE public."Budget" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Budget" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Budget" FROM PUBLIC;

ALTER TABLE public."Club" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Club" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Club" FROM PUBLIC;

ALTER TABLE public."ClubActivityRecord" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubActivityRecord" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubActivityRecord" FROM PUBLIC;

ALTER TABLE public."ClubAnnouncement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubAnnouncement" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubAnnouncement" FROM PUBLIC;

ALTER TABLE public."ClubAnnualRegistration" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubAnnualRegistration" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubAnnualRegistration" FROM PUBLIC;

ALTER TABLE public."ClubCompetitionPrepaidIndividualSlot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubCompetitionPrepaidIndividualSlot" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubCompetitionPrepaidIndividualSlot" FROM PUBLIC;

ALTER TABLE public."ClubDues" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubDues" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubDues" FROM PUBLIC;

ALTER TABLE public."ClubFiscalYear" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubFiscalYear" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubFiscalYear" FROM PUBLIC;

ALTER TABLE public."ClubTypeApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ClubTypeApplication" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ClubTypeApplication" FROM PUBLIC;

ALTER TABLE public."Competition" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Competition" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Competition" FROM PUBLIC;

ALTER TABLE public."CompetitionAgeCategory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionAgeCategory" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionAgeCategory" FROM PUBLIC;

ALTER TABLE public."CompetitionAnnouncement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionAnnouncement" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionAnnouncement" FROM PUBLIC;

ALTER TABLE public."CompetitionAttachment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionAttachment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionAttachment" FROM PUBLIC;

ALTER TABLE public."CompetitionBalanceLine" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionBalanceLine" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionBalanceLine" FROM PUBLIC;

ALTER TABLE public."CompetitionDayCheckin" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionDayCheckin" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionDayCheckin" FROM PUBLIC;

ALTER TABLE public."CompetitionEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionEntry" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionEntry" FROM PUBLIC;

ALTER TABLE public."CompetitionEntryCsvExportRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionEntryCsvExportRequest" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionEntryCsvExportRequest" FROM PUBLIC;

ALTER TABLE public."CompetitionEntryPaymentIntentToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionEntryPaymentIntentToken" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionEntryPaymentIntentToken" FROM PUBLIC;

ALTER TABLE public."CompetitionGalleryPhoto" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionGalleryPhoto" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionGalleryPhoto" FROM PUBLIC;

ALTER TABLE public."CompetitionHeatMarshalState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionHeatMarshalState" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionHeatMarshalState" FROM PUBLIC;

ALTER TABLE public."CompetitionHeatResultCaptureEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionHeatResultCaptureEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionHeatResultCaptureEvent" FROM PUBLIC;

ALTER TABLE public."CompetitionOfficialApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionOfficialApplication" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionOfficialApplication" FROM PUBLIC;

ALTER TABLE public."CompetitionOfficialAttendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionOfficialAttendance" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionOfficialAttendance" FROM PUBLIC;

ALTER TABLE public."CompetitionParticipantStatus" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionParticipantStatus" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionParticipantStatus" FROM PUBLIC;

ALTER TABLE public."CompetitionRecorderAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionRecorderAssignment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionRecorderAssignment" FROM PUBLIC;

ALTER TABLE public."CompetitionResultDraft" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionResultDraft" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionResultDraft" FROM PUBLIC;

ALTER TABLE public."CompetitionResultDraftRow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionResultDraftRow" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionResultDraftRow" FROM PUBLIC;

ALTER TABLE public."CompetitionScheduleTab" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionScheduleTab" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionScheduleTab" FROM PUBLIC;

ALTER TABLE public."CompetitionStartListSnapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionStartListSnapshot" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionStartListSnapshot" FROM PUBLIC;

ALTER TABLE public."CompetitionTechnicalOfficialAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionTechnicalOfficialAssignment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionTechnicalOfficialAssignment" FROM PUBLIC;

ALTER TABLE public."CompetitionTechnicalOfficialInvitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionTechnicalOfficialInvitation" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionTechnicalOfficialInvitation" FROM PUBLIC;

ALTER TABLE public."CompetitionTypeApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionTypeApplication" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionTypeApplication" FROM PUBLIC;

ALTER TABLE public."CompetitionUnpaidEntryIntentCampaign" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompetitionUnpaidEntryIntentCampaign" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CompetitionUnpaidEntryIntentCampaign" FROM PUBLIC;

ALTER TABLE public."DayOpsHeatOperationDraft" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DayOpsHeatOperationDraft" FROM anon, authenticated;
REVOKE ALL ON TABLE public."DayOpsHeatOperationDraft" FROM PUBLIC;

ALTER TABLE public."Delegation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Delegation" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Delegation" FROM PUBLIC;

ALTER TABLE public."DeviceToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeviceToken" FROM anon, authenticated;
REVOKE ALL ON TABLE public."DeviceToken" FROM PUBLIC;

ALTER TABLE public."EntryCheckoutSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."EntryCheckoutSession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."EntryCheckoutSession" FROM PUBLIC;

ALTER TABLE public."EntryItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."EntryItem" FROM anon, authenticated;
REVOKE ALL ON TABLE public."EntryItem" FROM PUBLIC;

ALTER TABLE public."EntrySnapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."EntrySnapshot" FROM anon, authenticated;
REVOKE ALL ON TABLE public."EntrySnapshot" FROM PUBLIC;

ALTER TABLE public."Event" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Event" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Event" FROM PUBLIC;

ALTER TABLE public."Expense" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Expense" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Expense" FROM PUBLIC;

ALTER TABLE public."ExpenseAttachment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ExpenseAttachment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ExpenseAttachment" FROM PUBLIC;

ALTER TABLE public."LoginSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LoginSession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."LoginSession" FROM PUBLIC;

ALTER TABLE public."LoginThrottleBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LoginThrottleBucket" FROM anon, authenticated;
REVOKE ALL ON TABLE public."LoginThrottleBucket" FROM PUBLIC;

ALTER TABLE public."Membership" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Membership" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Membership" FROM PUBLIC;

ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Notification" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Notification" FROM PUBLIC;

ALTER TABLE public."NotificationJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."NotificationJob" FROM anon, authenticated;
REVOKE ALL ON TABLE public."NotificationJob" FROM PUBLIC;

ALTER TABLE public."NotificationTemplate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."NotificationTemplate" FROM anon, authenticated;
REVOKE ALL ON TABLE public."NotificationTemplate" FROM PUBLIC;

ALTER TABLE public."OfficialResult" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."OfficialResult" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OfficialResult" FROM PUBLIC;

ALTER TABLE public."OfficialResultHeatConfirmed" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."OfficialResultHeatConfirmed" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OfficialResultHeatConfirmed" FROM PUBLIC;

ALTER TABLE public."OfficialResultRow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."OfficialResultRow" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OfficialResultRow" FROM PUBLIC;

ALTER TABLE public."OrgAdmin" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."OrgAdmin" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OrgAdmin" FROM PUBLIC;

ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Organization" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Organization" FROM PUBLIC;

ALTER TABLE public."OrganizationAdminInvitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."OrganizationAdminInvitation" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OrganizationAdminInvitation" FROM PUBLIC;

ALTER TABLE public."PasskeyChallenge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PasskeyChallenge" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PasskeyChallenge" FROM PUBLIC;

ALTER TABLE public."PasskeyCredential" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PasskeyCredential" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PasskeyCredential" FROM PUBLIC;

ALTER TABLE public."PasswordResetToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PasswordResetToken" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PasswordResetToken" FROM PUBLIC;

ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Payment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Payment" FROM PUBLIC;

ALTER TABLE public."PublicApiKey" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PublicApiKey" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PublicApiKey" FROM PUBLIC;

ALTER TABLE public."Qualification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Qualification" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Qualification" FROM PUBLIC;

ALTER TABLE public."QualificationCategory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."QualificationCategory" FROM anon, authenticated;
REVOKE ALL ON TABLE public."QualificationCategory" FROM PUBLIC;

ALTER TABLE public."QualificationHistory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."QualificationHistory" FROM anon, authenticated;
REVOKE ALL ON TABLE public."QualificationHistory" FROM PUBLIC;

ALTER TABLE public."QualificationTemplate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."QualificationTemplate" FROM anon, authenticated;
REVOKE ALL ON TABLE public."QualificationTemplate" FROM PUBLIC;

ALTER TABLE public."RegistrationSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."RegistrationSession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."RegistrationSession" FROM PUBLIC;

ALTER TABLE public."StripeEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."StripeEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE public."StripeEvent" FROM PUBLIC;

ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Subscription" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Subscription" FROM PUBLIC;

ALTER TABLE public."TeamEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."TeamEntry" FROM anon, authenticated;
REVOKE ALL ON TABLE public."TeamEntry" FROM PUBLIC;

ALTER TABLE public."TeamEntryMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."TeamEntryMember" FROM anon, authenticated;
REVOKE ALL ON TABLE public."TeamEntryMember" FROM PUBLIC;

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."User" FROM anon, authenticated;
REVOKE ALL ON TABLE public."User" FROM PUBLIC;

ALTER TABLE public."UserAddress" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserAddress" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserAddress" FROM PUBLIC;

ALTER TABLE public."UserContact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserContact" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserContact" FROM PUBLIC;

ALTER TABLE public."UserEmergencyContact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserEmergencyContact" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserEmergencyContact" FROM PUBLIC;

ALTER TABLE public."UserJlaProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserJlaProfile" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserJlaProfile" FROM PUBLIC;

ALTER TABLE public."UserLoginEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserLoginEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserLoginEvent" FROM PUBLIC;

ALTER TABLE public."UserNfcTag" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserNfcTag" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserNfcTag" FROM PUBLIC;

ALTER TABLE public."UserProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserProfile" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserProfile" FROM PUBLIC;

ALTER TABLE public."UserSecurity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserSecurity" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserSecurity" FROM PUBLIC;

