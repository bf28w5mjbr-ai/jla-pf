/** プロフィール写真の生ファイル上限（一般的な画像アップロードは 8〜10MB 程度） */
export const PROFILE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** 表示用途に合わせたアップロード前の長辺上限（px） */
export const PROFILE_PHOTO_MAX_EDGE_PX = 1024;

export function profilePhotoMaxSizeLabelMb(): number {
  return Math.floor(PROFILE_PHOTO_MAX_BYTES / (1024 * 1024));
}

export function profilePhotoFileTooLargeMessage(): string {
  return `ファイルサイズは${profilePhotoMaxSizeLabelMb()}MB以下にしてください`;
}

export function isProfilePhotoWithinSizeLimit(byteLength: number): boolean {
  return byteLength <= PROFILE_PHOTO_MAX_BYTES;
}
