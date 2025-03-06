import { AppHostOptions, EntryPoint, Shell, SlotKey } from './API'

export interface AppHostAPI {
    getAllEntryPoints(): EntryPoint[]
    getAppHostOptions(): AppHostOptions
}

export const AppHostServicesEntryPointName = 'APP-HOST-SERVICES'

export const AppHostAPI: SlotKey<AppHostAPI> = {
    name: 'AppHost API',
    public: true
}

export interface AppHostServicesProvider {
    getAppHostServicesShell(): Shell
}

export function createAppHostServicesEntryPoint(apiFactory: () => AppHostAPI): EntryPoint & AppHostServicesProvider {
    let cachedShell: Shell | null = null

    return {
        name: AppHostServicesEntryPointName,

        declareAPIs() {
            return [AppHostAPI]
        },

        attach(shell: Shell) {
            cachedShell = shell
            shell.contributeAPI(AppHostAPI, apiFactory)
        },

        getAppHostServicesShell() {
            if (cachedShell) {
                return cachedShell
            }

            throw new Error('Shell for AppHostServices entry point was not yet created')
        }
    }
}
