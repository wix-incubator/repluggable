import { EntryPoint } from './API'

export const hot = (sourceModule: NodeModule, entryPoints: EntryPoint[]): EntryPoint[] => {
    if (!sourceModule.hot) {
        return entryPoints
    }

    const urlParams = new URLSearchParams(window.location.search)
    if (!urlParams.has('enableHMR')) {
        return entryPoints
    }

    const shortModuleId = sourceModule.id.split('/').pop()

    sourceModule.hot.accept()
    sourceModule.hot.dispose(() => {
        const oldShellNames = entryPoints.map(x => x.name)
        console.debug(`----- HMR[${shortModuleId}] > REMOVING SHELLS >`, oldShellNames)
        return window.repluggableAppDebug.host.removeShells(oldShellNames)
    })

    if (sourceModule.hot.status() === 'apply') {
        console.debug(
            `----- HMR[${shortModuleId}] > ADDING SHELLS >`,
            entryPoints.map(x => x.name)
        )
        window.repluggableAppDebug.host.addShells(entryPoints)
    }

    return entryPoints
}
