import { UploadsPageShell } from './UploadsPageShell'
import { useUploadsPageCompositionState } from './useUploadsPageCompositionState'

type Props = {
	apiToken: string
	profileId: string
}

export function UploadsPageExperience(props: Props) {
	const composition = useUploadsPageCompositionState(props)

	return <UploadsPageShell presentation={composition.presentation} />
}
