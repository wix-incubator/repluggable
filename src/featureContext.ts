import { createContext } from 'react'
import { ExtensionSlot, SlotKey } from './api'

export interface ShellContext {
    readonly name: string
    getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    // readonly log: FeatureLogger; //TODO: define logging abstraction
}

export const ShellContext = createContext<ShellContext | null>(null) as React.Context<ShellContext>
