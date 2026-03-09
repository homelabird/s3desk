import { defineConfig, devices, type ReporterDescription } from '@playwright/test'

const SCREENSHOT_MODES = ['off', 'on', 'only-on-failure', 'on-first-failure'] as const
const TRACE_MODES = ['off', 'on', 'retain-on-failure', 'on-first-retry', 'on-all-retries', 'retain-on-first-failure'] as const
const VIDEO_MODES = ['off', 'on', 'retain-on-failure', 'on-first-retry'] as const

const isLive = process.env.E2E_LIVE === '1'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8080'
const recordVideos = isTruthy(process.env.PLAYWRIGHT_RECORD_VIDEOS)
const recordArtifacts = isTruthy(process.env.PLAYWRIGHT_RECORD_ARTIFACTS)
const recordHtmlReport = recordArtifacts || isTruthy(process.env.PLAYWRIGHT_HTML_REPORT)
const recordingOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR
const htmlReportDir = process.env.PLAYWRIGHT_HTML_REPORT_DIR
const shouldManageWebServer = !isLive && !process.env.PLAYWRIGHT_BASE_URL && !process.env.BASE_URL
const headless = !isFalsey(process.env.PLAYWRIGHT_HEADLESS)
const slowMoMs = parseInteger(process.env.PLAYWRIGHT_SLOW_MO_MS)

const videoMode = parseMode(process.env.PLAYWRIGHT_VIDEO_MODE, VIDEO_MODES, recordArtifacts || recordVideos ? 'on' : 'off')
const screenshotMode = parseMode(
	process.env.PLAYWRIGHT_SCREENSHOT_MODE,
	SCREENSHOT_MODES,
	recordArtifacts ? 'on' : 'only-on-failure',
)
const traceMode = parseMode(process.env.PLAYWRIGHT_TRACE_MODE, TRACE_MODES, recordArtifacts ? 'on' : 'retain-on-failure')

const reporter = buildReporter(recordHtmlReport, htmlReportDir)
const screenshot = recordArtifacts ? { mode: screenshotMode, fullPage: true } : screenshotMode
const trace = recordArtifacts
	? { mode: traceMode, screenshots: true, snapshots: true, sources: true, attachments: true }
	: traceMode
const video = recordArtifacts ? { mode: videoMode, size: { width: 1280, height: 720 } } : videoMode

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	reporter,
	...(shouldManageWebServer
		? {
				webServer: {
					command: 'npm run dev -- --host 127.0.0.1 --port 8080 --strictPort',
					url: baseURL,
					reuseExistingServer: true,
					timeout: 120_000,
				},
			}
		: {}),
	use: {
		baseURL,
		headless,
		viewport: { width: 1280, height: 720 },
		screenshot,
		trace,
		video,
		...(slowMoMs !== null ? { launchOptions: { slowMo: slowMoMs } } : {}),
	},
	...(recordingOutputDir ? { outputDir: recordingOutputDir } : {}),
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
			testIgnore: /mobile-smoke\.spec\.ts/,
		},
		{
			name: 'mobile-iphone-13',
			use: {
				...devices['iPhone 13'],
				// Keep iPhone viewport/UA emulation, but run on Chromium for Linux host portability.
				// WebKit binaries frequently require distro-specific deps on non-Ubuntu runners.
				browserName: 'chromium',
			},
			testMatch: /mobile-smoke\.spec\.ts/,
		},
		{
			name: 'mobile-pixel-7',
			use: {
				...devices['Pixel 7'],
			},
			testMatch: /mobile-smoke\.spec\.ts/,
		},
	],
})

function buildReporter(enableHtmlReport: boolean, outputFolder?: string): ReporterDescription[] {
	const reporter: ReporterDescription[] = [['list']]
	if (enableHtmlReport) {
		reporter.push([
			'html',
			{
				outputFolder: outputFolder || 'playwright-report',
				open: 'never',
				title: 'S3Desk Playwright Capture',
			},
		])
	}
	return reporter
}

function isTruthy(value?: string) {
	return ['1', 'true', 'on', 'yes'].includes((value || '').toLowerCase())
}

function isFalsey(value?: string) {
	return ['0', 'false', 'off', 'no'].includes((value || '').toLowerCase())
}

function parseInteger(value?: string) {
	if (!value) return null
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) ? parsed : null
}

function parseMode<TMode extends string>(value: string | undefined, supportedModes: readonly TMode[], fallback: TMode): TMode {
	if (!value) return fallback
	return supportedModes.includes(value as TMode) ? (value as TMode) : fallback
}
