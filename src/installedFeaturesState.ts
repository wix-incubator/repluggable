import _ from 'lodash'
import { Action, AnyAction, ReducersMapObject } from 'redux'

export interface ShellToggleSet {
    [name: string]: boolean
}

export interface InstalledFeaturesState {
    readonly installedFeatures: ShellToggleSet
}

export interface UpdateInstalledFeaturesAction extends Action {
    readonly updates: ShellToggleSet
}

const UPDATE_INSTALLED_FEATURES_ACTION = '$installedFeatures/update'

export const contributeInstalledFeaturesState = (): ReducersMapObject => {
    return {
        $installedFeatures: installedFeaturesReducer
    }
}

const selectRootState = (state: any): InstalledFeaturesState => state.$installedFeatures

export const InstalledFeaturesSelectors = {
    getInstalledFeatureSet(state: any): ShellToggleSet {
        return selectRootState(state).installedFeatures
    }
}

export const InstalledFeaturesActions = {
    updateInstalledFeatures: (updates: ShellToggleSet): UpdateInstalledFeaturesAction => {
        return {
            type: UPDATE_INSTALLED_FEATURES_ACTION,
            updates
        }
    }
}

const toggleInstalledFeatures = (currentlyInstalled: ShellToggleSet, updates: ShellToggleSet): ShellToggleSet =>
    _({})
        .assign(currentlyInstalled, updates)
        .pickBy(_.identity)
        .value()

export const installedFeaturesReducer = (
    state: InstalledFeaturesState = { installedFeatures: {} },
    action: AnyAction
): InstalledFeaturesState => {
    switch (action.type) {
        case UPDATE_INSTALLED_FEATURES_ACTION:
            return {
                ...state,
                installedFeatures: toggleInstalledFeatures(state.installedFeatures, action.updates)
            }
            break
    }

    return state
}
