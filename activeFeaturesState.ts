import { Action, AnyAction } from 'redux';
import { EditorStateBlock } from './api';

export interface FeatureToggleSet {
    [name: string]: boolean;
}

export interface ActiveFeaturesState {
    readonly activeFeatures: FeatureToggleSet;
}

export interface UpdateActiveFeaturesAction extends Action { 
    readonly updates: FeatureToggleSet;
};

const UPDATE_ACTIVE_FEATURES_ACTION = '$activeFeatures/update';

export const contributeActiveFeaturesState = (): EditorStateBlock => {
    return {
        name: '$activeFeatures',
        reducer: activeFeaturesReducer
    };
}

const selectRootState = (state: any): ActiveFeaturesState => state.$activeFeatures;

export const ActiveFeaturesSelectors = {
    getActiveFeatureSet(state: any): FeatureToggleSet {
        return selectRootState(state).activeFeatures;
    }
}

export const ActiveFeaturesActions = {
    updateActiveFeatures: (updates: FeatureToggleSet): UpdateActiveFeaturesAction => {
        return {
            type: UPDATE_ACTIVE_FEATURES_ACTION,
            updates
        };
    },
}

const toggleActiveFeatures = (currentlyActive: FeatureToggleSet, updates: FeatureToggleSet): FeatureToggleSet => {
    let activeFeatureNames = new Set<string>(Object.keys(currentlyActive));

    for (let name in updates)
    {
        if (updates[name] === true) {
            activeFeatureNames.add(name);
        } else {
            activeFeatureNames.delete(name);
        }
    }

    return Array
        .from(activeFeatureNames)
        .reduce<FeatureToggleSet>(
            (result: FeatureToggleSet, name: string) => {
                result[name] = true;
                return result;
            }, 
            {}
        );
}

export const activeFeaturesReducer = (state: ActiveFeaturesState = { activeFeatures: {} }, action: AnyAction): ActiveFeaturesState => {
    switch (action.type) {
        case UPDATE_ACTIVE_FEATURES_ACTION:
            return {
                ...state,
                activeFeatures: toggleActiveFeatures(state.activeFeatures, action.updates)
            };
            break;
    }

    return state;
}
