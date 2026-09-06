import { createContext, useContext, useState, type PropsWithChildren } from 'react'

function useDraftState() {
	const [selectedFiles, setSelectedFiles] = useState<File[]>([])
	const [selectedFolderLabel, setSelectedFolderLabel] = useState('')
	const [selectedDirectorySelectionMode, setSelectedDirectorySelectionMode] = useState<'picker' | 'input' | undefined>(undefined)
	return { selectedFiles, setSelectedFiles, selectedFolderLabel, setSelectedFolderLabel, selectedDirectorySelectionMode, setSelectedDirectorySelectionMode }
}

const UploadsDraftContext = createContext<ReturnType<typeof useDraftState> | null>(null)

export function UploadsDraftProvider({ children, scopeKey }: PropsWithChildren<{ scopeKey: string }>) {
	const draft = useDraftState()
	const [previousScope, setPreviousScope] = useState(scopeKey)
	if (previousScope !== scopeKey) {
		setPreviousScope(scopeKey)
		draft.setSelectedFiles([])
		draft.setSelectedFolderLabel('')
		draft.setSelectedDirectorySelectionMode(undefined)
	}
	return <UploadsDraftContext value={draft}>{children}</UploadsDraftContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUploadsDraft() {
	const draft = useContext(UploadsDraftContext)
	if (!draft) throw new Error('UploadsDraftProvider is required')
	return draft
}
