import { EntryPoint } from './API'
import { RepluggableAppDebugInfo } from './repluggableAppDebug/debug'

export type Hot = (sourceModule: NodeModule, entryPoints: EntryPoint[], repluggableAppDebugObject?: RepluggableAppDebugInfo) => EntryPoint[]

export const hot: Hot = (sourceModule, entryPoints, repluggableAppDebugObject) => {
    if (!sourceModule.hot) {
        return entryPoints
    }

    sourceModule.hot.accept()

    const debug = repluggableAppDebugObject ?? window.repluggableAppDebug
    const shellNames = entryPoints.map(x => x.name)
    const shortModuleId = sourceModule.id.split('/').pop()

    sourceModule.hot.dispose(() => {
        console.debug(`----- HMR[${shortModuleId}] > REMOVING SHELLS >`, shellNames)
        return debug.host.removeShells(shellNames)
    })

    if (sourceModule.hot.status() === 'apply') {
        console.debug(`----- HMR[${shortModuleId}] > ADDING SHELLS >`, shellNames)
        debug.host.addShells(entryPoints)
    }

    return entryPoints
}
