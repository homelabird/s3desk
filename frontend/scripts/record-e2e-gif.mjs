#!/usr/bin/env node

process.env.PLAYWRIGHT_EXPORT_GIF = process.env.PLAYWRIGHT_EXPORT_GIF || '1'
process.env.PLAYWRIGHT_EXPORT_MP4 = process.env.PLAYWRIGHT_EXPORT_MP4 || '1'
process.env.PLAYWRIGHT_EXPORT_GIF_TO_DOCS = process.env.PLAYWRIGHT_EXPORT_GIF_TO_DOCS || '1'

await import('./record-e2e-artifacts.mjs')
