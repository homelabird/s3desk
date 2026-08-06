'use strict';

const apiToken = process.env.S3DESK_API_TOKEN;
const profileId = process.env.S3DESK_PROFILE_ID;
const bucket = process.env.S3DESK_BUCKET;
const prefix = process.env.S3DESK_PREFIX ?? '';
const s3deskUrl = process.env.S3DESK_URL;
const defaultUrl = String(s3deskUrl || '');
const allowTokenStorage = process.env.S3DESK_LH_ALLOW_TOKEN_STORAGE === '1';

if (!s3deskUrl) {
  throw new Error('S3DESK_URL is required; refusing to store the API token on a default or external origin.');
}

if (!apiToken) {
  throw new Error('S3DESK_API_TOKEN is required for Lighthouse auth.');
}

if (!profileId) {
  throw new Error('S3DESK_PROFILE_ID is required for Lighthouse auth.');
}

if (!allowTokenStorage) {
  throw new Error('Set S3DESK_LH_ALLOW_TOKEN_STORAGE=1 to explicitly allow Lighthouse token storage.');
}

module.exports = async (browser, context) => {
  const targetUrl = (context && context.url) || defaultUrl;
  if (new URL(targetUrl).origin !== new URL(defaultUrl).origin) {
    throw new Error('Refusing to store the API token outside the configured S3DESK_URL origin.');
  }
  const origin = new URL(targetUrl).origin;
  const page = await browser.newPage();

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (storage) => {
      if (storage.apiToken !== undefined) {
        localStorage.setItem('apiToken', JSON.stringify(storage.apiToken));
      }
      if (storage.profileId !== undefined) {
        localStorage.setItem('profileId', JSON.stringify(storage.profileId));
      }
      if (storage.bucket !== undefined) {
        localStorage.setItem('bucket', JSON.stringify(storage.bucket));
      }
      if (storage.prefix !== undefined) {
        localStorage.setItem('prefix', JSON.stringify(storage.prefix));
      }
      if (storage.bucket !== undefined && storage.prefix !== undefined) {
        localStorage.setItem('objectsPrefixByBucket', JSON.stringify({ [storage.bucket]: storage.prefix }));
      }
    },
    { apiToken, profileId, bucket, prefix },
  );

  await page.close();
};
