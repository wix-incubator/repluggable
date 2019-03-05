import {
    ActiveFeaturesActions,
    activeFeaturesReducer,
    ActiveFeaturesSelectors,
    ActiveFeaturesState,
    FeatureToggleSet
} from '../src/activeFeaturesState'

const initialState: ActiveFeaturesState = {
    activeFeatures: {
        featureA: true,
        featureB: true
    }
}

const featureToggleSet: FeatureToggleSet = {
    featureB: false,
    featureC: true
}

const expectedState: ActiveFeaturesState = {
    activeFeatures: {
        featureA: true,
        featureC: true
    }
}

describe('Installed Features State', () => {
    it('should toggle features according to feature toggles', () => {
        const actualState = activeFeaturesReducer(initialState, ActiveFeaturesActions.updateActiveFeatures(featureToggleSet))

        expect(actualState).toEqual(expectedState)
    })

    it('should select active features from state', () => {
        const rootState = { $activeFeatures: initialState }
        expect(ActiveFeaturesSelectors.getActiveFeatureSet(rootState)).toEqual(initialState.activeFeatures)
    })
})
