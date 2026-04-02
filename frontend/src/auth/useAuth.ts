import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'

export type AuthContextValue = {
	apiToken: string
	setApiToken: Dispatch<SetStateAction<string>>
	clearApiToken: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
	const value = useContext(AuthContext)
	if (!value) {
		throw new Error('useAuth must be used within AuthProvider')
	}
	return value
}
