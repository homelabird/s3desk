const fs = require('node:fs')
const path = require('node:path')

function escapeCell(value) {
	return String(value ?? '').replace(/\|/g, '\\|')
}

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toArray(value) {
	return Array.isArray(value) ? value : []
}

function callHasIssue(call) {
	const status = typeof call.status === 'number' ? call.status : 0
	const errorsCount = typeof call.errorsCount === 'number' ? call.errorsCount : 0
	if (status >= 400) return true
	if (call.ok === false) return true
	if (typeof call.errorCode === 'string' && call.errorCode.length > 0) return true
	if (typeof call.normalizedCode === 'string' && call.normalizedCode.length > 0) return true
	if (call.validationOk === false) return true
	if (errorsCount > 0) return true
	return false
}

function readEntries(sourcePath) {
	const text = fs.readFileSync(sourcePath, 'utf8')
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line, index) => {
			const parsed = JSON.parse(line)
			if (!isRecord(parsed)) {
				throw new Error(`line ${index + 1} is not a JSON object`)
			}
			return parsed
		})
}

function summarize(entries) {
	const totals = {
		tests: entries.length,
		passed: 0,
		failed: 0,
		skipped: 0,
		other: 0,
		calls: 0,
		callsWithIssues: 0,
	}
	const byProvider = new Map()
	const tests = []
	const callFindings = []

	for (const entry of entries) {
		const provider = typeof entry.provider === 'string' ? entry.provider : 'unknown'
		const status = typeof entry.status === 'string' ? entry.status : 'unknown'
		const title = typeof entry.test === 'string' ? entry.test : '<unknown test>'
		const calls = toArray(entry.calls).filter(isRecord)
		const issues = calls.filter(callHasIssue)

		totals.calls += calls.length
		totals.callsWithIssues += issues.length
		if (status === 'passed') totals.passed += 1
		else if (status === 'failed' || status === 'timedOut' || status === 'interrupted') totals.failed += 1
		else if (status === 'skipped') totals.skipped += 1
		else totals.other += 1

		const providerStat = byProvider.get(provider) ?? {
			provider,
			tests: 0,
			passed: 0,
			failed: 0,
			skipped: 0,
			other: 0,
			calls: 0,
			callsWithIssues: 0,
		}
		providerStat.tests += 1
		providerStat.calls += calls.length
		providerStat.callsWithIssues += issues.length
		if (status === 'passed') providerStat.passed += 1
		else if (status === 'failed' || status === 'timedOut' || status === 'interrupted') providerStat.failed += 1
		else if (status === 'skipped') providerStat.skipped += 1
		else providerStat.other += 1
		byProvider.set(provider, providerStat)

		tests.push({ title, provider, status, calls: calls.length, callsWithIssues: issues.length })

		for (const call of issues) {
			const detail = [
				`phase=${call.phase ?? 'unknown'}`,
				`method=${call.method ?? 'UNKNOWN'}`,
				`path=${call.path ?? 'unknown'}`,
				`status=${typeof call.status === 'number' ? call.status : 'n/a'}`,
			]
			if (typeof call.normalizedCode === 'string') detail.push(`normalized=${call.normalizedCode}`)
			if (typeof call.errorCode === 'string') detail.push(`error=${call.errorCode}`)
			if (typeof call.errorsCount === 'number') detail.push(`errors=${call.errorsCount}`)
			if (typeof call.warningsCount === 'number') detail.push(`warnings=${call.warningsCount}`)
			callFindings.push({ title, provider, status, detail: detail.join(', ') })
		}
	}

	return {
		totals,
		providers: Array.from(byProvider.values()).sort((a, b) => a.provider.localeCompare(b.provider)),
		tests,
		callFindings,
	}
}

function renderMarkdown(sourcePath, summary) {
	const generatedAt = new Date().toISOString()
	const lines = [
		'# Bucket Policy Live Summary',
		'',
		`- Generated: ${generatedAt}`,
		`- Source: ${sourcePath}`,
		'',
		'## Totals',
		'',
		'| tests | passed | failed | skipped | other | calls | calls_with_issues |',
		'| --- | --- | --- | --- | --- | --- | --- |',
		`| ${summary.totals.tests} | ${summary.totals.passed} | ${summary.totals.failed} | ${summary.totals.skipped} | ${summary.totals.other} | ${summary.totals.calls} | ${summary.totals.callsWithIssues} |`,
		'',
		'## By Provider',
		'',
		'| provider | tests | passed | failed | skipped | other | calls | calls_with_issues |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |',
	]

	for (const row of summary.providers) {
		lines.push(`| ${escapeCell(row.provider)} | ${row.tests} | ${row.passed} | ${row.failed} | ${row.skipped} | ${row.other} | ${row.calls} | ${row.callsWithIssues} |`)
	}
	if (summary.providers.length === 0) lines.push('| (none) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |')

	lines.push('', '## Tests', '', '| test | provider | status | calls | calls_with_issues |', '| --- | --- | --- | --- | --- |')
	for (const row of summary.tests) {
		lines.push(`| ${escapeCell(row.title)} | ${escapeCell(row.provider)} | ${escapeCell(row.status)} | ${row.calls} | ${row.callsWithIssues} |`)
	}
	if (summary.tests.length === 0) lines.push('| (none) | - | - | 0 | 0 |')

	lines.push('', '## Call Findings', '')
	if (summary.callFindings.length === 0) {
		lines.push('- No call-level issues found')
	} else {
		for (const finding of summary.callFindings) {
			lines.push(`- [${escapeCell(finding.status)}] ${escapeCell(finding.provider)} :: ${escapeCell(finding.title)} :: ${escapeCell(finding.detail)}`)
		}
	}
	lines.push('')
	return `${lines.join('\n')}\n`
}

const [, , sourceArg, outputArg] = process.argv
const sourcePath = path.resolve(process.cwd(), sourceArg)
const outputPath = path.resolve(process.cwd(), outputArg)
const markdown = renderMarkdown(sourcePath, summarize(readEntries(sourcePath)))
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, markdown, 'utf8')
process.stdout.write(markdown)
