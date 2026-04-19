import { useLocation } from 'react-router-dom'

import { useAPIClient } from './api/useAPIClient'
import { useAuth } from './auth/useAuth'
import { FullAppBootstrapGate } from './FullAppBootstrapGate'
import { FullAppContentHost } from './FullAppContentHost'
import { FullAppOverlaysHost } from './FullAppOverlaysHost'
import { TransfersProvider } from './components/TransfersShell'
import { useFullAppController } from './useFullAppController'
import { useThemeMode } from './useThemeMode'
import { FullAppShellChrome } from './FullAppShellChrome'
import { useFullAppViewportState } from './useFullAppViewportState'

export default function FullAppInner() {
	const location = useLocation()
	const viewport = useFullAppViewportState()
	const theme = useThemeMode()

	const { apiToken, setApiToken } = useAuth()
	const api = useAPIClient()
	const controller = useFullAppController({
		api,
		apiToken,
		setApiToken,
		pathname: location.pathname,
		routeLocationKey: location.key,
		theme,
		viewport,
	})

	return (
		<FullAppBootstrapGate {...controller.bootstrap}>
			<TransfersProvider
				key={controller.transfers.providerKey}
				apiToken={controller.transfers.apiToken}
				uploadDirectStream={controller.transfers.uploadDirectStream}
				uploadCapabilityByProfileId={controller.transfers.uploadCapabilityByProfileId}
			>
				<>
					<FullAppShellChrome {...controller.chrome}>
						<FullAppContentHost {...controller.routes} />
					</FullAppShellChrome>
					<FullAppOverlaysHost {...controller.overlays} />
				</>
			</TransfersProvider>
		</FullAppBootstrapGate>
	)
}
