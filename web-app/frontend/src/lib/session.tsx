import { createContext, useContext } from 'react'
import type { ThemeChoice, User, Workspace } from './types'

interface SessionValue {
  user: User;
  workspace: Workspace;
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
}

const SessionContext = createContext<SessionValue | null>(null)

export const SessionProvider = SessionContext.Provider

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Session context is unavailable')
  return value
}
