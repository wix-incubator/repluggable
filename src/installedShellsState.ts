import _ from 'lodash';
import { Action, AnyAction, ReducersMapObject } from 'redux';

export interface ShellToggleSet {
  [name: string]: boolean;
}

export interface InstalledShellsState {
  readonly installedShells: ShellToggleSet;
}

export interface UpdateInstalledShellsAction extends Action {
  readonly updates: ShellToggleSet;
}

const UPDATE_INSTALLED_SHELLS_ACTION = '$installedShells/update';

export const contributeInstalledShellsState = (): ReducersMapObject => {
  return {
    $installedShells: installedShellsReducer,
  };
};

const selectRootState = (state: any): InstalledShellsState =>
  state.$installedShells;

export const InstalledShellsSelectors = {
  getInstalledShellsSet(state: any): ShellToggleSet {
    return selectRootState(state).installedShells;
  },
};

export const InstalledShellsActions = {
  updateInstalledShells: (
    updates: ShellToggleSet,
  ): UpdateInstalledShellsAction => {
    return {
      type: UPDATE_INSTALLED_SHELLS_ACTION,
      updates,
    };
  },
};

const toggleInstalledShells = (
  currentlyInstalled: ShellToggleSet,
  updates: ShellToggleSet,
): ShellToggleSet =>
  _({})
    .assign(currentlyInstalled, updates)
    .pickBy(_.identity)
    .value();

export const installedShellsReducer = (
  state: InstalledShellsState = { installedShells: {} },
  action: AnyAction,
): InstalledShellsState => {
  switch (action.type) {
    case UPDATE_INSTALLED_SHELLS_ACTION:
      return {
        ...state,
        installedShells: toggleInstalledShells(
          state.installedShells,
          action.updates,
        ),
      };
  }

  return state;
};
