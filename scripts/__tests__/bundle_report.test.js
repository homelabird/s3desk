const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const zlib = require('node:zlib')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const { generateBundleReport } = require(path.join(REPO_ROOT, 'scripts', 'bundle_report.js'))

function writeFile(filePath, content) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, 'utf8')
}

function gzipBytes(content) {
	return zlib.gzipSync(Buffer.from(content)).length
}

function kbForHeadroom(actualBytes, headroomBytes) {
	return ((actualBytes + headroomBytes) / 1024).toFixed(4)
}

test('bundle report emits action hints for tight route review candidates', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-report-test-'))

	try {
		const distDir = path.join(tempRoot, 'dist')
		const assetsDir = path.join(distDir, 'assets')
		const statsPath = path.join(distDir, 'stats.json')
		const outPath = path.join(distDir, 'bundle-report.md')

		const vendorName = 'vendor-ui-test.js'
		const entryName = 'index-test.js'
		const profilesName = 'ProfilesPage-test.js'
		const objectsName = 'ObjectsPage-test.js'
		const uploadsName = 'UploadsPage-test.js'
		const transfersName = 'Transfers-test.js'

		const vendorContent = Array.from({ length: 120 }, (_, index) => `export const vendor_${index} = "vendor-${index}";`).join('\n')
		const entryContent = Array.from({ length: 80 }, (_, index) => `export const entry_${index} = "entry-${index}";`).join('\n')
		const profilesContent = Array.from({ length: 130 }, (_, index) => `export const profile_${index} = "profile-${index}";`).join('\n')
		const objectsContent = Array.from({ length: 220 }, (_, index) => `export const object_${index} = "object-${index}";`).join('\n')
		const uploadsContent = Array.from({ length: 140 }, (_, index) => `export const upload_${index} = "upload-${index}";`).join('\n')
		const transfersContent = Array.from({ length: 160 }, (_, index) => `export const transfer_${index} = "transfer-${index}";`).join('\n')

		writeFile(path.join(assetsDir, vendorName), vendorContent)
		writeFile(path.join(assetsDir, entryName), entryContent)
		writeFile(path.join(assetsDir, profilesName), profilesContent)
		writeFile(path.join(assetsDir, objectsName), objectsContent)
		writeFile(path.join(assetsDir, uploadsName), uploadsContent)
		writeFile(path.join(assetsDir, transfersName), transfersContent)

		writeFile(
			path.join(distDir, 'index.html'),
			[
				'<!doctype html>',
				'<html>',
				'<head>',
				`  <link rel="modulepreload" href="/assets/${vendorName}">`,
				'</head>',
				'<body>',
				`  <script type="module" src="/assets/${entryName}"></script>`,
				'</body>',
				'</html>',
				'',
			].join('\n'),
		)

		writeFile(
			statsPath,
			JSON.stringify(
				{
					tree: {
						children: [
							{ name: `assets/${vendorName}` },
							{ name: `assets/${profilesName}` },
							{ name: `assets/${objectsName}` },
							{ name: `assets/${uploadsName}` },
							{ name: `assets/${transfersName}` },
						],
					},
					nodeMetas: {
						profilesModule: {
							id: '/src/pages/ProfilesPage.tsx',
							moduleParts: {
								[`assets/${profilesName}`]: 'profilesModulePart',
							},
						},
						objectModule: {
							id: '/src/pages/objects/heavy-object-module.ts',
							moduleParts: {
								[`assets/${objectsName}`]: 'objectModulePart',
							},
						},
						uploadsModule: {
							id: '/src/pages/uploads/UploadsPageShell.tsx',
							moduleParts: {
								[`assets/${uploadsName}`]: 'uploadsModulePart',
							},
						},
						transfersModule: {
							id: '/src/components/transfers/useTransfersUploadRuntime.ts',
							moduleParts: {
								[`assets/${transfersName}`]: 'transfersModulePart',
							},
						},
					},
					nodeParts: {
						profilesModulePart: {
							gzipLength: 1536,
							renderedLength: 6144,
						},
						objectModulePart: {
							gzipLength: 2048,
							renderedLength: 8192,
						},
						uploadsModulePart: {
							gzipLength: 1024,
							renderedLength: 4096,
						},
						transfersModulePart: {
							gzipLength: 3072,
							renderedLength: 12288,
						},
					},
				},
				null,
				2,
			),
		)

		const vendorGzip = gzipBytes(vendorContent)
		const entryGzip = gzipBytes(entryContent)
		const profilesGzip = gzipBytes(profilesContent)
		const objectsGzip = gzipBytes(objectsContent)
		const uploadsGzip = gzipBytes(uploadsContent)
		const transfersGzip = gzipBytes(transfersContent)

		generateBundleReport({
			statsPath,
			outPath,
			env: {
				...process.env,
				BUNDLE_BUDGET_VENDOR_UI_GZIP_KB: kbForHeadroom(vendorGzip, 4096),
				BUNDLE_BUDGET_INITIAL_JS_GZIP_KB: kbForHeadroom(vendorGzip + entryGzip, 4096),
				BUNDLE_BUDGET_PROFILES_PAGE_GZIP_KB: kbForHeadroom(profilesGzip, 4096),
				BUNDLE_BUDGET_OBJECTS_PAGE_GZIP_KB: kbForHeadroom(objectsGzip, 64),
				BUNDLE_BUDGET_UPLOADS_PAGE_GZIP_KB: kbForHeadroom(uploadsGzip, 64),
				BUNDLE_BUDGET_TRANSFERS_GZIP_KB: kbForHeadroom(transfersGzip, 4096),
			},
		})

		const report = fs.readFileSync(outPath, 'utf8')

		assert.match(report, /Budget review candidates:/)
		assert.match(report, /ObjectsPage gzip budget: only .* review whether this budget is too tight or the chunk should shrink\./)
		assert.match(report, /UploadsPage gzip budget: only .* review whether this budget is too tight or the chunk should shrink\./)
		assert.match(report, /Budget action hints:\n- ObjectsPage gzip budget: shrink first\n- UploadsPage gzip budget: shrink first\n/)
		assert.match(report, /ProfilesPage: `assets\/ProfilesPage-test\.js`/)
		assert.match(report, /### Top Modules in ProfilesPage \(module gzip, approx\)/)
		assert.match(report, /\/src\/pages\/ProfilesPage\.tsx/)
		assert.match(report, /### Top Modules in ObjectsPage \(module gzip, approx\)/)
		assert.match(report, /\/src\/pages\/objects\/heavy-object-module\.ts/)
		assert.match(report, /### Top Modules in UploadsPage \(module gzip, approx\)/)
		assert.match(report, /\/src\/pages\/uploads\/UploadsPageShell\.tsx/)
		assert.match(report, /### Top Modules in Transfers \(module gzip, approx\)/)
		assert.match(report, /\/src\/components\/transfers\/useTransfersUploadRuntime\.ts/)
		assert.match(report, /No budget warnings\./)
		assert.doesNotMatch(report, /No budget review candidates\./)
		assert.doesNotMatch(report, /No budget action hints\./)
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true })
	}
})

test('bundle report warns and fails when budgeted chunks disappear', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-report-missing-chunk-test-'))
	const previousExitCode = process.exitCode

	try {
		process.exitCode = undefined
		const distDir = path.join(tempRoot, 'dist')
		const assetsDir = path.join(distDir, 'assets')
		const statsPath = path.join(distDir, 'stats.json')
		const outPath = path.join(distDir, 'bundle-report.md')
		const entryName = 'index-test.js'
		const entryContent = 'export const boot = "ok";'

		writeFile(path.join(assetsDir, entryName), entryContent)
		writeFile(
			path.join(distDir, 'index.html'),
			[
				'<!doctype html>',
				'<html>',
				'<body>',
				`  <script type="module" src="/assets/${entryName}"></script>`,
				'</body>',
				'</html>',
				'',
			].join('\n'),
		)
		writeFile(
			statsPath,
			JSON.stringify(
				{
					tree: {
						children: [{ name: `assets/${entryName}` }],
					},
					nodeMetas: {},
					nodeParts: {},
				},
				null,
				2,
			),
		)

		const result = generateBundleReport({
			statsPath,
			outPath,
			fail: true,
			env: {
				...process.env,
				BUNDLE_BUDGET_INITIAL_JS_GZIP_KB: kbForHeadroom(gzipBytes(entryContent), 4096),
			},
		})

		const report = fs.readFileSync(outPath, 'utf8')

		assert.equal(process.exitCode, 1)
		assert.match(report, /Budget warnings:/)
		assert.match(report, /vendor-ui chunk not found for vendor-ui gzip budget/)
		assert.match(report, /ProfilesPage chunk not found for ProfilesPage gzip budget/)
		assert.match(report, /ObjectsPage chunk not found for ObjectsPage gzip budget/)
		assert.match(report, /Transfers chunk not found for Transfers gzip budget/)
		assert.match(report, /ProfilesPage gzip budget: budget .* \| actual n\/a/)
		assert.match(report, /ObjectsPage gzip budget: budget .* \| actual n\/a/)
		assert.ok(result.warnings.some((warning) => warning.includes('lazy boundary was renamed, merged, or accidentally removed')))
	} finally {
		process.exitCode = previousExitCode
		fs.rmSync(tempRoot, { recursive: true, force: true })
	}
})
