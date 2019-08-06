import { createAppHost, Shell, SlotKey } from '../src'
import { addMockShell, PactAPI } from './index'

export interface ShellMockOverride<T> {
    key: SlotKey<T>
    api(shell: Shell, api: T): T
}

export function createMockShellWithPacts(mocks: ShellMockOverride<any>[], pacts: { [key: string]: PactAPI<any> }): Shell {
    const apis: any = {}

    for (const pactKey of Object.keys(pacts)) {
        const pact = pacts[pactKey] as PactAPI<any>
        apis[pact.getAPIKey().name] = pact
    }

    const host = createAppHost([])
    const shell = addMockShell(host)
    shell.contributeAPI = <T>(key: SlotKey<T>, factory: () => T): T => {
        const api = factory()
        apis[key.name] = api
        return api
    }
    shell.getAPI = <T>(key: SlotKey<T>): T => {
        if (!apis[key.name]) {
            apis[key.name] = {}
        }
        return apis[key.name]
    }

    for (const { key } of mocks) {
        if (!apis[key.name]) {
            apis[key.name] = {}
        }
    }

    for (const { api, key } of mocks) {
        Object.assign(apis[key.name], api(shell, apis[key.name]))
    }

    return shell
}
