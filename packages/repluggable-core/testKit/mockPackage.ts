import _ from 'lodash'

import { AnyAction } from 'redux'
import { ColdEntryPoint, ColdShell, EntryPoint, Shell, SlotKey } from '../src/API'

export interface MockAPI {
    stubTrue(): boolean
    getNewObject(): object
}

export interface MockPublicAPI {
    stubTrue(): boolean
}

export const MockAPI: SlotKey<MockAPI> = { name: 'mock API' }
export const MockSlot: SlotKey<any> = { name: 'mock slot' }
export const MockPublicAPI: SlotKey<MockPublicAPI> = {
    name: 'mock API public',
    public: true
}

const createMockAPI = (shell: Shell): MockAPI => ({
    stubTrue: _.stubTrue,
    getNewObject: () => ({})
})

export interface MockState {
    mockValue: boolean
}

export const mockShellInitialState: MockState = {
    mockValue: true
}

export const TOGGLE_MOCK_VALUE = 'mockEntryPoint/mockAction'

const mockReducer = (state: MockState = mockShellInitialState, action: AnyAction): MockState => {
    switch (action.type) {
        case TOGGLE_MOCK_VALUE:
            return { ...state, mockValue: !state.mockValue }
    }
    return state
}

export const mockShellStateKey = 'mockEntryPoint'

export const mockPackage: EntryPoint = {
    name: 'MOCK_ENTRY_POINT',
    declareAPIs() {
        return [MockAPI]
    },
    attach(shell: Shell) {
        shell.contributeAPI(MockAPI, () => createMockAPI(shell))
        shell.contributeState(() => ({
            [mockShellStateKey]: mockReducer
        }))
    }
}

export const asyncLoadMockPackage: EntryPoint = {
    name: 'ASYNC_MOCK_ENTRY_POINT',
    declareAPIs() {
        return [MockAPI]
    },
    async extend(shell: Shell) {
        await new Promise<void>(resolve => {
            setTimeout(() => {
                shell.contributeAPI(MockAPI, () => createMockAPI(shell))
                resolve()
            }, 500)
        })
    }
}

export const dependsOnMockPackageEntryPoint: EntryPoint = {
    name: 'DEPENDS ON MOCK API',
    getDependencyAPIs() {
        return [MockAPI]
    },
    declareAPIs() {
        return [MockPublicAPI]
    },
    attach(shell: Shell) {
        shell.contributeAPI(MockPublicAPI, () => ({
            stubTrue: () => true
        }))
    }
}

export const mockPackageWithPublicAPI: EntryPoint = {
    name: 'MOCK_ENTRY_POINT_PUBLIC',
    declareAPIs() {
        return [MockPublicAPI]
    },
    attach(shell: Shell) {
        shell.contributeAPI(MockPublicAPI, () => ({
            stubTrue: () => true
        }))
    }
}

export const mockPackageWithSlot: EntryPoint = {
    name: 'MOCK_PACKAGE_WITH_SLOT',
    declareAPIs() {
        return []
    },
    attach(shell: Shell) {
        shell.declareSlot(MockSlot)
    }
}

export const mockPackageWithColdDependency: ColdEntryPoint = {
    name: 'MOCK_PACKAGE_WITH_COLD_DEPENDENCY',
    getColdDependencyAPIs() {
        return [MockAPI]
    },
    declareAPIs() {
        return [MockPublicAPI]
    },
    attachCold(shell: ColdShell) {
        shell.contributeAPI(MockPublicAPI, () => ({
            stubTrue: () => true
        }))
    }
}
