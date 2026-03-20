require('dotenv').config({ path: `.env.development`});
console.log('PRIVATE KEY set:', !!process.env.JWT_PRIVATE_KEY);
console.log('PUBLIC KEY set:', !!process.env.JWT_PUBLIC_KEY);
console.log('REFRESH SECRET set:', !!process.env.JWT_REFRESH_SECRET);

const key = process.env.JWT_PUBLIC_KEY;
console.log('Key set:', !!key);
console.log('Length:', key?.length);
console.log('Starts with:', key?.substring(0, 27));

console.log('TTL:', JSON.stringify(process.env.JWT_ACCESS_TTL)); 
console.log('parseInt:', parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10));

console.log(require('crypto').randomBytes(64).toString('hex'));

const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

client.send(new ListBucketsCommand({}))
  .then(r => console.log('Connected. Buckets:', r.Buckets.map(b => b.Name)))
  .catch(e => console.error('Failed:', e.message));
