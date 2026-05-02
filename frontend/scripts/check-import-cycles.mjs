import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

const frontendRoot = path.resolve(import.meta.dirname, '..')
const srcRoot = path.join(frontendRoot, 'src')
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const ignoredDirectories = new Set(['__tests__', 'test'])
const ignoredFilePattern = /\.(test|spec|stories)\.[tj]sx?$/

function toRealPath(filePath) {
	return realpathSync(filePath)
}

function toRelativeSourcePath(filePath) {
	return path.relative(srcRoot, filePath).replaceAll(path.sep, '/')
}

function collectSourceFiles(directory) {
	const entries = readdirSync(directory, { withFileTypes: true })
	const files = []

	for (const entry of entries) {
		if (ignoredDirectories.has(entry.name)) continue

		const fullPath = path.join(directory, entry.name)
		if (entry.isDirectory()) {
			files.push(...collectSourceFiles(fullPath))
			continue
		}
		if (!entry.isFile()) continue
		if (!codeExtensions.has(path.extname(entry.name))) continue
		if (ignoredFilePattern.test(entry.name)) continue

		files.push(fullPath)
	}

	return files.sort()
}

function scriptKindFor(filePath) {
	if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
	if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX
	if (filePath.endsWith('.js')) return ts.ScriptKind.JS
	return ts.ScriptKind.TS
}

function importDeclarationHasRuntimeValue(node) {
	const clause = node.importClause
	if (!clause) return true
	if (clause.isTypeOnly) return false
	if (clause.name) return true

	const namedBindings = clause.namedBindings
	if (!namedBindings) return false
	if (ts.isNamespaceImport(namedBindings)) return true

	return namedBindings.elements.some((element) => !element.isTypeOnly)
}

function exportDeclarationHasRuntimeValue(node) {
	if (node.isTypeOnly) return false
	if (!node.exportClause) return true
	if (ts.isNamespaceExport(node.exportClause)) return true

	return node.exportClause.elements.some((element) => !element.isTypeOnly)
}

function resolveLocalCodeModule(fromFile, specifier, sourceFileSet) {
	if (!specifier.startsWith('.')) return null

	const basePath = path.resolve(path.dirname(fromFile), specifier)
	const requestedExtension = path.extname(basePath)
	if (requestedExtension && !codeExtensions.has(requestedExtension)) return null

	const candidates = []
	if (codeExtensions.has(requestedExtension)) {
		candidates.push(basePath)
	} else {
		for (const extension of codeExtensions) {
			candidates.push(`${basePath}${extension}`)
		}
		for (const extension of codeExtensions) {
			candidates.push(path.join(basePath, `index${extension}`))
		}
	}

	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue
		if (!statSync(candidate).isFile()) continue

		const realPath = toRealPath(candidate)
		if (sourceFileSet.has(realPath)) return realPath
	}

	return null
}

function collectRuntimeDependencies(filePath, sourceFileSet) {
	const source = readFileSync(filePath, 'utf8')
	const ast = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKindFor(filePath))
	const dependencies = []

	for (const statement of ast.statements) {
		if (
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			importDeclarationHasRuntimeValue(statement)
		) {
			const dependency = resolveLocalCodeModule(filePath, statement.moduleSpecifier.text, sourceFileSet)
			if (dependency) dependencies.push(dependency)
			continue
		}

		if (
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			exportDeclarationHasRuntimeValue(statement)
		) {
			const dependency = resolveLocalCodeModule(filePath, statement.moduleSpecifier.text, sourceFileSet)
			if (dependency) dependencies.push(dependency)
		}
	}

	return [...new Set(dependencies)]
}

function canonicalCycleKey(cycle) {
	const body = cycle.slice(0, -1).map(toRelativeSourcePath)
	let firstIndex = 0
	for (let index = 1; index < body.length; index += 1) {
		if (body[index] < body[firstIndex]) firstIndex = index
	}

	return [...body.slice(firstIndex), ...body.slice(0, firstIndex)].join(' -> ')
}

function findCycles(graph) {
	const visited = new Set()
	const active = new Set()
	const activeIndex = new Map()
	const stack = []
	const cycleKeys = new Set()
	const cycles = []

	function visit(filePath) {
		visited.add(filePath)
		active.add(filePath)
		activeIndex.set(filePath, stack.length)
		stack.push(filePath)

		for (const dependency of graph.get(filePath) ?? []) {
			if (!visited.has(dependency)) {
				visit(dependency)
				continue
			}
			if (!active.has(dependency)) continue

			const startIndex = activeIndex.get(dependency)
			if (startIndex === undefined) continue

			const cycle = [...stack.slice(startIndex), dependency]
			const key = canonicalCycleKey(cycle)
			if (cycleKeys.has(key)) continue

			cycleKeys.add(key)
			cycles.push(cycle)
		}

		stack.pop()
		activeIndex.delete(filePath)
		active.delete(filePath)
	}

	for (const filePath of graph.keys()) {
		if (!visited.has(filePath)) visit(filePath)
	}

	return cycles
}

const sourceFiles = collectSourceFiles(srcRoot).map(toRealPath)
const sourceFileSet = new Set(sourceFiles)
const graph = new Map()
let edgeCount = 0

for (const filePath of sourceFiles) {
	const dependencies = collectRuntimeDependencies(filePath, sourceFileSet)
	graph.set(filePath, dependencies)
	edgeCount += dependencies.length
}

const cycles = findCycles(graph)

if (cycles.length > 0) {
	console.error('[check:import-cycles] runtime import cycle(s) found:')
	for (const cycle of cycles.slice(0, 25)) {
		console.error(`- ${cycle.map(toRelativeSourcePath).join(' -> ')}`)
	}
	if (cycles.length > 25) {
		console.error(`... ${cycles.length - 25} more cycle(s) omitted`)
	}
	process.exit(1)
}

console.log(`[check:import-cycles] ok (${sourceFiles.length} files, ${edgeCount} runtime edges)`)
