import { describe, expect, it } from "vitest";
import {
  PROFILE_PHOTO_MAX_BYTES,
  isProfilePhotoWithinSizeLimit,
  profilePhotoFileTooLargeMessage,
  profilePhotoMaxSizeLabelMb,
} from "./profilePhotoUpload";

describe("profilePhotoUpload", () => {
  it("uses 10MB limit aligned with common image upload caps", () => {
    expect(profilePhotoMaxSizeLabelMb()).toBe(10);
    expect(PROFILE_PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("validates size and message", () => {
    expect(isProfilePhotoWithinSizeLimit(PROFILE_PHOTO_MAX_BYTES)).toBe(true);
    expect(isProfilePhotoWithinSizeLimit(PROFILE_PHOTO_MAX_BYTES + 1)).toBe(false);
    expect(profilePhotoFileTooLargeMessage()).toBe("ファイルサイズは10MB以下にしてください");
  });
});
