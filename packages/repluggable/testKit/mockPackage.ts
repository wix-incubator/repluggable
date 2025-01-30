import _ from 'lodash'

import { AnyAction } from 'redux'
import { EntryPoint, Shell, SlotKey } from '../src/API'

export interface MockAPI {
    stubTrue(): boolean
    getNewObject(): object
}

export interface MockPublicAPI {
    stubTrue(): boolean
}

export const MockAPI: SlotKey<MockAPI> = { name: 'mock API' }
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
