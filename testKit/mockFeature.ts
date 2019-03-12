import _ from 'lodash'

import { AnyAction } from 'redux'
import { FeatureHost, FeatureLifecycle, SlotKey } from '../src/api'

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

const createMockFeatureAPI = (host: FeatureHost): MockFeatureAPI => ({
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

export const mockFeature: FeatureLifecycle = {
    name: 'MOCK_FEATURE',
    install(host: FeatureHost) {
        host.contributeApi(MockFeatureAPI, () => createMockFeatureAPI(host))
        host.contributeState(() => ({
            [mockFeatureStateKey]: mockFeatureReducer
        }))
    }
}

export const mockFeatureWithPublicAPI: FeatureLifecycle = {
    name: 'MOCK_FEATURE_PUBLIC',
    install(host: FeatureHost) {
        host.contributeApi(MockFeaturePublicAPI, () => ({
            stubTrue: () => true
        }))
    }
}
