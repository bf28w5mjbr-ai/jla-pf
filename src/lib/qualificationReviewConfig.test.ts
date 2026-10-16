import { afterEach, describe, expect, it } from "vitest";
import {
  parseQualificationReviewConfig,
  QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV,
  QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV,
} from "./qualificationReviewConfig";

const ASSOC = "assoc_jla_fixture_1";
const TMPL = "tmpl_jla_fixture_1";

function snapshotEnv() {
  return {
    assoc: process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV],
    templates: process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV],
  };
}

function restoreEnv(prev: { assoc: string | undefined; templates: string | undefined }) {
  if (prev.assoc === undefined) delete process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV];
  else process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = prev.assoc;
  if (prev.templates === undefined) delete process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];
  else process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = prev.templates;
}

describe("parseQualificationReviewConfig", () => {
  const prev = snapshotEnv();
  afterEach(() => restoreEnv(prev));

  it("未設定は null", () => {
    delete process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV];
    delete process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];
    expect(parseQualificationReviewConfig()).toBeNull();
  });

  it("空文字は null", () => {
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = "  ";
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = "[]";
    expect(parseQualificationReviewConfig()).toBeNull();
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = ASSOC;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = "  ";
    expect(parseQualificationReviewConfig()).toBeNull();
  });

  it("不正JSONは null", () => {
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = ASSOC;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = "{not-json";
    expect(parseQualificationReviewConfig()).toBeNull();
  });

  it("配列でないJSONは null", () => {
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = ASSOC;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify({ id: TMPL });
    expect(parseQualificationReviewConfig()).toBeNull();
  });

  it("空配列は null", () => {
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = ASSOC;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = "[]";
    expect(parseQualificationReviewConfig()).toBeNull();
  });

  it("不正な配列要素は null", () => {
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = ASSOC;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify([TMPL, 1]);
    expect(parseQualificationReviewConfig()).toBeNull();
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify([TMPL, ""]);
    expect(parseQualificationReviewConfig()).toBeNull();
  });

  it("両方正しければ associationId と templateIds を返す", () => {
    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = ASSOC;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify([TMPL]);
    expect(parseQualificationReviewConfig()).toEqual({
      associationId: ASSOC,
      templateIds: [TMPL],
    });
  });
});
