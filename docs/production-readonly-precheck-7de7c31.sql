-- =============================================================================
-- PR #44 本番読取確認（Supabase SQL Editor 用）
-- 期待値: public/qualification-hotfix-and-ci（県協会 migration 取り込み後・142 本）
-- 本番 projectRef（ユーザー確認済み）: nutoyobtteitrptxcmsa
--
-- 判定方針:
--   - 正常完了: finished_at IS NOT NULL AND rolled_back_at IS NULL → checksum 照合
--   - 取消済み: rolled_back_at IS NOT NULL → 別集計（正常完了の照合対象外）
--   - 未解決失敗: finished_at IS NULL AND rolled_back_at IS NULL → 停止
--   - ゲート OK: 完了一致 140 / 未適用が資格 Hotfix 2 本のみ / 未解決 0 / DBのみ完了 0
--
-- 使い方:
--   1. Supabase Dashboard で projectRef=nutoyobtteitrptxcmsa を開く
--   2. SQL Editor に本スクリプト全体を貼り付けて Run
--   3. 返る1表（section / item / value / note）を共有（秘密値・個人情報は貼らない）
-- =============================================================================

BEGIN READ ONLY;

WITH expected(
  migration_name,
  expected_checksum,
  expect_unapplied
) AS (
  VALUES
  ('20260115062340_init', '85dd8f247f086a691aa005fd388637fa9eff951a269658f7788b2218016b3888', false),
  ('20260115064857_add_duplicate_prevention_fields', 'c3a9a2ef1aeba3cbaa730b6bebf4ca03a4129e7df19d81802ff2e5a073dccfb1', false),
  ('20260115070019_add_sms_registration', 'c9ed1dd2e9b29e9de1932cdeb30bf306a33b645a9b8c7db0f9881ac17de2efe1', false),
  ('20260115071138_add_sex_field', 'fa460b087397f4236f3ede4220ca58f1347bcdc48c7046dc54a9eb90391c1200', false),
  ('20260115132229_add_profile_photo_url', 'b2d66014dd65e53e294bdf9be96c05b2ea3aecb5c31dde4e908ddceb1ca242d3', false),
  ('20260115164504_add_login_session', 'b82c2596422ac854f45d6d6624798d96b49374efa2c586ef6e676158a3b962e1', false),
  ('20260115201555_add_password_to_registration_session', '39665b2d5fe4d5d82c774ab9e5dd884acd924a006008b14ec00edca4f22d9913', false),
  ('20260118082128_add_competition_announcements_and_attachments', 'c1e6052af01b7beba735fec6b379dacc1b865b3b941b06ce8d1f5e0c186a542b', false),
  ('20260118082702_add_emergency_contact_to_registration_session', 'bd21350fc88310e635fca430eb4fc6b0dd858641cc5a6184399ebf9b15c1a5cc', false),
  ('20260118104936_add_competition_events', '4b075ed8cf63d4cb450bf6aeeb3f913a67e9713ea7116c4cabd692df81b20f0b', false),
  ('20260118110707_add_event_type', 'beeae15a427322bd0d0e2e3bfeb62fd6f6598b9bbec455e25cd56793408ab513', false),
  ('20260118111440_add_event_category', '836ae6972a73ce269fa60f9a0e03ea7cd56fbde37549e1bbef5dbd30424b0487', false),
  ('20260118231733_change_entry_fee_to_json', 'eac446f1d6890de1ce1be0a633ba5b6a391607e012dcc805bb4e32f15a75c94d', false),
  ('20260119101540_add_official_positions_to_competition', '680effab7dc9bc8d7f571a7ede1f9ed7e034c5761c50cfa54167eb569825fb2a', false),
  ('20260119101652_add_official_positions_to_competition', '122d743a0403e77ad7e0ed9447f5b8826f2fbdbc55612d936eff004dd13c2eec', false),
  ('20260205044813', 'd2a23dc38f0d1c12f1e31e621375ea5705b307501ef752e992d19361d80c88f4', false),
  ('20260205090000_add_club_dues_models', 'c9a610b725ad9c73167dfc2fe7080f3f48049f74539e0c0eff2da3ff5889cdd0', false),
  ('20260205093000_add_dues_document_urls', '0c6018268229ad5c70705469ad8bc5539182b4fed71f844bd4a96c8ecea4aa95', false),
  ('20260205110316_add_stripe_events', '79fd42b01a3e1e8f50ad6d174694a9862422ab9adec8f3fb994d85517d85ab9d', false),
  ('20260205120647_add_passkey_credentials', '43f4a5af6c76800055422b9261d24ed9500338bc49c4692757ea368f1a420e56', false),
  ('20260205125203_add_passkey_metadata', 'f8c3c183b01c575956b603ed8ce8190ca83fa76a1ec15742cc1893e082652199', false),
  ('20260224090000_add_require_club_membership', '5dfcad440d9ee6e50a8c564c0cc7dad3c7fbd50fd13ca113f29d299f4b12072e', false),
  ('20260224090000_add_required_qualifications_to_competition', 'a9c06a418bcc7da270da92d7de44c3d3090cb8f68f6468a9a76bf7a3ab970662', false),
  ('20260224093000_add_participant_eligibility_to_competition', '95db387cb3481d30d9bd76156e4d8617d970ea97eb5d1b89416179b4099e84e8', false),
  ('20260224140934_add_allow_multiple_event_entries', '04bd6fe6e4d80cd4b2aeadf295bf96ab8f349c14499c59b33403bdf7f5ffab10', false),
  ('20260224141946_add_age_constraints_to_competition_and_event', '17699e835ed9d516c48906ee7a93d99a4a605690bcd4d250efafb9ff511f7fbb', false),
  ('20260225090000_add_start_list_settings', '5ce058104a8047d7fb3fe04335676fecfa8b24e5105ee6234bfe0df3ec8c3391', false),
  ('20260303080712_remove_annual_fee', '745447073923f66c5463523dd2c239709320ed61e6bd07bfe010379d15648214', false),
  ('20260306013000_shadow_placeholder_association_tables', 'b7923da5e07ca32b73a43db974cce4fbe675e0d8c594b49aecc29f86eea3bcf2', false),
  ('20260306013815_reconcile_association_schema', '4a90c2c2b00394b6997b248581c0c241253c2a8cdc05fef850f51f04e7f9bba0', false),
  ('20260306020000_cleanup_shadow_placeholder_association_tables', '1a38f9aadb42430bd3152e8b147bc91e830b419f41693a6aa2472c66673e3b10', false),
  ('20260306021000_recreate_shadow_placeholder_before_name3', 'e71f729609c1f911902af78a77f091f20e25adb13efd305a5b7aaaf3b30aaae7', false),
  ('20260306025631_name3', '4a90c2c2b00394b6997b248581c0c241253c2a8cdc05fef850f51f04e7f9bba0', false),
  ('20260306030000_cleanup_shadow_placeholder_before_owner_to_admin', 'fde23e22aee8715475e16716783330dd052cdb1e66737cc1dbd1d3c5e9e823fd', false),
  ('20260306093000_owner_to_admin', '0be7d86c04d546cbdae0b2c9c59db0137bf9a72b24b7dc60924c3748dd0090e5', false),
  ('20260306113000_drop_owner_from_roles', 'd141e00770b2e6771a9e3ad1cf811f185f25ddbb0cdd2b4966d9ea93b194f280', false),
  ('20260306122000_rename_jla_admin_to_acc_admin', '0466a3b3195af1025fc044149909e4a19163f90b6c9351ceba7cfc029749bc63', false),
  ('20260306130000_add_association_admin_scope_and_remove_acc_admin_role', '0547ca1274d54e404e7f83d6d346cc449514ff09a31f0f11ea5f65179e37b780', false),
  ('20260306134000_add_association_status', '3a6328b83f0f7d8e3e5b5a32258b15c83a5a91519fe207684a56655989c8d706', false),
  ('20260306150000_restore_association_updatedat_defaults', 'de1724dc8a11d8a6c1f74a57c2c9d51635ee82518ec20869ffb7e65876dafeb5', false),
  ('20260306151000_drop_association_updatedat_defaults_for_schema_alignment', 'f59dd787e32e72c3a711c6375cf26955fe5e9e304a117410b0e75a258fd2023b', false),
  ('20260318093000_add_club_abbreviation', '19ae54419aa65f59fcf65df8c7df1fe609ef1a7c518f7aa26464a49b5d5c774d', false),
  ('20260318103000_add_association_case_insensitive_uniqueness', '81815f5038ae30d3f7be333629da099f39cfd8ca5b7bd88bd060632f40a07888', false),
  ('20260319061455_add_registration_session_jla_member_number', 'e4a1ed50ec4548f579413dd5156d76e9c7774ae2185cb90c41301c4cc7ac06ac', false),
  ('20260319063509_drop_registration_session_jla_member_number', '3f934d67ee79783fa15822a747fe3b0c62ce65cb701b9295ab6392192190cbf6', false),
  ('20260321120000_add_competition_host_organization_snapshot', '428046accbf8fe065e349d1edea69c94db423c43e277bc0d492f9ce832545c29', false),
  ('20260321140000_add_club_is_lifesaving', '44a89e24fc12f86f95745aa6bb2801348281791094dfc5887346f8cc7aea05e6', false),
  ('20260324120000_add_day_ops_models', '8d9fc918222b2316854649ed634885944d2544fc2944a98a05acf1e8d55ee1a1', false),
  ('20260324130945_add_device_token_for_mobile_push', '3ec18fe44caeb14cb7db1c57a36df352076f89f0059175b09428077e9b55da56', false),
  ('20260324133000_add_start_list_snapshot', '8ee1f8f71f6a323511348add0afd2e5867aa14cfe2659449c06e9a59c73d7c5b', false),
  ('20260325120000_add_max_event_entries_per_person', '4d91b31bbe9bbd53a39ac1ec4f4f6451e5cf9b385beb246520646e689e418fed', false),
  ('20260326120000_add_competition_balance_line', 'dcb214a10106cd4a018d27ade2f3951e86d9f27311313becd37c177fcfa22bd3', false),
  ('20260326180000_add_competition_official_application', '9e82c98f64715399df5b457a30c31d1a2001af3f7c65f1de23f87f878ce77c16', false),
  ('20260327120000_add_entry_checkout_stripe_receipt_url', 'e10b8ca20400e98239bb8f521a7cfc42d0e294b011bf9debfb2e9282ce2fd743', false),
  ('20260328120000_add_event_schedule_times', '967a514d98030d85167b3d7df3e287284e67ffb952d60f77e7eae6186b50ba3d', false),
  ('20260329140000_login_throttle_and_last_login', '184a28d0ec79ad31f2fcfaa3e8ba2be3bba46a1a239cc192e0a27c07cbe4b3ca', false),
  ('20260329160000_auditlog_login_index', '55c1f16ffb088d4dd37985f107fe8d7030508ff31f3ecac82c255b5643876c82', false),
  ('20260329180000_add_competition_gallery_photos', 'f82ae5793a1ec3675c0ad051fc337d4b43314d06b8352525f5f0cdbe3b11591a', false),
  ('20260329190000_add_event_preliminary_heat_lane_count', '7ea482f30e1ad35b6944386edce430b1a9a2ff66ba26250ced8e3e8cc568aca4', false),
  ('20260330120000_add_event_start_list_round_count', '67b986997301dcab9deb692dffc892affa706fd14c32c34fc41f238e06dcbf92', false),
  ('20260402120000_event_heat_plan_marshal_gates', '8c5b1d4e00adf37eab030044c80d23f792e0c32fd7257fb3ad1638db235f7c68', false),
  ('20260402120000_official_result_heat_confirmed', 'a2031e7d1c0e0dcfc0990245a18a3c4f3cfeb6cf037ec0839763cc64822b4a6c', false),
  ('20260402140000_competition_heat_marshal_state', 'f15b57cd0e6edf9630290026ccf8f50067332464f707102f4d13082598ab3a6d', false),
  ('20260403120000_add_event_team_relay_positions', '1a1748ffa05cfa59fefbe519a57a4a96b699dac07bd8813722266efc8ddfbfc1', false),
  ('20260403140000_participant_status_marshal_round', 'd564c684e7ed16be96be9f0818ffd0d3742ac668bcac1819f7eab08fd1c0f133', false),
  ('20260403235823_team_relay_positions', '1fa79151e2da09436ffdd6cea4ce8554737c73144841d6a564d03fe4a9e9c79f', false),
  ('20260404120000_team_marshal_per_member', '675245a148c1c8bdff654e833770da2d7116bf882ad6a3247e9d06018aac0434', false),
  ('20260404183000_add_competition_entry_csv_export_request', '624c9a8a2dfafe3b4ab5f718957508baae445fc72d5a2383778c96acfea1bf45', false),
  ('20260406120000_add_entry_pledge', '8a1281aae2c753dee2872710677fd7cfbe5749644256403e3a2bcf7b6ee10f65', false),
  ('20260406120000_club_competition_participation', '5cbffe4c2d93700b5092ae9104ccd20ae156bf7b372439db647684b6a8e77e97', false),
  ('20260406140000_drop_club_competition_participation', '27bcee15beb2789d692668a9441c96a2eda139ba27b21c85a90024afac62c09d', false),
  ('20260406140000_technical_official', 'd1bf52ec5295d253b03200610edd869569c54bf056640a9ad630998aad289eaf', false),
  ('20260408130000_add_result_capture_event_log', '52aa1484d196168c2cb85275e837fbe1e0e5efcb2a03131f60757dba5f4d5974', false),
  ('20260408133000_add_official_result_row_tie_group', '05083e90fd4e638a73e63711678fcbdd0c5c391e49f3b8a27407a8e473a9638f', false),
  ('20260408170000_add_competition_type_application', 'ca4df55d147642456345638671cc9dbf0a8e518b4c76e3e086bc040870502afe', false),
  ('20260408195000_add_qualification_template_hierarchy_fields', '1b77fcd920d54d1a2698b2164f8d6e2f126a5f3dbd158cbf2c517299ff76cbf7', false),
  ('20260409004947_migration2026_4_9', 'b16e87e8b0370612246b92f8d50a98656ba3ae7e2425513c347ec83bc304b0af', false),
  ('20260409070000_add_official_qualification_filter_flag', '0bfd957a3a24c7907234f72b4d45d71f8d82f7ed0ea6c8a35f7006c9c02a79d0', false),
  ('20260409073000_add_official_recruitment_enabled', '3e69e5bd60fd01d765d77acea2898657b854fd6cf110516cd3821b714c02fe18', false),
  ('20260409082000_add_technical_official_recruitment_enabled', 'eadcee3bb10fc81c4c38d09795477f7edf5d194cbedc02b6bb470ce6b6be6286', false),
  ('20260409110000_competition_type_ab_and_official_attendance', 'f9f6290db0e9df886ba31aee09e5c06b7ae9c0a0b0fd5f5f2b345b1e8c9e6249', false),
  ('20260409130651_competition_type_ab_and_official_attendance', 'e9b4e4a1bdbddc37ea6bd9c62749a9deab410b091c0d97f9568ccbc0dcb917b6', false),
  ('20260410043537_add_query_performance_indexes', 'd18c2746b71421177af7cdc107b2ae55baf1900e5bbf65bc79385a3d215f5a57', false),
  ('20260410044724_add_competition_day_ops_secret', 'e1cd245aabbd65e15e3c00c788086f997ac03154d48f92593f3e064748a2e649', false),
  ('20260410152321_organizer_stripe_connect_and_subscription', '6d02d5b1c53dff7133d8c9fcd70d552dde6124ab3b64877a7da3760bf2f34dc9', false),
  ('20260411120000_registration_otp_delivery', 'def3ed5b04c9adf5f54e2e83ccf6326da5282a53a3f12340f7e1db46fe7d0509', false),
  ('20260411161521_competition_age_categories', '74c33a521672b7d43462411d4d1f400f00fb26e5d3c2d555e647785d6d35e0b2', false),
  ('20260412140000_event_eligible_birth_date_range', '77085e924d5a95fccf744cbc97769a315be184aa74a0ccde14f93dce85e0dbae', false),
  ('20260412160000_backfill_event_category_ocean_only_competitions', '18a6525bf3c937eec537320440563d17b3d0bf61e8978e8629b4f2276d937d71', false),
  ('20260412180000_add_event_max_team_entries_per_club', '230f02346617bd6eed50a35f2c877e6ecad1c092bdf8db71b33da4d1f538ee06', false),
  ('20260412224542_competition_under_age_columns', 'fb36342e803bb21dceb510e37bb1c2564799fe4568bddd178d103f94f3022097', false),
  ('20260413080000_competition_under_age_system_enabled', '942a9c87da693a0aeb38134db01bee06e693427008e9ed968ce320102ca1dd5d', false),
  ('20260413143000_entry_checkout_dispute_tracking', 'd72efeb73d5d16990f4258c918229950ac6ccae7146ba3d0ffb9fe92807c4ffb', false),
  ('20260413160000_payment_stripe_dispute_id', 'dcda04a07092581fab32eef2ea6cf00839314326d74efe0d9c0e3ec501e3bd83', false),
  ('20260413190000_user_phone_nonunique_login_session_purpose', 'cfc0564fc71e816e0c3d58c6ef5874d3a6fd85a26756d030ed304025dd2af377', false),
  ('20260414103000_backfill_under_age_system_existing_competitions', '73793faca34281d64232a2a805303759442328e31462347af8331a2fd3d8b8a4', false),
  ('20260415120000_under_band_keys_age_category_and_event', 'cc828e3c1d43a8bc3f0777ef93542db63b755946579ecc21e4a05dcfd4d3225c', false),
  ('20260415140000_approve_pending_memberships_and_qualifications', 'd8b73bffb381c051400acd29c1fbf65090412050a52d5e8c6a58effcf64b67e3', false),
  ('20260415190000_password_reset_token', 'ddd033caabbf9238165da18f128acb88c021f9c1e91aee4b05d6cefb35e152e7', false),
  ('20260416120000_club_prepaid_individual_slots', '570fff426f2cf0ca651e6367d0dc12148940f65c6ea6addc74e6cf404147b8f0', false),
  ('20260417103000_club_announcement_published_at', '6341c45288b75156468d1a6b5ddcb698da400cf0f12e2c94c7f345f93a148b59', false),
  ('20260419120000_official_application_auto_approve_backfill', '6b63ab141538e661711a8ddfdbd7b59c4967893322ac0589fac2b8d4454d6533', false),
  ('20260423150000_fix_bls_misassigned_qualifications_and_unique_template_kind', '4bce70c996561c135858c22ec1f62bc3468abc90330757ced9cc9fcbf10a1ad2', false),
  ('20260430002338_add_qualification_record_origin', 'd487cdf39b2cdeb7f1014daff22873b207646d4cf5b52aeb3719bd64ca25954b', false),
  ('20260430103000_backfill_qualifications_user_application', 'db78f354a5c72d6989904a349726973d45df1ba81896f27ebb3e6c937806e9e5', false),
  ('20260501123000_day_ops_heat_operation_draft', 'e2d237a32f7282ba7cc06dd64896995fbe77f1eb773016be95c16ddbba9637b5', false),
  ('20260505170000_add_competition_stripe_settlement_account_type', '2ab93993b224918fb9975386cdddc56452a221ab5b93095b57cc8df51bfd6e82', false),
  ('20260513120000_drop_under_age_band_fields', 'c44c20b04c5129458e87338d0d4c013862840ff757b51f19e548da66d88f1b5f', false),
  ('20260513180000_competition_start_list_publicly_visible', '6cebd2a82294065bcf5bb8b139d3abf4cdf95a83d5d502d4d071b42538d91c38', false),
  ('20260513200000_merge_competition_schedule_tabs_to_main', '44584e9b94ca5773a59ad428ec207b82fa6188b5e754b99e29f94a8b4ffdaf21', false),
  ('20260513210000_event_round_scheduled_starts', 'c9560eb9b46352422fb9c9c8e7f3c83c7a92a8503a1dedb03c4e3dde0607b0a6', false),
  ('20260514010847_competition_schedule_tabs', 'f27d66d90f9b76d8a2c92278376114f623556fbbc29a39c2a8f2368052d3d23b', false),
  ('20260519104500_user_extension_tables', '2a98efe7a9a05cf08e47af3a1989680993f8196986ed3d261a26bb60706ce4f9', false),
  ('20260519111500_merge_legacy_jla_member_number', '1a76b9c28c65175fd152c3b3d27abcaa3839627e8c2e669c1e71b403f01e0890', false),
  ('20260519113800_qualification_template_history', '2fe2566fd250f81d22a792fb83130b6c3429949873d7dca4edc1359fa1bb9dbf', false),
  ('20260519120000_user_security_and_login_events', '4fafb5923c31aef110ea24d044585b6b4fd9cbceca35de6ae480978e8b5cf224', false),
  ('20260519120100_cleanup_qualification_template_descriptions', '84ab5e15a73c0eba3f29dbd9be724b2fe2184428faddd8d854330f60ff950f28', false),
  ('20260520120000_club_status_operational_consolidation', 'ca36628f1974d13d1f8c3875c71f4c4babf161c336eb795b99537b861a9bd6ab', false),
  ('20260520140000_organizer_lifecycle_and_admin_invitations', 'ad835a9f93323e7a3dc9041be80fedfb4e983efe48bf756844b5c7df5fec2361', false),
  ('20260524120000_competition_schedule_tab_row_order', 'dfeb69ff4711909fd70abbca482e8bc637f6e5c4f981aaa517b3f767bea132dc', false),
  ('20260524140000_fix_user_legacy_column_drop', '7544dc2b8ca98f608431d72d3b4f7541b5cde29e75fdeb803228d88519eb7e8f', false),
  ('20260526120000_official_result_row_advance_without_rank', '57541319df705e4514d5b39f9d1c14a8e80e3fc54b17eaaec7756208ad87d777', false),
  ('20260526130000_prisma_migrations_rls', 'bffe986d5d56afbbb670d40b9f0aaecb38ebc79133e2e4d6780d03480eee2f89', false),
  ('20260528120500_remove_org_member_role', 'eaf26a64082a0b6af38e1cded79b7a3c15cf93f858b0e96ec94b5e683459303f', false),
  ('20260528130000_organizer_post_pay_entry_fields', '3c5d9d51bb211719b3ae53aa611fdf63ccc667bc7d19e407b66b15b85c0e9ea3', false),
  ('20260529120000_unpaid_entry_intent_campaign', 'ca86f6aaddf2f8aa03069db1c5e0be742fcacd841e87132055cac9d8cfaba662', false),
  ('20260529140000_payment_intent_deadline_dns_flag', '90cd62d38d4c7e8a2176c23d8acf54cbc36fa42bec61d6a80e263235f26919b3', false),
  ('20260530120000_payment_intent_email_delivered', '9dd828e69599ce195a7c0bcd08d6f941f154c9d8bc90029315b2438dd59204db', false),
  ('20260601120000_membership_rls', 'e0eaa4197a15fe659b2e3e4cb67ed3c9c46ec3f0bbcd5fc28e2cbe94d7bb1a5c', false),
  ('20260601140000_public_schema_rls', '6a2db4f498a9734176973b2a0627e8981f926fe3a4989ecf4d840faa9d7c7d52', false),
  ('20260601180000_competition_entry_user_created_index', '239e1114364ee10f9f2efad59f27d30775ee24c8f6e02887b08ec9f09fff643a', false),
  ('20260601200000_approve_pending_memberships_auto_approve', 'f8c5f5d628793f00f4527834e0efbacdcedc46cad257b57f8f2e6bb551ce30c0', false),
  ('20260602120000_terminal_status_dnf_withdrawn', 'e8d55d2d441b0d94f629fc61ffede6161803b5e9c7d396bc88977b54f2b4137b', false),
  ('20260603120000_add_related_organizations', '54e976b0414977557109e8b47bb0079d986a80af8bb2bb271e4ef5fd9ddc852e', false),
  ('20260603130000_drop_legacy_relation_fields', '5e943a81d65550a2dd94aaa29b6d853cd8307f9e09043f6888f7914472b8a1b4', false),
  ('20260607120000_entry_checkout_session_club_id_optional', 'd1831961059238b685bc4008c91ae34ac35eb559175a7c4465245405415d2323', false),
  ('20260610120000_add_profile_photo_aspect_ratio', 'cd7e94f9ea1340e18e6da266e8e9a63866ed6824ea58e193633b5f67125b3bdc', false),
  ('20260610130000_add_profile_photo_subject_region', 'ec568d3b136617411bc63f3c867dd2b64f412c622de231fdf211418c0a87f030', false),
  ('20260610140000_add_prefectural_association', 'f0287930f15e76e96a005aa5d5e3c1c4c4c65075815a061f745dd067cfcdc2fb', false),
  ('20260623120000_event_allowed_age_category_ids', '8a7f6c44990b93fe7b8ecfc4cf3beee236b1f12c64ca23700ecaf361970d5d86', false),
  ('20261015120000_qualification_history_confirmation_invalidated', 'fd76f6b188472e2f8eb190faf00a3f103352d77e589a8c0ac60cfbdcfd735777', true),
  ('20261015120100_qualification_confirmation_columns', '5538eb64447fef8b7c4da3812a8f86cb59c2bdee8374bb9d3aac250c40728323', true)
),
db_completed AS (
  SELECT migration_name, checksum AS db_checksum, finished_at
  FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL
    AND rolled_back_at IS NULL
),
db_cancelled AS (
  SELECT migration_name, checksum AS db_checksum, finished_at, rolled_back_at
  FROM "_prisma_migrations"
  WHERE rolled_back_at IS NOT NULL
),
db_unresolved AS (
  SELECT migration_name, started_at, finished_at, rolled_back_at
  FROM "_prisma_migrations"
  WHERE finished_at IS NULL
    AND rolled_back_at IS NULL
),
classified AS (
  SELECT
    COALESCE(e.migration_name, d.migration_name) AS migration_name,
    e.expected_checksum,
    d.db_checksum,
    e.expect_unapplied,
    CASE
      WHEN e.migration_name IS NULL THEN 'db_only_completed'
      WHEN d.migration_name IS NULL THEN 'unapplied'
      WHEN d.db_checksum IS DISTINCT FROM e.expected_checksum THEN 'checksum_mismatch'
      ELSE 'match'
    END AS status
  FROM expected e
  FULL OUTER JOIN db_completed d ON d.migration_name = e.migration_name
),
mig_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'match')::text AS match_count,
    COUNT(*) FILTER (WHERE status = 'checksum_mismatch')::text AS mismatch_count,
    COUNT(*) FILTER (WHERE status = 'db_only_completed')::text AS db_only_count,
    COUNT(*) FILTER (WHERE status = 'unapplied')::text AS unapplied_count,
    COUNT(*) FILTER (
      WHERE status = 'unapplied' AND expect_unapplied IS TRUE
    )::text AS unapplied_expected_count,
    COUNT(*) FILTER (
      WHERE status = 'unapplied' AND COALESCE(expect_unapplied, FALSE) IS FALSE
    )::text AS unapplied_unexpected_count,
    COUNT(*) FILTER (
      WHERE expect_unapplied IS TRUE AND status = 'match'
    )::text AS planned_already_applied_count,
    (SELECT COUNT(*)::text FROM db_cancelled) AS cancelled_count,
    (SELECT COUNT(*)::text FROM db_unresolved) AS unresolved_count,
    COALESCE(
      (
        SELECT string_agg(migration_name, ', ' ORDER BY migration_name)
        FROM classified
        WHERE status = 'unapplied'
      ),
      '(none)'
    ) AS unapplied_names,
    COALESCE(
      (
        SELECT string_agg(migration_name, ', ' ORDER BY migration_name)
        FROM classified
        WHERE status = 'checksum_mismatch'
      ),
      '(none)'
    ) AS mismatch_names,
    COALESCE(
      (
        SELECT string_agg(migration_name, ', ' ORDER BY migration_name)
        FROM classified
        WHERE status = 'db_only_completed'
      ),
      '(none)'
    ) AS db_only_names,
    COALESCE(
      (
        SELECT string_agg(migration_name, ', ' ORDER BY migration_name)
        FROM db_cancelled
      ),
      '(none)'
    ) AS cancelled_names,
    COALESCE(
      (
        SELECT string_agg(migration_name, ', ' ORDER BY migration_name)
        FROM db_unresolved
      ),
      '(none)'
    ) AS unresolved_names,
    CASE
      WHEN (SELECT COUNT(*) FROM db_unresolved) > 0
        THEN 'STOP_unresolved_failures'
      WHEN COUNT(*) FILTER (WHERE status = 'checksum_mismatch') > 0
        THEN 'STOP_checksum_mismatch'
      WHEN COUNT(*) FILTER (WHERE status = 'db_only_completed') > 0
        THEN 'STOP_db_only_completed'
      WHEN COUNT(*) FILTER (
        WHERE status = 'unapplied' AND COALESCE(expect_unapplied, FALSE) IS FALSE
      ) > 0
        THEN 'STOP_unexpected_unapplied'
      WHEN COUNT(*) FILTER (
        WHERE expect_unapplied IS TRUE AND status = 'match'
      ) > 0
        THEN 'STOP_planned_already_applied'
      WHEN COUNT(*) FILTER (WHERE status = 'unapplied') = 2
       AND COUNT(*) FILTER (
         WHERE status = 'unapplied' AND expect_unapplied IS TRUE
       ) = 2
       AND COUNT(*) FILTER (WHERE status = 'match') = 140
        THEN 'OK_unapplied_exactly_planned_two'
      ELSE 'STOP_unexpected_shape'
    END AS migration_gate
  FROM classified
),
jla AS (
  SELECT
    COUNT(*)::int AS jla_row_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS jla_approved_count
  FROM "Association"
  WHERE name = '日本ライフセービング協会'
),
jla_admin AS (
  SELECT
    COUNT(aa.id)::int AS admin_row_count,
    COUNT(aa.id) FILTER (WHERE aa.role = 'ADMIN')::int AS admin_role_count
  FROM "Association" a
  LEFT JOIN "AssociationAdmin" aa
    ON aa."associationId" = a.id
  WHERE a.name = '日本ライフセービング協会'
),
schema_rows AS (
  SELECT
    'schema'::text AS section,
    'Qualification.confirmedAt'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedAt'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedAt'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmedByUserId'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedByUserId'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedByUserId'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmedByAssociationId'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedByAssociationId'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedByAssociationId'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmationMethod'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmationMethod'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmationMethod'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmedTemplateId'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedTemplateId'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedTemplateId'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmedCertNumber'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedCertNumber'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedCertNumber'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmedExpiryDate'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedExpiryDate'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmedExpiryDate'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'Qualification.confirmationInvalidatedAt'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmationInvalidatedAt'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Qualification'
        AND column_name = 'confirmationInvalidatedAt'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmedAt'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedAt'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedAt'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmedByUserId'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedByUserId'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedByUserId'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmedByAssociationId'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedByAssociationId'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedByAssociationId'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmationMethod'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmationMethod'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmationMethod'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmedTemplateId'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedTemplateId'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedTemplateId'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmedCertNumber'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedCertNumber'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedCertNumber'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmedExpiryDate'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedExpiryDate'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmedExpiryDate'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'QualificationHistory.confirmationInvalidatedAt'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmationInvalidatedAt'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'QualificationHistory'
        AND column_name = 'confirmationInvalidatedAt'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'enum.QualificationHistoryChangeType.CONFIRMATION_INVALIDATED'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'QualificationHistoryChangeType'
        AND e.enumlabel = 'CONFIRMATION_INVALIDATED'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'QualificationHistoryChangeType'
        AND e.enumlabel = 'CONFIRMATION_INVALIDATED'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
  UNION ALL
  SELECT
    'schema'::text AS section,
    'index.Qualification_confirmedAt_idx'::text AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'i'
        AND c.relname = 'Qualification_confirmedAt_idx'
    ) THEN 'present' ELSE 'absent' END AS value,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'i'
        AND c.relname = 'Qualification_confirmedAt_idx'
    ) THEN 'UNEXPECTED_BEFORE_MIGRATE' ELSE 'ok_before_migrate' END AS note
),
report AS (
  SELECT 'migration'::text AS section, 'gate'::text AS item,
         migration_gate AS value,
         'match=' || match_count
           || ' mismatch=' || mismatch_count
           || ' db_only_completed=' || db_only_count
           || ' unapplied=' || unapplied_count
           || ' cancelled=' || cancelled_count
           || ' unresolved=' || unresolved_count AS note
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'match_count', match_count, 'expected 140 when gate OK'
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'mismatch_count', mismatch_count, mismatch_names
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'db_only_completed_count', db_only_count, db_only_names
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'unapplied_count', unapplied_count, unapplied_names
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'unapplied_expected_count', unapplied_expected_count,
         'planned hotfix two must both be unapplied'
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'unapplied_unexpected_count', unapplied_unexpected_count,
         'must be 0'
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'planned_already_applied_count', planned_already_applied_count,
         'must be 0 before release migrate'
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'cancelled_count', cancelled_count,
         'rolled_back_at IS NOT NULL; excluded from completed checksum match; names=' || cancelled_names
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'unresolved_count', unresolved_count,
         'finished_at IS NULL AND rolled_back_at IS NULL; STOP if >0; names=' || unresolved_names
  FROM mig_stats
  UNION ALL
  SELECT 'migration', 'unapplied_exactly_planned_two',
         CASE WHEN migration_gate = 'OK_unapplied_exactly_planned_two'
           THEN 'true' ELSE 'false' END,
         migration_gate
  FROM mig_stats
  UNION ALL
  SELECT section, item, value, note FROM schema_rows
  UNION ALL
  SELECT 'jla', 'row_count', jla_row_count::text,
         CASE
           WHEN jla_row_count = 1 THEN 'ok_unique_by_query'
           WHEN jla_row_count = 0 THEN 'STOP_missing'
           ELSE 'STOP_not_unique'
         END
  FROM jla
  UNION ALL
  SELECT 'jla', 'approved_count', jla_approved_count::text,
         CASE
           WHEN jla_approved_count = 1 AND jla_row_count = 1 THEN 'ok_approved'
           ELSE 'STOP_not_single_approved'
         END
  FROM jla
  UNION ALL
  SELECT 'jla_admin', 'admin_role_count', admin_role_count::text,
         CASE
           WHEN admin_role_count >= 1 THEN 'ok_at_least_one_ADMIN'
           ELSE 'STOP_no_ADMIN'
         END
  FROM jla_admin
  UNION ALL
  SELECT 'jla_admin', 'admin_row_count', admin_row_count::text,
         'COUNT(aa.id) after LEFT JOIN; not COUNT(*)'
  FROM jla_admin
  UNION ALL
  SELECT 'reviewer_assignment', 'specific_reviewer_check', 'NOT_RUN',
         'separate item: designated reviewer AssociationAdmin.role=ADMIN on JLA; do not paste email/userId'
  UNION ALL
  SELECT 'review_settings', 'vercel_env_crosscheck', 'NOT_RUN',
         'separate item: Vercel Production QUALIFICATION_REVIEW_* must match DB; do not paste secrets'
  UNION ALL
  SELECT 'backup', 'scheduled_backup', 'unavailable_free_plan',
         'user-confirmed: free plan has no scheduled backups'
  UNION ALL
  SELECT 'backup', 'manual_backup', 'UNCONFIRMED',
         'user-confirmed: manual backup presence not verified'
)
SELECT section, item, value, note
FROM report
ORDER BY
  CASE section
    WHEN 'migration' THEN 1
    WHEN 'schema' THEN 2
    WHEN 'jla' THEN 3
    WHEN 'jla_admin' THEN 4
    WHEN 'reviewer_assignment' THEN 5
    WHEN 'review_settings' THEN 6
    WHEN 'backup' THEN 7
    ELSE 9
  END,
  item;

ROLLBACK;
