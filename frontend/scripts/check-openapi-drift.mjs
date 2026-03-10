import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const specPath = path.resolve(rootDir, '..', 'openapi.yml')
const currentPath = path.resolve(rootDir, 'src', 'api', 'openapi.ts')
const tempDir = await mkdtemp(path.join(os.tmpdir(), 's3desk-openapi-'))
const tempOut = path.join(tempDir, 'openapi.ts')

try {
	const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['openapi-typescript', specPath, '-o', tempOut], {
		cwd: rootDir,
		stdio: 'inherit',
	})
	if (result.status !== 0) {
		process.exit(result.status ?? 1)
	}

	const [current, generated] = await Promise.all([
		readFile(currentPath, 'utf8'),
		readFile(tempOut, 'utf8'),
	])

	if (current !== generated) {
		console.error('[openapi] generated frontend schema is out of date')
		console.error('[openapi] edit ../openapi.yml, then run: cd frontend && npm run gen:openapi')
		process.exit(1)
	}
} finally {
	await rm(tempDir, { recursive: true, force: true })
}
