import { EntryPoint, AnySlotKey, SlotKey } from '../API'
import { Hot } from '../hot'
import { RepluggableAppDebugInfo } from './types'

declare global {
    // Have to use var is this variable reassigned in the global scope
    var repluggableAppDebug: RepluggableAppDebugInfo
}


export interface RepluggableDebugUtils {
    apis(): APIDebugInfo[]
    unReadyEntryPoints(): EntryPoint[]
    getRootUnreadyAPI(): SlotKey<any>[]
    whyEntryPointUnready(name: string): void
    findAPI(name: string): APIDebugInfo[]
}

export interface RepluggableHMR {
    hot: Hot
}

export interface APIDebugInfo {
    key: AnySlotKey
    impl(): any
}
