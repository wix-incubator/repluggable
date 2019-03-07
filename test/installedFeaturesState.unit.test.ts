import {
    FeatureToggleSet,
    InstalledFeaturesActions,
    installedFeaturesReducer,
    InstalledFeaturesSelectors,
    InstalledFeaturesState
} from '../src/installedFeaturesState'

const initialState: InstalledFeaturesState = {
    installedFeatures: {
        featureA: true,
        featureB: true
    }
}

const featureToggleSet: FeatureToggleSet = {
    featureB: false,
    featureC: true
}

const expectedState: InstalledFeaturesState = {
    installedFeatures: {
        featureA: true,
        featureC: true
    }
}

describe('Installed Features State', () => {
    it('should toggle features according to feature toggles', () => {
        const actualState = installedFeaturesReducer(initialState, InstalledFeaturesActions.updateInstalledFeatures(featureToggleSet))

        expect(actualState).toEqual(expectedState)
    })

    it('should select active features from state', () => {
        const rootState = { $installedFeatures: initialState }
        expect(InstalledFeaturesSelectors.getInstalledFeatureSet(rootState)).toEqual(initialState.installedFeatures)
    })
})
