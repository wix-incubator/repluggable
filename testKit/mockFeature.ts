import _ from 'lodash'

import { AnyAction } from 'redux'
import { Shell, EntryPoint, SlotKey } from '../src/api'

export interface MockFeatureAPI {
    stubTrue(): boolean
}

export interface MockFeaturePublicAPI {
    stubTrue(): boolean
}

export const MockFeatureAPI: SlotKey<MockFeatureAPI> = { name: 'mock feature API' }
export const MockFeaturePublicAPI: SlotKey<MockFeaturePublicAPI> = {
    name: 'mock feature API public',
    public: true
}

const createMockFeatureAPI = (shell: Shell): MockFeatureAPI => ({
    stubTrue: _.stubTrue
})

interface MockFeatureState {
    mockValue: boolean
}

export const mockFeatureInitialState: MockFeatureState = {
    mockValue: true
}

const TOGGLE_MOCK_VALUE = 'mockFeature/mockAction'

const mockFeatureReducer = (state: MockFeatureState = mockFeatureInitialState, action: AnyAction): MockFeatureState => {
    switch (action.type) {
        case TOGGLE_MOCK_VALUE:
            return { ...state, mockValue: !state.mockValue }
    }
    return state
}

export const mockFeatureStateKey = 'mockFeature'

export const mockFeature: EntryPoint = {
    name: 'MOCK_FEATURE',
    declareApis() {
        return [MockFeatureAPI]
    },
    install(shell: Shell) {
        shell.contributeApi(MockFeatureAPI, () => createMockFeatureAPI(shell))
        shell.contributeState(() => ({
            [mockFeatureStateKey]: mockFeatureReducer
        }))
    }
}

export const mockFeatureWithPublicAPI: EntryPoint = {
    name: 'MOCK_FEATURE_PUBLIC',
    declareApis() {
        return [MockFeaturePublicAPI]
    },
    install(shell: Shell) {
        shell.contributeApi(MockFeaturePublicAPI, () => ({
            stubTrue: () => true
        }))
    }
}
