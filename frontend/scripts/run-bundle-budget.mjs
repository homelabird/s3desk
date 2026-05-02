import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const distDir = path.join(rootDir, 'dist')
const analyzeLogPath = path.join(distDir, 'build-analyze.log')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const nodeBin = process.execPath

await mkdir(distDir, { recursive: true })

const buildResult = spawnSync(npmBin, ['run', 'build:analyze'], {
	cwd: rootDir,
	encoding: 'utf8',
})

const buildOutput = `${buildResult.stdout ?? ''}${buildResult.stderr ?? ''}`
process.stdout.write(buildOutput)
await writeFile(analyzeLogPath, buildOutput, 'utf8')

if (buildResult.status !== 0) {
	process.exit(buildResult.status ?? 1)
}

if (buildOutput.includes('Circular chunk:')) {
	console.error('circular chunk warning detected in bundle build')
	process.exit(1)
}

const reportResult = spawnSync(nodeBin, [path.resolve(rootDir, '..', 'scripts', 'bundle_report.js'), '--fail'], {
	cwd: rootDir,
	stdio: 'inherit',
})

if (reportResult.status !== 0) {
	process.exit(reportResult.status ?? 1)
}
