import { AppHost, EntryPoint } from './API'

export type Hot = typeof hot

/**
 * To enable HMR, use the `hot` util to wrap the export of your repluggable package
 *
 * @param {NodeModule} sourceModule
 * @param {EntryPoint[]} entryPoints
 * @param {AppHost} [host] Optional. The AppHost to be used for removing / adding entrypoints. If not provided, `window.repluggableAppDebug.host` will be used,
 * @example ```ts
 * export default hot(module, [FooEntryPoint, BarEntryPoint])
 * ```
 */
export function hot(sourceModule: NodeModule, entryPoints: EntryPoint[], host?: AppHost) {
    if (!sourceModule.hot) {
        return entryPoints
    }

    const hostInstance = host ?? window.repluggableAppDebug?.host
    if (!hostInstance) {
        console.error(
            `HMR error: cannot find host object.\n` +
                `hot(...) was called without the optional host parameter, and the fallback window.repluggableAppDebug.host doesn't exist`
        )
        return entryPoints
    }

    const shellNames = entryPoints.map(x => x.name)
    const shortModuleId = sourceModule.id.split('/').pop()

    sourceModule.hot.accept()

    sourceModule.hot.dispose(() => {
        console.debug(`----- HMR[${shortModuleId}] > REMOVING SHELLS >`, shellNames)
        return hostInstance.removeShells(shellNames)
    })

    if (sourceModule.hot.status() === 'apply') {
        console.debug(`----- HMR[${shortModuleId}] > ADDING SHELLS >`, shellNames)
        hostInstance.addShells(entryPoints)
    }

    return entryPoints
}
