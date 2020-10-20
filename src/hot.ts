import { EntryPoint } from './API'

export const hot = (sourceModule: NodeModule, entryPoints: EntryPoint[]): EntryPoint[] => {
    if (!sourceModule.hot) {
        return entryPoints
    }

    sourceModule.hot.accept()
    sourceModule.hot.dispose(() => {
        const shortModuleId = sourceModule.id.split('/').pop()
        const oldShellNames = entryPoints.map(x => x.name)
        console.debug(`----- HMR[${shortModuleId}] > REMOVING SHELLS >`, oldShellNames)
        return window.repluggableAppDebug.host.removeShells(oldShellNames)
    })

    if (sourceModule.hot.status() === 'apply') {
        const shortModuleId = sourceModule.id.split('/').pop()
        console.debug(
            `----- HMR[${shortModuleId}] > ADDING SHELLS >`,
            entryPoints.map(x => x.name)
        )
        window.repluggableAppDebug.host.addShells(entryPoints)
    }

    return entryPoints
}
