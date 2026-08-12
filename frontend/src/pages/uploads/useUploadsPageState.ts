import { useAPIClient } from '../../api/useAPIClient'
import { useTransfersCommands } from '../../components/useTransfers'
import { useIsOffline } from '../../lib/useIsOffline'
import { useUploadsPageControllerState } from './useUploadsPageControllerState'

type UseUploadsPageStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useUploadsPageState(props: UseUploadsPageStateArgs) {
	const api = useAPIClient()
	const transfers = useTransfersCommands()
	const isOffline = useIsOffline()

	return useUploadsPageControllerState({
		api,
		transfers,
		isOffline,
		apiToken: props.apiToken,
		profileId: props.profileId,
	})
}

export type UploadsPageState = ReturnType<typeof useUploadsPageState>
