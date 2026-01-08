'use strict';

const url = process.env.S3DESK_URL || 'https://s3desk.k8s.homelabird.com/objects';
const runs = Number(process.env.LHCI_RUNS || 1);
const preset = process.env.S3DESK_LH_PRESET || process.env.LIGHTHOUSE_PRESET;

const settings = {
  disableStorageReset: true,
};

if (preset) {
  settings.preset = preset;
}

module.exports = {
  ci: {
    collect: {
      url: [url],
      numberOfRuns: Number.isFinite(runs) ? runs : 1,
      puppeteerScript: 'scripts/lighthouse_puppeteer_auth.js',
      chromePath: process.env.LHCI_CHROME_PATH || '/usr/bin/google-chrome',
      puppeteerLaunchOptions: {
        args: ['--no-sandbox', '--disable-gpu'],
      },
      settings,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: process.env.LHCI_OUTPUT_DIR || 'artifacts/lighthouse-ci',
    },
  },
};
