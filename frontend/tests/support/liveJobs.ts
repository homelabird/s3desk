import { expect, type APIRequestContext } from '@playwright/test'

type WaitForLiveJobArgs = {
	headers: Record<string, string>
	jobId: string
	timeoutMs?: number
}

export async function waitForLiveJob(request: APIRequestContext, args: WaitForLiveJobArgs) {
	const timeoutMs = args.timeoutMs ?? 120_000
	let lastStatus = 'unknown'
	let terminalError: Error | null = null

	try {
		await expect
			.poll(
				async () => {
					if (terminalError) throw terminalError

					const res = await request.get(`/api/v1/jobs/${args.jobId}`, { headers: args.headers })
					if (!res.ok()) {
						terminalError = new Error(`job status request failed (${res.status()})`)
						throw terminalError
					}

					const job = (await res.json()) as { status?: string; error?: string | null }
					lastStatus = job.status ?? 'unknown'
					if (job.status === 'failed' || job.status === 'canceled') {
						const err = job.error ? `: ${job.error}` : ''
						terminalError = new Error(`job ${args.jobId} ${job.status}${err}`)
						throw terminalError
					}
					return job.status ?? 'unknown'
				},
				{
					intervals: [500, 1000, 2000],
					timeout: timeoutMs,
				},
			)
			.toBe('succeeded')
	} catch (error) {
		if (terminalError) throw terminalError
		throw new Error(`timed out waiting for job ${args.jobId} (last status: ${lastStatus})`, { cause: error })
	}
}
