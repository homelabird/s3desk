export const hasPendingAction = (...flags: Array<boolean | null | undefined>): boolean => flags.some((flag) => flag === true)

export function runIfActionIdle<T>(blocked: boolean, action: () => T): T | undefined {
	if (blocked) return undefined
	return action()
}
