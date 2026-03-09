import { useQuery } from '@tanstack/react-query'
import { Grid, Typography } from 'antd'

import { APIClient } from '../api/client'
import type { Profile } from '../api/types'
import { NativeSelect } from './NativeSelect'
import styles from './TopBarProfileSelect.module.css'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (profileId: string | null) => void
	showLabel?: boolean
	fullWidth?: boolean
	selectWidth?: number | string
	className?: string
}

export function TopBarProfileSelect(props: Props) {
	const screens = Grid.useBreakpoint()
	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: async () => {
			const api = new APIClient({ apiToken: props.apiToken })
			return api.listProfiles()
		},
		retry: false,
	})

	const options = (profilesQuery.data ?? []).map((p: Profile) => ({ label: p.name, value: p.id }))
	const showLabel = props.showLabel ?? !!screens.sm
	const selectWidth = props.selectWidth ?? (props.fullWidth ? '100%' : screens.md ? 260 : screens.sm ? 200 : 160)
	const isInitialLoad = profilesQuery.isFetching && !profilesQuery.data

	return (
		<div
			className={[styles.root, props.fullWidth ? styles.fullWidth : '', props.className ?? ''].filter(Boolean).join(' ')}
			data-testid="topbar-profile-select"
		>
			{showLabel ? (
				<Typography.Text type="secondary" className={styles.label}>
					Profile
				</Typography.Text>
			) : null}
			<NativeSelect
				value={props.profileId ?? ''}
				onChange={(value) => props.setProfileId(value || null)}
				placeholder={isInitialLoad ? 'Loading profiles…' : 'Select profile…'}
				disabled={isInitialLoad}
				options={options}
				ariaLabel="Profile"
				className={styles.selectControl}
				style={{ width: selectWidth, maxWidth: '100%' }}
			/>
		</div>
	)
}
