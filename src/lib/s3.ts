import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "ap-northeast-1";
const bucket = process.env.S3_BUCKET_NAME;

function getS3Client() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials are not configured");
  }
  return new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function assertBucket() {
  if (!bucket) {
    throw new Error("S3_BUCKET_NAME is not configured");
  }
  return bucket;
}

function buildPublicUrl(key: string) {
  return `https://${assertBucket()}.s3.${region}.amazonaws.com/${key}`;
}

export async function uploadToS3(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const s3 = getS3Client();
  const targetBucket = assertBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: targetBucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    })
  );
  return buildPublicUrl(params.key);
}

export async function getSignedS3Url(key: string, expiresIn = 60 * 10): Promise<string> {
  const s3 = getS3Client();
  const targetBucket = assertBucket();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    }),
    { expiresIn }
  );
}

export async function deleteFromS3(key: string): Promise<void> {
  const s3 = getS3Client();
  const targetBucket = assertBucket();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: targetBucket,
      Key: key,
    })
  );
}

export async function uploadPdfToS3(params: {
  folder: string;
  filename: string;
  pdfBuffer: Buffer;
  metadata?: Record<string, string>;
}): Promise<string> {
  const key = `${params.folder}/${params.filename}`;
  return uploadToS3({
    key,
    body: params.pdfBuffer,
    contentType: "application/pdf",
    metadata: params.metadata,
  });
}

export async function uploadImageToS3(params: {
  folder: string;
  filename: string;
  imageBuffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const key = `${params.folder}/${params.filename}`;
  return uploadToS3({
    key,
    body: params.imageBuffer,
    contentType: params.contentType,
    metadata: params.metadata,
  });
}
