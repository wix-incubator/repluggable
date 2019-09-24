import { createContext } from 'react'
import { ReactReduxContextValue } from 'react-redux'

export const StoreContext = createContext<ReactReduxContextValue | null>(null) as React.Context<ReactReduxContextValue>
