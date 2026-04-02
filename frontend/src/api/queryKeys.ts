export const queryKeys = {
	server: {
		meta: (apiToken: string) => ['server', 'meta', apiToken] as const,
	},
	profiles: {
		list: (apiToken: string) => ['profiles', 'list', apiToken] as const,
		tls: (profileId: string | null | undefined, apiToken: string) => ['profiles', 'tls', profileId ?? 'none', apiToken] as const,
	},
}
