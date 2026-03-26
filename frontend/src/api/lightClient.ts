import { getApiBaseUrl, normalizeApiBaseUrl } from './baseUrl'
import { createAPIClientTransport } from './clientTransport'
import * as profilesDomain from './domains/profiles'
import * as serverDomain from './domains/server'

export function createLightAPIClient(args: { baseUrl?: string; apiToken?: string } = {}) {
	const baseUrl = normalizeApiBaseUrl(args.baseUrl ?? getApiBaseUrl())
	const apiToken = args.apiToken ?? ''
	const transport = createAPIClientTransport({
		getBaseUrl: () => baseUrl,
		getApiToken: () => apiToken,
		getDefaultOptions: () => ({}),
	})

	return {
		server: {
			getMeta: () => serverDomain.getMeta(transport.request),
		},
		profiles: {
			listProfiles: () => profilesDomain.listProfiles(transport.request),
		},
	}
}
