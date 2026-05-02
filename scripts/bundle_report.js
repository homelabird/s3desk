#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const REPO_ROOT = path.resolve(__dirname, '..')
const BUNDLE_BUDGETS_PATH = path.join(REPO_ROOT, 'frontend', 'scripts', 'bundle-budgets.json')
const BUDGET_TIGHT_HEADROOM_BYTES = 1.5 * 1024
const BUDGET_LOOSE_HEADROOM_BYTES = 16 * 1024
const BUDGET_LOOSE_USAGE_RATIO = 0.75

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumber(value) {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatKB(bytes) {
	return `${(bytes / 1024).toFixed(1)} kB`
}

function formatPercent(ratio) {
	return `${(ratio * 100).toFixed(1)}%`
}

function readJSON(p) {
	if (!fs.existsSync(p)) throw new Error(`file not found: ${p}`)
	return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function gzipBytes(buf) {
	return zlib.gzipSync(buf).length
}

function readAssetBytes(distDir, relPath) {
	const filePath = path.join(distDir, relPath)
	const buf = fs.readFileSync(filePath)
	return { raw: buf.length, gzip: gzipBytes(buf) }
}

function uniqSorted(list) {
	return [...new Set(list)].sort((a, b) => a.localeCompare(b))
}

function parseIndexInitialJs(distDir) {
	const htmlPath = path.join(distDir, 'index.html')
	const html = fs.readFileSync(htmlPath, 'utf8')

	const assets = []
	for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
		assets.push(m[1])
	}
	for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
		assets.push(m[1])
	}

	return uniqSorted(
		assets
			.filter((p) => typeof p === 'string' && p.startsWith('/assets/') && p.endsWith('.js'))
			.map((p) => p.slice(1)),
	)
}

function findChunk(stats, prefix) {
	const children = stats?.tree?.children
	if (!Array.isArray(children)) return null
	return children.find((c) => isRecord(c) && typeof c.name === 'string' && c.name.startsWith('assets/') && c.name.includes(prefix) && c.name.endsWith('.js')) || null
}

function toPackageName(moduleId) {
	const id = String(moduleId || '').replace(/^\0+/, '').replace(/^[./]+/, '')
	const idx = id.indexOf('node_modules/')
	if (idx === -1) return '<app>'
	const rest = id.slice(idx + 'node_modules/'.length)
	const parts = rest.split('/').filter(Boolean)
	if (parts.length === 0) return '<node_modules>'
	if (parts[0].startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`
	return parts[0]
}

function topModulesForChunk(stats, chunkName, limit) {
	const metas = stats.nodeMetas || {}
	const parts = stats.nodeParts || {}
	const rows = []
	for (const meta of Object.values(metas)) {
		if (!isRecord(meta)) continue
		if (!isRecord(meta.moduleParts)) continue
		const partKey = meta.moduleParts[chunkName]
		if (typeof partKey !== 'string') continue
		const part = parts[partKey]
		if (!isRecord(part)) continue
		const gzip = toNumber(part.gzipLength)
		if (gzip <= 0) continue
		rows.push({
			gzip,
			rendered: toNumber(part.renderedLength),
			id: String(meta.id || ''),
		})
	}
	rows.sort((a, b) => b.gzip - a.gzip)
	return rows.slice(0, limit)
}

function topPackagesForChunks(stats, chunkNames, limit) {
	const metas = stats.nodeMetas || {}
	const parts = stats.nodeParts || {}
	const totals = new Map()

	for (const meta of Object.values(metas)) {
		if (!isRecord(meta)) continue
		if (!isRecord(meta.moduleParts)) continue

		let gzip = 0
		for (const chunkName of chunkNames) {
			const partKey = meta.moduleParts[chunkName]
			if (typeof partKey !== 'string') continue
			const part = parts[partKey]
			if (!isRecord(part)) continue
			gzip += toNumber(part.gzipLength)
		}
		if (gzip <= 0) continue

		const pkg = toPackageName(meta.id)
		totals.set(pkg, (totals.get(pkg) || 0) + gzip)
	}

	const rows = [...totals.entries()].map(([pkg, gzip]) => ({ pkg, gzip }))
	rows.sort((a, b) => b.gzip - a.gzip)
	return rows.slice(0, limit)
}

function parseArgs(argv) {
	const distExists = fs.existsSync(path.resolve(process.cwd(), 'dist'))
	const args = {
		statsPath: distExists ? 'dist/stats.json' : 'frontend/dist/stats.json',
		outPath: distExists ? 'dist/bundle-report.md' : 'frontend/dist/bundle-report.md',
		fail: false,
	}
	const positional = []
	for (const a of argv) {
		if (a === '--fail') args.fail = true
		else positional.push(a)
	}
	if (positional[0]) args.statsPath = positional[0]
	if (positional[1]) args.outPath = positional[1]
	return args
}

function readBudgetManifest() {
	const manifest = readJSON(BUNDLE_BUDGETS_PATH)
	if (!isRecord(manifest)) {
		throw new Error(`invalid budget manifest: ${BUNDLE_BUDGETS_PATH}`)
	}
	return manifest
}

function resolveBudgets(manifest, env = process.env) {
	const budgets = {}
	for (const [key, rawEntry] of Object.entries(manifest)) {
		if (!isRecord(rawEntry)) throw new Error(`invalid budget entry: ${key}`)
		if (typeof rawEntry.label !== 'string' || rawEntry.label.length === 0) {
			throw new Error(`missing budget label: ${key}`)
		}
		if (typeof rawEntry.env !== 'string' || rawEntry.env.length === 0) {
			throw new Error(`missing budget env name: ${key}`)
		}
		if (typeof rawEntry.rationale !== 'string' || rawEntry.rationale.length === 0) {
			throw new Error(`missing budget rationale: ${key}`)
		}
		if (typeof rawEntry.reviewAction !== 'string' || rawEntry.reviewAction.length === 0) {
			throw new Error(`missing budget reviewAction: ${key}`)
		}
		if (rawEntry.reviewTightHeadroomKB != null && !Number.isFinite(rawEntry.reviewTightHeadroomKB)) {
			throw new Error(`invalid reviewTightHeadroomKB: ${key}`)
		}
		if (!Number.isFinite(rawEntry.defaultKB)) {
			throw new Error(`missing budget defaultKB: ${key}`)
		}
		const envOverride = env[rawEntry.env]
		const kb = envOverride ? Number(envOverride) : Number(rawEntry.defaultKB)
		if (!Number.isFinite(kb)) {
			throw new Error(`invalid budget value for ${key}`)
		}
		budgets[key] = {
			label: rawEntry.label,
			env: rawEntry.env,
			rationale: rawEntry.rationale,
			reviewAction: rawEntry.reviewAction,
			defaultKB: Number(rawEntry.defaultKB),
			reviewTightHeadroomBytes:
				rawEntry.reviewTightHeadroomKB != null ? Number(rawEntry.reviewTightHeadroomKB) * 1024 : BUDGET_TIGHT_HEADROOM_BYTES,
			kb,
			bytes: kb * 1024,
		}
	}
	return budgets
}

function buildBudgetMeasurements(budgets, measuredGzipBytes) {
	const measurements = {}
	const reviewCandidates = []
	const actionHints = []

	for (const [key, entry] of Object.entries(budgets)) {
		const actualBytes = measuredGzipBytes[key]
		if (!Number.isFinite(actualBytes)) {
			measurements[key] = null
			continue
		}
		const headroomBytes = entry.bytes - actualBytes
		const usageRatio = actualBytes / entry.bytes
		measurements[key] = {
			actualBytes,
			headroomBytes,
			usageRatio,
		}
		if (headroomBytes < 0) continue
		if (headroomBytes <= entry.reviewTightHeadroomBytes) {
			reviewCandidates.push(
				`${entry.label}: only ${formatKB(headroomBytes)} headroom left (${formatPercent(usageRatio)} used); review whether this budget is too tight or the chunk should shrink.`,
			)
			actionHints.push(`${entry.label}: ${entry.reviewAction}`)
			continue
		}
		if (headroomBytes >= BUDGET_LOOSE_HEADROOM_BYTES && usageRatio <= BUDGET_LOOSE_USAGE_RATIO) {
			reviewCandidates.push(
				`${entry.label}: ${formatKB(headroomBytes)} headroom remains (${formatPercent(usageRatio)} used); review whether this budget is now too loose.`,
			)
			actionHints.push(`${entry.label}: ${entry.reviewAction}`)
		}
	}

	return { measurements, reviewCandidates, actionHints }
}

function warnMissingBudgetChunk(warnings, chunkName, budgetEntry) {
	warnings.push(`${chunkName} chunk not found for ${budgetEntry.label}; review whether the lazy boundary was renamed, merged, or accidentally removed.`)
}

function generateBundleReport({ statsPath, outPath, fail = false, env = process.env }) {
	const stats = readJSON(statsPath)
	const distDir = path.dirname(statsPath)
	const budgetManifest = readBudgetManifest()
	const budgets = resolveBudgets(budgetManifest, env)

	const vendorUi = findChunk(stats, 'vendor-ui-')
	const vendorUiName = vendorUi ? vendorUi.name : null
	const objectsPage = findChunk(stats, 'ObjectsPage-')
	const objectsPageName = objectsPage ? objectsPage.name : null
	const uploadsPage = findChunk(stats, 'UploadsPage-')
	const uploadsPageName = uploadsPage ? uploadsPage.name : null
	const uploadsExperience = findChunk(stats, 'UploadsPageExperience-')
	const uploadsExperienceName = uploadsExperience ? uploadsExperience.name : null
	const transfers = findChunk(stats, 'Transfers-')
	const transfersName = transfers ? transfers.name : null

	const initialJs = parseIndexInitialJs(distDir)
	const initialSizes = initialJs.map((rel) => ({ rel, ...readAssetBytes(distDir, rel) }))
	initialSizes.sort((a, b) => b.gzip - a.gzip)

	const initialTotal = initialSizes.reduce((acc, f) => acc + f.raw, 0)
	const initialTotalGzip = initialSizes.reduce((acc, f) => acc + f.gzip, 0)

	const vendorUiSizes = vendorUiName ? readAssetBytes(distDir, vendorUiName) : null
	const objectsPageSizes = objectsPageName ? readAssetBytes(distDir, objectsPageName) : null
	const uploadsPageSizes = uploadsPageName ? readAssetBytes(distDir, uploadsPageName) : null
	const uploadsExperienceSizes = uploadsExperienceName ? readAssetBytes(distDir, uploadsExperienceName) : null
	const transfersSizes = transfersName ? readAssetBytes(distDir, transfersName) : null

	const warnings = []
	if (!vendorUiSizes) {
		warnMissingBudgetChunk(warnings, 'vendor-ui', budgets.vendorUiGzip)
	}
	if (vendorUiSizes && vendorUiSizes.gzip > budgets.vendorUiGzip.bytes) {
		warnings.push(`vendor-ui gzip ${formatKB(vendorUiSizes.gzip)} > budget ${formatKB(budgets.vendorUiGzip.bytes)}`)
	}
	if (initialTotalGzip > budgets.initialJsGzip.bytes) {
		warnings.push(`initial JS gzip ${formatKB(initialTotalGzip)} > budget ${formatKB(budgets.initialJsGzip.bytes)}`)
	}
	if (!objectsPageSizes) {
		warnMissingBudgetChunk(warnings, 'ObjectsPage', budgets.objectsPageGzip)
	}
	if (objectsPageSizes && objectsPageSizes.gzip > budgets.objectsPageGzip.bytes) {
		warnings.push(`ObjectsPage gzip ${formatKB(objectsPageSizes.gzip)} > budget ${formatKB(budgets.objectsPageGzip.bytes)}`)
	}
	if (!uploadsPageSizes) {
		warnMissingBudgetChunk(warnings, 'UploadsPage', budgets.uploadsPageGzip)
	}
	if (uploadsPageSizes && uploadsPageSizes.gzip > budgets.uploadsPageGzip.bytes) {
		warnings.push(`UploadsPage gzip ${formatKB(uploadsPageSizes.gzip)} > budget ${formatKB(budgets.uploadsPageGzip.bytes)}`)
	}
	if (!uploadsExperienceSizes && budgets.uploadsExperienceGzip) {
		warnMissingBudgetChunk(warnings, 'UploadsPageExperience', budgets.uploadsExperienceGzip)
	}
	if (uploadsExperienceSizes && budgets.uploadsExperienceGzip && uploadsExperienceSizes.gzip > budgets.uploadsExperienceGzip.bytes) {
		warnings.push(`UploadsPageExperience gzip ${formatKB(uploadsExperienceSizes.gzip)} > budget ${formatKB(budgets.uploadsExperienceGzip.bytes)}`)
	}
	if (!transfersSizes) {
		warnMissingBudgetChunk(warnings, 'Transfers', budgets.transfersGzip)
	}
	if (transfersSizes && transfersSizes.gzip > budgets.transfersGzip.bytes) {
		warnings.push(`Transfers gzip ${formatKB(transfersSizes.gzip)} > budget ${formatKB(budgets.transfersGzip.bytes)}`)
	}

	const initialChunks = initialJs
		.map((p) => p.replace(/^\/?/, ''))
		.filter((p) => typeof p === 'string' && p.startsWith('assets/') && p.endsWith('.js'))

	const topInitialPackages = topPackagesForChunks(stats, initialChunks, 20)
	const topVendorUiModules = vendorUiName ? topModulesForChunk(stats, vendorUiName, 25) : []
	const topObjectsPageModules = objectsPageName ? topModulesForChunk(stats, objectsPageName, 25) : []
	const topUploadsPageModules = uploadsPageName ? topModulesForChunk(stats, uploadsPageName, 15) : []
	const topUploadsExperienceModules = uploadsExperienceName ? topModulesForChunk(stats, uploadsExperienceName, 15) : []
	const topTransfersModules = transfersName ? topModulesForChunk(stats, transfersName, 15) : []
	const measuredGzipBytes = {
		vendorUiGzip: vendorUiSizes?.gzip,
		initialJsGzip: initialTotalGzip,
		objectsPageGzip: objectsPageSizes?.gzip,
		uploadsPageGzip: uploadsPageSizes?.gzip,
		uploadsExperienceGzip: uploadsExperienceSizes?.gzip,
		transfersGzip: transfersSizes?.gzip,
	}
	const { measurements: budgetMeasurements, reviewCandidates, actionHints } = buildBudgetMeasurements(budgets, measuredGzipBytes)

	let md = ''
	md += `# Bundle Report\n\n`
	md += `Generated from \`${statsPath}\` and \`${path.join(distDir, 'index.html')}\`.\n\n`

	md += `## Key Metrics\n\n`
	if (vendorUiName && vendorUiSizes) {
		md += `- vendor-ui: \`${vendorUiName}\` (${formatKB(vendorUiSizes.raw)} raw, ${formatKB(vendorUiSizes.gzip)} gzip)\n`
	} else {
		md += `- vendor-ui: (not found)\n`
	}
	if (objectsPageName && objectsPageSizes) {
		md += `- ObjectsPage: \`${objectsPageName}\` (${formatKB(objectsPageSizes.raw)} raw, ${formatKB(objectsPageSizes.gzip)} gzip)\n`
	} else {
		md += `- ObjectsPage: (not found)\n`
	}
	if (uploadsPageName && uploadsPageSizes) {
		md += `- UploadsPage: \`${uploadsPageName}\` (${formatKB(uploadsPageSizes.raw)} raw, ${formatKB(uploadsPageSizes.gzip)} gzip)\n`
	} else {
		md += `- UploadsPage: (not found)\n`
	}
	if (uploadsExperienceName && uploadsExperienceSizes) {
		md += `- UploadsPageExperience: \`${uploadsExperienceName}\` (${formatKB(uploadsExperienceSizes.raw)} raw, ${formatKB(uploadsExperienceSizes.gzip)} gzip)\n`
	}
	if (transfersName && transfersSizes) {
		md += `- Transfers: \`${transfersName}\` (${formatKB(transfersSizes.raw)} raw, ${formatKB(transfersSizes.gzip)} gzip)\n`
	} else {
		md += `- Transfers: (not found)\n`
	}
	md += `- initial JS (index.html): ${initialJs.length} files (${formatKB(initialTotal)} raw, ${formatKB(initialTotalGzip)} gzip)\n\n`

	md += `### Initial JS Files (Sorted by gzip)\n\n`
	md += `| gzip | raw | file |\n|---:|---:|---|\n`
	for (const f of initialSizes) {
		md += `| ${formatKB(f.gzip)} | ${formatKB(f.raw)} | \`${f.rel}\` |\n`
	}
	md += `\n`

	md += `### Top Packages in Initial JS (module gzip, approx)\n\n`
	md += `| gzip | package |\n|---:|---|\n`
	for (const row of topInitialPackages) {
		md += `| ${formatKB(row.gzip)} | \`${row.pkg}\` |\n`
	}
	md += `\n`

	md += `### Top Modules in vendor-ui (module gzip, approx)\n\n`
	if (!vendorUiName) {
		md += `vendor-ui chunk not found in stats tree.\n\n`
	} else {
		md += `| gzip | rendered | module |\n|---:|---:|---|\n`
		for (const row of topVendorUiModules) {
			md += `| ${formatKB(row.gzip)} | ${formatKB(row.rendered)} | \`${row.id}\` |\n`
		}
		md += `\n`
	}

	md += `### Top Modules in ObjectsPage (module gzip, approx)\n\n`
	if (!objectsPageName) {
		md += `ObjectsPage chunk not found in stats tree.\n\n`
	} else {
		md += `| gzip | rendered | module |\n|---:|---:|---|\n`
		for (const row of topObjectsPageModules) {
			md += `| ${formatKB(row.gzip)} | ${formatKB(row.rendered)} | \`${row.id}\` |\n`
		}
		md += `\n`
	}

	md += `### Top Modules in UploadsPage (module gzip, approx)\n\n`
	if (!uploadsPageName) {
		md += `UploadsPage chunk not found in stats tree.\n\n`
	} else {
		md += `| gzip | rendered | module |\n|---:|---:|---|\n`
		for (const row of topUploadsPageModules) {
			md += `| ${formatKB(row.gzip)} | ${formatKB(row.rendered)} | \`${row.id}\` |\n`
		}
		md += `\n`
	}

	md += `### Top Modules in UploadsPageExperience (module gzip, approx)\n\n`
	if (!uploadsExperienceName) {
		md += `UploadsPageExperience chunk not found in stats tree.\n\n`
	} else {
		md += `| gzip | rendered | module |\n|---:|---:|---|\n`
		for (const row of topUploadsExperienceModules) {
			md += `| ${formatKB(row.gzip)} | ${formatKB(row.rendered)} | \`${row.id}\` |\n`
		}
		md += `\n`
	}

	md += `### Top Modules in Transfers (module gzip, approx)\n\n`
	if (!transfersName) {
		md += `Transfers chunk not found in stats tree.\n\n`
	} else {
		md += `| gzip | rendered | module |\n|---:|---:|---|\n`
		for (const row of topTransfersModules) {
			md += `| ${formatKB(row.gzip)} | ${formatKB(row.rendered)} | \`${row.id}\` |\n`
		}
		md += `\n`
	}

	md += `## Budgets (Soft)\n\n`
	md += `Defaults come from \`frontend/scripts/bundle-budgets.json\`. Temporary local experiments can override them with the matching \`BUNDLE_BUDGET_*_KB\` environment variables.\n\n`
	for (const [key, entry] of Object.entries(budgets)) {
		const measurement = budgetMeasurements[key]
		md += `- ${entry.label}: budget ${formatKB(entry.bytes)}`
		if (measurement) {
			md += ` | actual ${formatKB(measurement.actualBytes)} | headroom ${formatKB(measurement.headroomBytes)} | usage ${formatPercent(measurement.usageRatio)}`
		} else {
			md += ` | actual n/a`
		}
		if (entry.kb !== entry.defaultKB) {
			md += ` (env override via \`${entry.env}\`)`
		}
		md += `\n`
		md += `  - ${entry.rationale}\n`
	}
	md += `\n`
	if (reviewCandidates.length === 0) {
		md += `No budget review candidates.\n\n`
	} else {
		md += `Budget review candidates:\n`
		for (const candidate of reviewCandidates) md += `- ${candidate}\n`
		md += `\n`
	}
	if (actionHints.length === 0) {
		md += `No budget action hints.\n\n`
	} else {
		md += `Budget action hints:\n`
		for (const actionHint of actionHints) md += `- ${actionHint}\n`
		md += `\n`
	}
	if (warnings.length === 0) {
		md += `No budget warnings.\n`
	} else {
		md += `Budget warnings:\n`
		for (const w of warnings) md += `- ${w}\n`
	}
	md += `\n`

	fs.mkdirSync(path.dirname(outPath), { recursive: true })
	fs.writeFileSync(outPath, md, 'utf8')

	console.log(`[bundle-report] wrote ${outPath}`)
	if (warnings.length > 0) {
		console.warn(`[bundle-report] warnings: ${warnings.length}`)
		for (const w of warnings) console.warn(`[bundle-report] ${w}`)
		if (fail) process.exitCode = 1
	}

	return { warnings, reviewCandidates, actionHints, outPath }
}

function main() {
	const { statsPath, outPath, fail } = parseArgs(process.argv.slice(2))
	return generateBundleReport({ statsPath, outPath, fail })
}

if (require.main === module) {
	try {
		main()
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error(`[bundle-report] error: ${msg}`)
		process.exit(1)
	}
}

module.exports = {
	buildBudgetMeasurements,
	generateBundleReport,
	main,
	parseArgs,
	readBudgetManifest,
	resolveBudgets,
	warnMissingBudgetChunk,
}
