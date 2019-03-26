import { createContext } from 'react'
import { Shell } from './api'

type ShellContext = Shell

export const ShellContext = createContext<ShellContext | null>(null) as React.Context<ShellContext>
