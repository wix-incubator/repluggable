import { RepluggableAppDebugInfo } from './types'

declare global {
    // Have to use var is this variable reassigned in the global scope
    var repluggableAppDebug: RepluggableAppDebugInfo
}


