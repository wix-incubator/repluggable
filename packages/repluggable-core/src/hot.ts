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
export function hot(sourceModule: any, entryPoints: EntryPoint[], host?: AppHost) {
    if (!sourceModule.hot) {
        return entryPoints
    }

    const getHostInstance = () => {
        const hostInstance = host ?? globalThis.repluggableAppDebug?.host
        if (!hostInstance) {
            console.error(
                `HMR error: cannot find host object.\n` +
                    `hot(...) was called without the optional host parameter, and the fallback globalThis.repluggableAppDebug.host doesn't exist`
            )
        }

        return hostInstance
    }

    const shellNames = entryPoints.map(x => x.name)
    const shortModuleId = sourceModule.id.split('/').pop()

    sourceModule.hot.accept()
    sourceModule.hot.dispose(async () => {
        const hostInstance = getHostInstance()
        if (hostInstance) {
            console.debug(`----- HMR[${shortModuleId}] > REMOVING SHELLS >`, shellNames)
            await hostInstance.removeShells(shellNames)
        }
    })

    if (sourceModule.hot.status() === 'apply') {
        const hostInstance = getHostInstance()
        if (hostInstance) {
            console.debug(`----- HMR[${shortModuleId}] > ADDING SHELLS >`, shellNames)
            hostInstance.addShells(entryPoints)
        }
    }

    return entryPoints
}
