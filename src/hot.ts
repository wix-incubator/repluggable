import { EntryPoint } from './API'

interface ModuleEntry {
    oldShellNames: string[]
    newEntryPoints?: EntryPoint[]
}

const moduleById: Record<string, ModuleEntry> = {}

function getOrAddModuleEntry(moduleId: string, lastKnownEntryPoints: EntryPoint[]): ModuleEntry {
    const existingEntry = moduleById[moduleId]
    if (existingEntry) {
        return existingEntry
    }
    const newEntry: ModuleEntry = {
        oldShellNames: lastKnownEntryPoints.map(ep => ep.name),
        newEntryPoints: undefined
    }
    moduleById[moduleId] = newEntry
    return newEntry
}

export const hot = (sourceModule: any, entryPoints: EntryPoint[]): EntryPoint[] => {
    if (!sourceModule.hot) {
        return entryPoints // not a dev environment
    }

    const urlParams = new URLSearchParams(window.location.search)
    if (!urlParams.has('enableHMR')) {
        return entryPoints
    }

    const shortModuleId = sourceModule.id.split('/').pop()
    console.debug(
        `----- HMR[${shortModuleId}] > ENTER`,
        entryPoints.map(ep => ep.name)
    )
    getOrAddModuleEntry(sourceModule.id, entryPoints).newEntryPoints = entryPoints

    if (sourceModule.hot) {
        sourceModule.hot.accept()

        if (sourceModule.hot.addStatusHandler && sourceModule.hot.status() === 'idle') {
            console.debug(`---- HMR[${shortModuleId}] > ADD STATUS HANDLER`)

            sourceModule.hot.addStatusHandler(async (status: string) => {
                console.debug(`-------- HMR[${shortModuleId}] > statusHandler(${status})`)
                if (status === 'apply') {
                    setTimeout(async () => {
                        const entry = getOrAddModuleEntry(sourceModule.id, entryPoints)
                        if (entry.newEntryPoints) {
                            console.debug(`----- HMR[${shortModuleId}] > REMOVING SHELLS >`, entry.oldShellNames)

                            await window.repluggableAppDebug.host.removeShells(entry.oldShellNames)

                            console.debug(
                                `----- HMR[${shortModuleId}] > ADDING SHELLS >`,
                                entry.newEntryPoints.map(ep => ep.name)
                            )

                            window.repluggableAppDebug.host.addShells(entry.newEntryPoints)
                            entry.oldShellNames = entry.newEntryPoints.map(ep => ep.name)
                            entry.newEntryPoints = undefined
                        }
                    })
                }
            })
        }
    }

    return entryPoints
}
