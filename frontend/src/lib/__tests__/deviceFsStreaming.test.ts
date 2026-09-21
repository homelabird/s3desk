// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { writeResponseToFile } from '../deviceFs'

function sink() {
	const write = vi.fn().mockResolvedValue(undefined)
	const close = vi.fn().mockResolvedValue(undefined)
	const abort = vi.fn().mockResolvedValue(undefined)
	const createWritable = vi.fn().mockResolvedValue({ write, close, abort })
	return { fileHandle: { createWritable } as unknown as FileSystemFileHandle, createWritable, write, close, abort }
}

describe('device file streaming', () => {
	it('commits only a complete stream', async () => {
		const s = sink()
		await writeResponseToFile({ response: new Response('abc', { headers: { 'content-length': '3' } }), fileHandle: s.fileHandle })
		expect(s.write).toHaveBeenCalled()
		expect(s.close).toHaveBeenCalledOnce()
		expect(s.abort).not.toHaveBeenCalled()
	})
	it('rolls back a truncated body without claiming completion', async () => {
		const s = sink()
		await expect(writeResponseToFile({ response: new Response('abc', { headers: { 'content-length': '10' } }), fileHandle: s.fileHandle })).rejects.toThrow('expected')
		expect(s.close).not.toHaveBeenCalled()
		expect(s.abort).toHaveBeenCalledOnce()
	})
	it('does not open the file when already canceled', async () => {
		const s = sink(), controller = new AbortController()
		controller.abort()
		await expect(writeResponseToFile({ response: new Response('abc'), fileHandle: s.fileHandle, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
		expect(s.createWritable).not.toHaveBeenCalled()
	})
	it('cancels a stalled network reader when the transfer is canceled', async () => {
		const s = sink(), controller = new AbortController(), cancel = vi.fn()
		const response = new Response(new ReadableStream({ cancel }))
		const work = writeResponseToFile({ response, fileHandle: s.fileHandle, signal: controller.signal })
		await Promise.resolve()
		controller.abort()
		await expect(work).rejects.toMatchObject({ name: 'AbortError' })
		expect(cancel).toHaveBeenCalledOnce()
		expect(s.abort).toHaveBeenCalledOnce()
		expect(s.close).not.toHaveBeenCalled()
	})
})
