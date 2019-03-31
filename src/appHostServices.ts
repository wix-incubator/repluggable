import { EntryPoint, Shell, SlotKey, AppHost } from './API'

export interface AppHostAPI {
    // TODO: move here all utility functions from AppHost
}

export const AppHostAPI: SlotKey<AppHostAPI> = { name: "AppHost API", public: true }

export type AppHostServicesProvider = { 
    getAppHostServicesShell(): Shell
}

export function createAppHostServicesEntryPoint(apiFactory: () => AppHostAPI): EntryPoint & AppHostServicesProvider {
    let cachedShell: Shell | null = null;

    return {
        name: 'APP-HOST-SERVICES',

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
