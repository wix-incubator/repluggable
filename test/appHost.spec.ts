import _ from 'lodash'

import { createAppHost, mainViewSlotKey, makeLazyEntryPoint, stateSlotKey } from '../src/appHost'

import { AnySlotKey, AppHost, EntryPoint, Shell, SlotKey } from '../src/API'
import {
    MockAPI,
    mockPackage,
    mockPackageWithPublicAPI,
    MockPublicAPI,
    mockShellInitialState,
    mockShellStateKey
} from '../testKit/mockPackage'

import { AppHostAPI } from '../src/appHostServices'
import { createCircularEntryPoints, createDirectCircularEntryPoints } from './appHost.mock'

const createHostWithDependantPackages = (DependencyAPI: AnySlotKey) => {
    const MockAPI2: SlotKey<{}> = { name: 'Mock-API-2' }
    const dependentPackage: EntryPoint[] = [
        {
            name: 'DEPENDENT_MOCK_ENTRY_POINT_1',
            getDependencyAPIs() {
                return [DependencyAPI]
            }
        },
        {
            name: 'DEPENDENT_MOCK_ENTRY_POINT_2',
            getDependencyAPIs() {
                return [DependencyAPI]
            },
            declareAPIs() {
                return [MockAPI2]
            },
            attach(shell: Shell) {
                shell.contributeAPI(MockAPI2, () => ({}))
            }
        }
    ]

    const deeplyDependentPackage: EntryPoint[] = [
        {
            name: 'DEPENDENT_MOCK_ENTRY_POINT_3',
            getDependencyAPIs() {
                return [MockAPI2]
            }
        }
    ]

    let getHelperShell: () => Shell = () => {
        throw new Error()
    }
    const helperEntryPoint: EntryPoint = {
        name: 'TEST_HELPER',
        declareAPIs() {
            return [DependencyAPI]
        },
        attach(shell: Shell) {
            getHelperShell = () => shell
        }
    }

    return {
        host: createAppHost([dependentPackage, deeplyDependentPackage, helperEntryPoint]),
        dependentPackage,
        deeplyDependentPackage,
        helperShell: getHelperShell()
    }
}

describe('App Host', () => {
    it('should create an app host', () => {
        const host = createAppHost([])
        expect(host).toBeInstanceOf(Object)
    })

    describe('Packages Installation', () => {
        it('should throw on direct circular API dependency (private keys)', () => {
            const circularPackages = createDirectCircularEntryPoints()
            expect(() => createAppHost(circularPackages)).toThrowError()
        })

        it('should throw on direct circular API dependency (public keys)', () => {
            const circularPackages = createDirectCircularEntryPoints(true)
            expect(() => createAppHost(circularPackages)).toThrowError()
        })
        it('should throw on circular API dependency (private keys)', () => {
            const circularPackages = createCircularEntryPoints()
            expect(() => createAppHost(circularPackages)).toThrowError()
        })

        it('should throw on circular API dependency (public keys)', () => {
            const circularPackages = createCircularEntryPoints(true)
            expect(() => createAppHost(circularPackages)).toThrowError()
        })

        it('should throw when dynamically adding a shell with circular dependency', () => {
            const circularPackages = createCircularEntryPoints(true)
            const nonCircular = circularPackages.slice(0, 3)
            const circularEP = _.last(circularPackages) as EntryPoint
            const host = createAppHost(nonCircular)

            expect(() => host.addShells([circularEP])).toThrow()
        })

        it('should install initial packages', async () => {
            const host = createAppHost([mockPackage])
            await new Promise(resolve => host.onShellsChanged(resolve))

            expect(host.hasShell(mockPackage.name)).toBe(true)
        })

        it('should install packages after initial installations', async () => {
            const host = createAppHost([])
            await new Promise(resolve => host.onShellsChanged(resolve))

            expect(host.hasShell(mockPackage.name)).toBe(false)

            host.addShells([mockPackage])
            await new Promise(resolve => host.onShellsChanged(resolve))

            expect(host.hasShell(mockPackage.name)).toBe(true)
        })

        it('should uninstall shell', async () => {
            const host = createAppHost([mockPackage])
            await new Promise(resolve => host.onShellsChanged(resolve))

            host.removeShells([mockPackage.name])
            await new Promise(resolve => host.onShellsChanged(resolve))

            expect(host.hasShell(mockPackage.name)).toBe(false)
        })

        it('should not install multiple shells with the same name', () => {
            expect(() => createAppHost([mockPackage, _.pick(mockPackage, 'name')])).toThrow()
        })

        it('should install lazy shells', async () => {
            const lazyEntryPoint = makeLazyEntryPoint(mockPackage.name, async () => mockPackage)
            const host = createAppHost([lazyEntryPoint])
            await new Promise(resolve =>
                host.onShellsChanged(shellNames => {
                    if (_.includes(shellNames, mockPackage.name)) {
                        resolve()
                    }
                })
            )

            expect(host.hasShell(lazyEntryPoint.name)).toBe(true)
        })
    })

    _.forEach(
        [
            {
                testCase: 'private API keys',
                dependencyAPI: MockAPI,
                providerPackage: mockPackage
            },
            {
                testCase: 'public API keys',
                dependencyAPI: { name: MockPublicAPI.name, public: true },
                providerPackage: mockPackageWithPublicAPI
            }
        ],
        ({ testCase, dependencyAPI, providerPackage }) => {
            describe(`Dependecy entry point installation (${testCase})`, () => {
                it('should not install dependent entry point until dependency is installed', async () => {
                    const { host, dependentPackage: dependentPackage } = createHostWithDependantPackages(dependencyAPI)
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)

                    host.addShells([providerPackage])
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(true)
                })

                it('should install all dependent entry points chain when dependencies are installed from entry point', async () => {
                    const { host, dependentPackage, deeplyDependentPackage: deeplyDependentPackage } = createHostWithDependantPackages(
                        dependencyAPI
                    )
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(false)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(false)

                    host.addShells([providerPackage])
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(true)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(true)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(true)
                })

                it('should install all dependent entry points chain when dependencies are installed outside of entry point', async () => {
                    const { host, dependentPackage, deeplyDependentPackage, helperShell: helperShell } = createHostWithDependantPackages(
                        dependencyAPI
                    )
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(false)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(false)

                    helperShell.contributeAPI(dependencyAPI, () => ({
                        stubTrue: () => true
                    }))
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(true)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(true)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(true)
                })

                it('should uninstall all dependent entry points chain when dependencies are uninstalled', async () => {
                    const { host, dependentPackage, deeplyDependentPackage } = createHostWithDependantPackages(dependencyAPI)
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    host.addShells([providerPackage])
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    host.removeShells([providerPackage.name])
                    await new Promise(resolve => host.onShellsChanged(resolve))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(false)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(false)
                })
            })
        }
    )

    describe('Host extension slots', () => {
        it('should have a state extension slot', () => {
            const host = createAppHost([])
            expect(host.getSlot(stateSlotKey)).toBeTruthy()
        })

        it('should have a main view extension slot', () => {
            const host = createAppHost([])
            expect(host.getSlot(mainViewSlotKey)).toBeTruthy()
        })

        it('should retrieve all slot keys', () => {
            const sortSlotKeys = (slotKeys: AnySlotKey[]) => _.sortBy(slotKeys, 'name')

            const host = createAppHost([mockPackage])

            const actual = sortSlotKeys(host.getAllSlotKeys())
            const expected = sortSlotKeys([AppHostAPI, mainViewSlotKey, stateSlotKey, MockAPI])

            expect(actual).toEqual(expected)
        })

        describe('private API slot key', () => {
            it('should equal itself', () => {
                const host = createAppHost([mockPackage])

                const API = host.getAPI(MockAPI)

                expect(API).toBeTruthy()
            })

            it('should not equal another key with same name', () => {
                const host = createAppHost([mockPackage])
                const fakeKey: SlotKey<MockAPI> = { name: MockAPI.name }

                expect(() => {
                    host.getAPI(fakeKey)
                }).toThrowError(new RegExp(MockAPI.name))
            })

            it('should not equal another key with same name that claims it is public', () => {
                const host = createAppHost([mockPackage])
                const fakeKey1: SlotKey<MockAPI> = {
                    name: MockAPI.name,
                    public: true
                }
                const fakeKey2: SlotKey<MockAPI> = {
                    name: MockAPI.name,
                    public: false
                }
                const fakeKey3: any = {
                    name: MockAPI.name,
                    public: 'zzz'
                }

                expect(() => host.getAPI(fakeKey1)).toThrowError(new RegExp(MockAPI.name))
                expect(() => host.getAPI(fakeKey2)).toThrowError(new RegExp(MockAPI.name))
                expect(() => host.getAPI(fakeKey3)).toThrowError(new RegExp(MockAPI.name))
            })
        })

        describe('public API slot key', () => {
            it('should equal itself', () => {
                const host = createAppHost([mockPackageWithPublicAPI])

                const API = host.getAPI(MockPublicAPI)

                expect(API).toBeTruthy()
            })

            it('should equal another key with same name that claims it is public', () => {
                const host = createAppHost([mockPackageWithPublicAPI])
                const anotherKey: SlotKey<MockAPI> = {
                    name: MockPublicAPI.name,
                    public: true
                }

                const API = host.getAPI(anotherKey)

                expect(API).toBeTruthy()
            })

            it('should not equal another key with same name than does not claim it is public', () => {
                const host = createAppHost([mockPackageWithPublicAPI])
                const anotherKey1: SlotKey<MockAPI> = {
                    name: MockPublicAPI.name
                }
                const anotherKey2: SlotKey<MockAPI> = {
                    name: MockPublicAPI.name,
                    public: false
                }
                const anotherKey3: any = {
                    name: MockPublicAPI.name,
                    public: 'zzz'
                }

                expect(() => host.getAPI(anotherKey1)).toThrowError(new RegExp(MockPublicAPI.name))
                expect(() => host.getAPI(anotherKey2)).toThrowError(new RegExp(MockPublicAPI.name))
                expect(() => host.getAPI(anotherKey3)).toThrowError(new RegExp(MockPublicAPI.name))
            })
        })
    })

    describe('Host State', () => {
        it('should have a store with initial state', () => {
            const host = createAppHost([])
            expect(host.getStore().getState()).toEqual({
                $installedShells: {
                    installedShells: {}
                }
            })
        })
    })

    describe('Entry Point Contributions', () => {
        it('should contribute API', () => {
            const host = createAppHost([mockPackage])
            expect(host.getAPI(MockAPI)).toBeTruthy()
        })

        it('should contribute API after initial installations', () => {
            const host = createAppHost([])
            expect(() => host.getAPI(MockAPI)).toThrow()

            host.addShells([mockPackage])
            expect(host.getAPI(MockAPI)).toBeTruthy()
        })

        it('should contribute state', () => {
            const getMockShellState = (host: AppHost) => _.get(host.getStore().getState(), [mockPackage.name, mockShellStateKey], null)

            const appHost = createAppHost([])
            expect(getMockShellState(appHost)).toBeNull()

            appHost.addShells([mockPackage])
            expect(getMockShellState(appHost)).toEqual(mockShellInitialState)
        })
    })

    describe('Entry Point Shell Scoping', () => {
        it('should be able to call an API declared in dependencies', () => {
            const entryPointThatCallsAPI: EntryPoint = {
                name: 'ENTRY_POINT_WITH_API_CALL',
                getDependencyAPIs() {
                    return [MockAPI]
                },
                extend(shell: Shell) {
                    shell.getAPI(MockAPI).stubTrue()
                }
            }
            const appHost = createAppHost([mockPackage])
            expect(() => appHost.addShells([entryPointThatCallsAPI])).not.toThrow()
        })

        it('should not be able to call an API not declared in dependencies', () => {
            const entryPointThatCallsAPI: EntryPoint = {
                name: 'ENTRY_POINT_WITH_API_CALL',
                extend(shell: Shell) {
                    shell.getAPI(MockAPI).stubTrue()
                }
            }
            const appHost = createAppHost([mockPackage])
            expect(() => appHost.addShells([entryPointThatCallsAPI])).toThrow()
        })

        it('should get scoped state', done => {
            const state = {}
            const MOCK_STATE_KEY = 'mockStateKey'
            const entryPointWithState: EntryPoint = {
                name: 'ENTRY_POINT_WITH_STATE',
                attach(shell: Shell) {
                    shell.contributeState(() => ({
                        [MOCK_STATE_KEY]: () => state
                    }))
                },
                extend(shell: Shell) {
                    expect(_.get(shell.getStore().getState(), MOCK_STATE_KEY)).toBe(state)
                    done()
                }
            }
            createAppHost([entryPointWithState])
        })

        it('should be able to uninstall own installed packages', () => {
            const packageThatInstallsAPackage: EntryPoint = {
                name: 'ENTRY_POINT_THAT_INSTALLS_A_PACKAGE',
                extend(shell: Shell) {
                    shell.addShells([mockPackage])
                    shell.removeShells([mockPackage.name])
                }
            }
            expect(() => createAppHost([packageThatInstallsAPackage])).not.toThrow()
        })

        it('should not be able to uninstall not own installed packages', () => {
            const packageThatTriesToUninstallAPackage: EntryPoint = {
                name: 'ENTRY_POINT_THAT_TRYIES_TO_UNINSTALL_A_PACKAGE',
                extend(shell: Shell) {
                    shell.removeShells([mockPackage.name])
                }
            }
            expect(() => createAppHost([mockPackage, packageThatTriesToUninstallAPackage])).toThrow()
        })
    })
})
