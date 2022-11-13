import { AppHost, EntryPoint, Shell } from '../src'
import _ from 'lodash'
import { createAppHost, renderInHost, withThrowOnError } from '../testKit'
import { ReactElement } from 'react'
import { AnyAction } from 'redux'

export const createMocks = (entryPoint: EntryPoint, moreEntryPoints: EntryPoint[] = []) => {
    let cachedShell: Shell | null = null
    const wrappedPackage: EntryPoint = {
        ...entryPoint,
        attach(shell) {
            _.invoke(entryPoint, 'attach', shell)
            cachedShell = shell
        }
    }

    const host = createAppHost([wrappedPackage, ...moreEntryPoints], withThrowOnError())
    const getShell = () => cachedShell as Shell

    return {
        host,
        shell: getShell(),
        renderInShellContext: (reactElement: ReactElement<any>) => renderInHost(reactElement, host, getShell())
    }
}

export const dispatchAndFlush = (action: AnyAction, { getStore }: AppHost) => {
    getStore().dispatch(action)
    getStore().flush()
}
