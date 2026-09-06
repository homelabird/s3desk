import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'

import { UploadsDraftProvider, useUploadsDraft } from '../UploadsDraftContext'

function DraftPage() {
	const { selectedFiles, setSelectedFiles } = useUploadsDraft()
	return <>
		<button onClick={() => setSelectedFiles([new File(['a'], 'alpha.txt')])}>Select file</button>
		<span>{selectedFiles.map(file => file.name).join(',')}</span>
	</>
}

function OtherPage() {
	const [text, setText] = useState('')
	return <input aria-label="Other page draft" value={text} onChange={event => setText(event.target.value)} />
}

it('keeps files across page mounts and resets only upload state on a scope change', () => {
	const view = (scopeKey: string, showUpload = true) => <UploadsDraftProvider scopeKey={scopeKey}>
		<OtherPage />
		{showUpload ? <DraftPage /> : null}
	</UploadsDraftProvider>
	const { rerender } = render(view('profile-a'))
	fireEvent.click(screen.getByRole('button', { name: 'Select file' }))
	fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep this edit' } })
	rerender(view('profile-a', false))
	rerender(view('profile-a'))
	expect(screen.getByText('alpha.txt')).toBeInTheDocument()
	rerender(view('profile-b'))
	expect(screen.queryByText('alpha.txt')).not.toBeInTheDocument()
	expect(screen.getByRole('textbox')).toHaveValue('keep this edit')
})
