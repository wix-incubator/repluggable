import {
    InstalledShellsActions,
    installedShellsReducer,
    InstalledShellsSelectors,
    InstalledShellsState,
    ShellToggleSet
} from '../src/installedShellsState'

const initialState: InstalledShellsState = {
    installedShells: {
        shellA: true,
        shellB: true
    }
}

const shellsToggleSet: ShellToggleSet = {
    shellB: false,
    shellC: true
}

const expectedState: InstalledShellsState = {
    installedShells: {
        shellA: true,
        shellC: true
    }
}

describe('Installed Shells State', () => {
    it('should toggle shells according to shell toggles', () => {
        const actualState = installedShellsReducer(initialState, InstalledShellsActions.updateInstalledShells(shellsToggleSet))

        expect(actualState).toEqual(expectedState)
    })

    it('should select installed shells from state', () => {
        const rootState = { $installedShells: initialState }
        expect(InstalledShellsSelectors.getInstalledShellsSet(rootState)).toEqual(initialState.installedShells)
    })
})
