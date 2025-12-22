import type { UIAction, UIActionOrDivider } from './objectsActions'
import { ObjectsSelectionBarContent } from './ObjectsSelectionBarContent'

type ObjectsSelectionBarProps = {
	selectedCount: number
	singleSelectedKey: string | null
	singleSelectedSize?: number
	isAdvanced: boolean
	clearAction?: UIAction
	deleteAction?: UIAction
	downloadAction?: UIAction
	selectionMenuActions: UIActionOrDivider[]
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	isDownloadLoading: boolean
	isDeleteLoading: boolean
}

export function ObjectsSelectionBar(props: ObjectsSelectionBarProps) {
	if (props.selectedCount <= 0) return null

	return (
		<ObjectsSelectionBarContent
			selectedCount={props.selectedCount}
			singleSelectedKey={props.singleSelectedKey}
			singleSelectedSize={props.singleSelectedSize}
			isAdvanced={props.isAdvanced}
			clearAction={props.clearAction}
			deleteAction={props.deleteAction}
			downloadAction={props.downloadAction}
			selectionMenuActions={props.selectionMenuActions}
			getObjectActions={props.getObjectActions}
			isDownloadLoading={props.isDownloadLoading}
			isDeleteLoading={props.isDeleteLoading}
		/>
	)
}
