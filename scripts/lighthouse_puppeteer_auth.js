'use strict';

const apiToken = process.env.S3DESK_API_TOKEN;
const profileId = process.env.S3DESK_PROFILE_ID;
const bucket = process.env.S3DESK_BUCKET;
const prefix = process.env.S3DESK_PREFIX ?? '';
const defaultUrl = process.env.S3DESK_URL || 'https://s3desk.k8s.homelabird.com/objects';

if (!apiToken) {
  throw new Error('S3DESK_API_TOKEN is required for Lighthouse auth.');
}

if (!profileId) {
  throw new Error('S3DESK_PROFILE_ID is required for Lighthouse auth.');
}

module.exports = async (browser, context) => {
  const targetUrl = (context && context.url) || defaultUrl;
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
