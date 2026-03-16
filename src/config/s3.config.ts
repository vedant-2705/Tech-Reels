import { registerAs } from '@nestjs/config';

export default registerAs('s3', () => ({
  region: process.env.AWS_REGION ?? '',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  rawBucket: process.env.S3_RAW_BUCKET ?? 'techreel-raw',
  cdnBucket: process.env.S3_CDN_BUCKET ?? 'techreel-cdn',
  cdnBaseUrl: process.env.CDN_BASE_URL ?? 'https://cdn.techreel.io/',
}));
