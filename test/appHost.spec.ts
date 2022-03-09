import _ from 'lodash'

import { createAppHost, mainViewSlotKey, makeLazyEntryPoint, stateSlotKey, subLayersSlotKey } from '../src/appHost'

import { AnySlotKey, AppHost, EntryPoint, Shell, SlotKey, AppHostOptions, HostLogger, PrivateShell } from '../src/API'
import {
    MockAPI,
    mockPackage,
    mockPackageWithPublicAPI,
    MockPublicAPI,
    mockShellInitialState,
    mockShellStateKey
} from '../testKit/mockPackage'

import { AppHostAPI, AppHostServicesEntryPointName, AppHostServicesProvider } from '../src/appHostServices'
import { createCircularEntryPoints, createDirectCircularEntryPoints } from './appHost.mock'
import { ConsoleHostLogger } from '../src/loggers'
import { emptyLoggerOptions } from '../testKit/emptyLoggerOptions'
import { addMockShell } from '../testKit'

const testHostOptions: AppHostOptions = {
    monitoring: { disableMonitoring: true }
}

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
        host: createAppHost([dependentPackage, deeplyDependentPackage, helperEntryPoint], testHostOptions),
        dependentPackage,
        deeplyDependentPackage,
        helperShell: getHelperShell()
    }
}

interface EntryPointStateSnapshot {
    canUseStore: boolean
    canUseAPIs: boolean
    wasInitializationCompleted: boolean
}

describe('App Host', () => {
    beforeEach(() => {
        spyOn(ConsoleHostLogger, 'log')
    })

    it('should create an app host', () => {
        const host = createAppHost([], testHostOptions)
        expect(host).toBeInstanceOf(Object)
    })

    describe('AppHost Options', () => {
        it('should use ConsoleHostLogger by default', () => {
            const host = createAppHost([], testHostOptions)
            expect(host.log).toBe(ConsoleHostLogger)
        })
        it('should use custom host logger if specified', () => {
            const logger: HostLogger = {
                log() {},
                spanRoot() {
                    return {
                        end() {}
                    } as any
                },
                spanChild() {
                    return {
                        end() {}
                    } as any
                }
            }
            const options: AppHostOptions = {
                logger,
                monitoring: {}
            }

            const host = createAppHost([], options)

            expect(host.log).toBe(logger)
        })
    })

    describe('Packages Installation', () => {
        it('should NOT throw on circular dependency if check is disabled in host options', () => {
            const circularPackages = createDirectCircularEntryPoints()
            const hostOptionsWithDisabledCircularCheck: AppHostOptions = {
                monitoring: {},
                disableCheckCircularDependencies: true
            }
            expect(() => createAppHost(circularPackages, hostOptionsWithDisabledCircularCheck)).not.toThrow()
        })

        it('should throw on direct circular API dependency (private keys)', () => {
            const circularPackages = createDirectCircularEntryPoints()
            expect(() => createAppHost(circularPackages, testHostOptions)).toThrowError()
        })

        it('should throw on direct circular API dependency (public keys)', () => {
            const circularPackages = createDirectCircularEntryPoints(true)
            expect(() => createAppHost(circularPackages, testHostOptions)).toThrowError()
        })
        it('should throw on circular API dependency (private keys)', () => {
            const circularPackages = createCircularEntryPoints()
            expect(() => createAppHost(circularPackages, testHostOptions)).toThrowError()
        })

        it('should throw on circular API dependency (public keys)', () => {
            const circularPackages = createCircularEntryPoints(true)
            expect(() => createAppHost(circularPackages, testHostOptions)).toThrowError()
        })

        it('should throw when dynamically adding a shell with circular dependency', () => {
            const circularPackages = createCircularEntryPoints(true)
            const nonCircular = circularPackages.slice(0, 3)
            const circularEP = _.last(circularPackages) as EntryPoint
            const host = createAppHost(nonCircular, testHostOptions)

            expect(() => host.addShells([circularEP])).toThrow()
        })

        it('should install initial packages', () => {
            const host = createAppHost([mockPackage], testHostOptions)
            expect(host.hasShell(mockPackage.name)).toBe(true)
        })

        it('should install packages after initial installations', async () => {
            const host = createAppHost([], testHostOptions)
            expect(host.hasShell(mockPackage.name)).toBe(false)

            await host.addShells([mockPackage])

            expect(host.hasShell(mockPackage.name)).toBe(true)
        })

        it('should uninstall shell', async () => {
            const host = createAppHost([mockPackage], testHostOptions)

            await host.removeShells([mockPackage.name])

            expect(host.hasShell(mockPackage.name)).toBe(false)
        })

        it('should not install multiple shells with the same name', () => {
            expect(() => createAppHost([mockPackage, _.pick(mockPackage, 'name')], testHostOptions)).toThrow()
        })

        it('should install lazy shells', () => {
            const lazyEntryPoint = makeLazyEntryPoint(mockPackage.name, async () => mockPackage)
            const host = createAppHost([lazyEntryPoint], testHostOptions)
            expect(host.hasShell(lazyEntryPoint.name)).toBe(true)
        })
    })

    describe('EntryPoint lifecycle state', () => {
        const takeEntryPointStateSnapshot = (shell: Shell): EntryPointStateSnapshot => {
            return {
                canUseStore: shell.canUseStore(),
                canUseAPIs: shell.canUseAPIs(),
                wasInitializationCompleted: shell.wasInitializationCompleted()
            }
        }

        it('should be incomplete during appHost initialization', () => {
            let stateInAttach: EntryPointStateSnapshot | undefined
            let stateInExtend: EntryPointStateSnapshot | undefined

            const entryPoint: EntryPoint = {
                name: 'TEST_EP',
                attach(shell) {
                    stateInAttach = takeEntryPointStateSnapshot(shell)
                },
                extend(shell) {
                    stateInExtend = takeEntryPointStateSnapshot(shell)
                }
            }

            createAppHost([entryPoint], testHostOptions)

            expect(stateInAttach).toMatchObject({
                wasInitializationCompleted: false,
                canUseAPIs: false,
                canUseStore: false
            })
            expect(stateInExtend).toMatchObject({
                wasInitializationCompleted: false,
                canUseAPIs: true,
                canUseStore: true
            })
        })

        it('should be complete after appHost initialization', () => {
            let shell: Shell | undefined

            const entryPoint: EntryPoint = {
                name: 'TEST_EP',
                attach(_shell) {
                    shell = _shell
                }
            }

            createAppHost([entryPoint], testHostOptions)
            const stateAfter = shell && takeEntryPointStateSnapshot(shell)

            expect(stateAfter).toMatchObject({
                wasInitializationCompleted: true,
                canUseAPIs: true,
                canUseStore: true
            })
        })

        it('should be incomplete during lifecycle of added entry point', () => {
            let stateInAttach: EntryPointStateSnapshot | undefined
            let stateInExtend: EntryPointStateSnapshot | undefined

            const host = createAppHost([], testHostOptions)
            addMockShell(host, {
                attach(shell) {
                    stateInAttach = takeEntryPointStateSnapshot(shell)
                },
                extend(shell) {
                    stateInExtend = takeEntryPointStateSnapshot(shell)
                }
            })

            expect(stateInAttach).toMatchObject({
                wasInitializationCompleted: false,
                canUseAPIs: false,
                canUseStore: false
            })
            expect(stateInExtend).toMatchObject({
                wasInitializationCompleted: false,
                canUseAPIs: true,
                canUseStore: true
            })
        })

        it('should be complete after lifecycle of added entry point', () => {
            const host = createAppHost([], testHostOptions)

            const shell = addMockShell(host)

            const stateAfter = takeEntryPointStateSnapshot(shell)
            expect(stateAfter).toMatchObject({
                wasInitializationCompleted: true,
                canUseAPIs: true,
                canUseStore: true
            })
        })

        it('should be incomplete during execution of late initializer', () => {
            let state: EntryPointStateSnapshot | undefined

            const host = createAppHost([], testHostOptions)
            const shell = addMockShell(host)
            expect(shell.wasInitializationCompleted()).toBe(true)

            shell.runLateInitializer(() => {
                state = takeEntryPointStateSnapshot(shell)
            })

            expect(state).toMatchObject({
                canUseStore: true,
                canUseAPIs: true,
                wasInitializationCompleted: false
            })
        })

        it('should be complete after execution of late initializer', () => {
            const host = createAppHost([], testHostOptions)
            const shell = addMockShell(host)
            expect(shell.wasInitializationCompleted()).toBe(true)

            shell.runLateInitializer(() => {})

            const stateAfter = takeEntryPointStateSnapshot(shell)
            expect(stateAfter).toMatchObject({
                canUseStore: true,
                canUseAPIs: true,
                wasInitializationCompleted: true
            })
        })

        it('should be complete after execution of late initializer that throws', () => {
            const host = createAppHost([], testHostOptions)
            const shell = addMockShell(host)
            expect(shell.wasInitializationCompleted()).toBe(true)

            expect(() => {
                shell.runLateInitializer(() => {
                    throw new Error('TEST-ERROR')
                })
            }).toThrow('TEST-ERROR')

            const stateAfter = takeEntryPointStateSnapshot(shell)
            expect(stateAfter).toMatchObject({
                canUseStore: true,
                canUseAPIs: true,
                wasInitializationCompleted: true
            })
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
            describe(`Dependency entry point installation (${testCase})`, () => {
                it('should not install dependent entry point until dependency is installed', async () => {
                    const { host, dependentPackage } = createHostWithDependantPackages(dependencyAPI)

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)

                    await host.addShells([providerPackage])

                    expect(host.hasShell(dependentPackage[0].name)).toBe(true)
                })

                it('should install all dependent entry points chain when dependencies are installed from entry point', async () => {
                    const { host, dependentPackage, deeplyDependentPackage } = createHostWithDependantPackages(dependencyAPI)

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(false)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(false)

                    await host.addShells([providerPackage])

                    expect(host.hasShell(dependentPackage[0].name)).toBe(true)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(true)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(true)
                })

                it('should install all dependent entry points chain when dependencies are installed outside of entry point', async () => {
                    const { host, dependentPackage, deeplyDependentPackage, helperShell } = createHostWithDependantPackages(dependencyAPI)

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(false)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(false)

                    helperShell.contributeAPI(dependencyAPI, () => ({
                        stubTrue: () => true,
                        getNewObject: () => ({})
                    }))

                    expect(host.hasShell(dependentPackage[0].name)).toBe(true)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(true)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(true)
                })

                it('should uninstall all dependent entry points chain when dependencies are uninstalled', async () => {
                    const { host, dependentPackage, deeplyDependentPackage } = createHostWithDependantPackages(dependencyAPI)

                    await host.addShells([providerPackage])
                    await host.removeShells([providerPackage.name])

                    expect(host.hasShell(dependentPackage[0].name)).toBe(false)
                    expect(host.hasShell(dependentPackage[1].name)).toBe(false)
                    expect(host.hasShell(deeplyDependentPackage[0].name)).toBe(false)
                })
            })
        }
    )

    describe('Host extension slots', () => {
        it('should have a state extension slot', () => {
            const host = createAppHost([], testHostOptions)
            expect(host.getSlot(stateSlotKey)).toBeTruthy()
        })

        it('should have a main view extension slot', () => {
            const host = createAppHost([], testHostOptions)
            expect(host.getSlot(mainViewSlotKey)).toBeTruthy()
        })

        it('should retrieve all slot keys', () => {
            const sortSlotKeys = (slotKeys: AnySlotKey[]) => _.sortBy(slotKeys, 'name')

            const host = createAppHost([mockPackage], testHostOptions)

            const actual = sortSlotKeys(host.getAllSlotKeys())
            const expected = sortSlotKeys([AppHostAPI, mainViewSlotKey, stateSlotKey, subLayersSlotKey, MockAPI])

            expect(actual).toEqual(expected)
        })

        describe('private API slot key', () => {
            it('should equal itself', () => {
                const host = createAppHost([mockPackage], testHostOptions)

                const API = host.getAPI(MockAPI)

                expect(API).toBeTruthy()
            })

            it('should not equal another key with same name', () => {
                const host = createAppHost([mockPackage], testHostOptions)
                const fakeKey: SlotKey<MockAPI> = { name: MockAPI.name }

                expect(() => {
                    host.getAPI(fakeKey)
                }).toThrowError(new RegExp(MockAPI.name))
            })

            it('should not equal another key with same name that claims it is public', () => {
                const host = createAppHost([mockPackage], testHostOptions)
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
                const host = createAppHost([mockPackageWithPublicAPI], testHostOptions)

                const API = host.getAPI(MockPublicAPI)

                expect(API).toBeTruthy()
            })

            it('should equal another key with same name that claims it is public', () => {
                const host = createAppHost([mockPackageWithPublicAPI], testHostOptions)
                const anotherKey: SlotKey<MockAPI> = {
                    name: MockPublicAPI.name,
                    public: true
                }

                const API = host.getAPI(anotherKey)

                expect(API).toBeTruthy()
            })

            it('should not equal another key with same name than does not claim it is public', () => {
                const host = createAppHost([mockPackageWithPublicAPI], testHostOptions)
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

    describe('Shell extension slots', () => {
        it('should allow contribution', async () => {
            const host = createAppHost([], testHostOptions)
            interface SlotItem {
                value: string
            }
            interface MockAPIA {
                contributeItem(fromShell: Shell, item: SlotItem): void
            }
            const slotKey: SlotKey<SlotItem> = {
                name: 'MOCK_SLOT'
            }
            const MockAPIA: SlotKey<MockAPIA> = {
                name: 'MOCK_API_A'
            }
            const contributedItemA = { value: 'A' }
            const contributedItemB = { value: 'B' }
            const entryPointA: EntryPoint = {
                name: 'MOCK_A',
                declareAPIs() {
                    return [MockAPIA]
                },
                attach(shell) {
                    shell.declareSlot(slotKey)
                    shell.contributeAPI(MockAPIA, () => ({
                        contributeItem(fromShell, item) {
                            shell.getSlot(slotKey).contribute(fromShell, item)
                        }
                    }))
                },
                extend(shell) {
                    shell.getAPI(MockAPIA).contributeItem(shell, contributedItemA)
                }
            }

            const entryPointB: EntryPoint = {
                name: 'MOCK_B',
                getDependencyAPIs() {
                    return [MockAPIA]
                },
                extend(shell) {
                    shell.getAPI(MockAPIA).contributeItem(shell, contributedItemB)
                }
            }
            await host.addShells([entryPointA, entryPointB])

            const getItems = () =>
                host
                    .getSlot(slotKey)
                    .getItems()
                    .map(({ contribution }) => contribution)

            expect(getItems()).toEqual([contributedItemA, contributedItemB])

            await host.removeShells(['MOCK_B'])
            expect(getItems()).toEqual([contributedItemA])

            await host.addShells([entryPointB])
            expect(getItems()).toEqual([contributedItemA, contributedItemB])
        })

        it('should not allow direct access to slots from other shells', async () => {
            const host = createAppHost([], testHostOptions)
            interface SlotItem {
                value: string
            }
            interface MockAPIA {
                contributeItem(fromShell: Shell, item: SlotItem): void
            }
            const slotKey: SlotKey<SlotItem> = {
                name: 'MOCK_SLOT'
            }
            const MockAPIA: SlotKey<MockAPIA> = {
                name: 'MOCK_API_A'
            }
            const entryPointA: EntryPoint = {
                name: 'MOCK_A',
                declareAPIs() {
                    return [MockAPIA]
                },
                attach(shell) {
                    shell.declareSlot(slotKey)
                }
            }
            const entryPointB: EntryPoint = {
                name: 'MOCK_B',
                extend(shell) {
                    const errorString = `Shell '${entryPointB.name}' is trying to get slot '${slotKey.name}' that is owned by '${entryPointA.name}'`
                    expect(() => shell.getSlot(slotKey)).toThrowError(errorString)
                }
            }
            await host.addShells([entryPointA])
        })
    })

    describe('Host State', () => {
        it('should have a store with initial state', () => {
            const host = createAppHost([], testHostOptions)
            expect(host.getStore().getState()).toEqual({
                $installedShells: {
                    installedShells: {
                        [AppHostServicesEntryPointName]: true
                    }
                }
            })
        })
    })

    describe('Entry Point Contributions', () => {
        it('should contribute API', () => {
            const host = createAppHost([mockPackage], testHostOptions)
            expect(host.getAPI(MockAPI)).toBeTruthy()
        })

        it('should contribute API after initial installations', async () => {
            const host = createAppHost([], testHostOptions)
            expect(() => host.getAPI(MockAPI)).toThrow()

            await host.addShells([mockPackage])
            expect(host.getAPI(MockAPI)).toBeTruthy()
        })

        it('should execute detach and attach sequence according to dependencies', async () => {
            const MockAPI2: SlotKey<MockAPI> = { name: 'MOCK' }
            const dependantEntryPoint: EntryPoint = {
                name: 'EP1',
                getDependencyAPIs: () => [MockAPI],
                declareAPIs: () => [MockAPI2],
                attach(shell) {
                    shell.contributeAPI(MockAPI2, () => shell.getAPI(MockAPI))
                },
                detach(shell) {
                    shell.getAPI(MockAPI).stubTrue()
                }
            }
            const dependantEntryPoint2: EntryPoint = {
                name: 'EP2',
                getDependencyAPIs: () => [MockAPI, MockAPI2],
                detach(shell) {
                    shell.getAPI(MockAPI).stubTrue()
                    shell.getAPI(MockAPI2).stubTrue()
                }
            }
            const host = createAppHost([dependantEntryPoint2, mockPackage, dependantEntryPoint], testHostOptions)
            expect(() => host.removeShells([mockPackage.name])).not.toThrow()
            expect(host.hasShell(mockPackage.name)).toBe(false)
            expect(host.hasShell(dependantEntryPoint.name)).toBe(false)
            expect(host.hasShell(dependantEntryPoint2.name)).toBe(false)

            await host.addShells([mockPackage])
            expect(host.hasShell(dependantEntryPoint.name)).toBe(true)
            expect(host.hasShell(dependantEntryPoint2.name)).toBe(true)
        })

        it('should contribute state', async () => {
            const getMockShellState = (host: AppHost) => _.get(host.getStore().getState(), [mockPackage.name, mockShellStateKey], null)

            const appHost = createAppHost([], testHostOptions)
            expect(getMockShellState(appHost)).toBeNull()

            await appHost.addShells([mockPackage])
            expect(getMockShellState(appHost)).toEqual(mockShellInitialState)
        })

        it('should memoize functions upon demand', () => {
            const host = createAppHost([mockPackage], testHostOptions)
            const getObj = () => host.getAPI(MockAPI).getNewObject()
            expect(getObj()).not.toBe(getObj())

            interface NewAPI {
                getNewObject(): object
            }
            const newAPI: SlotKey<NewAPI> = { name: 'newAPI' }
            const createAPI = (shell: Shell): NewAPI => ({ getNewObject: shell.memoizeForState(() => ({}), _.stubTrue) })
            addMockShell(host, {
                declareAPIs: () => [newAPI],
                attach(shell) {
                    shell.contributeAPI(newAPI, () => createAPI(shell))
                }
            })

            const objForStateA = host.getAPI(newAPI).getNewObject()
            expect(objForStateA).toBe(host.getAPI(newAPI).getNewObject())

            host.getStore().dispatch({ type: 'MOCK_ACTION' })
            host.getStore().flush()

            expect(objForStateA).not.toBe(host.getAPI(newAPI).getNewObject())
        })

        it('should not clear memoized functions if not needed', () => {
            const host = createAppHost([], testHostOptions)

            interface NewAPI {
                getNewObject(): object
            }
            const newAPI: SlotKey<NewAPI> = { name: 'newAPI' }
            const createAPI = (shell: Shell): NewAPI => ({ getNewObject: shell.memoizeForState(() => ({}), _.stubTrue, _.stubFalse) })
            addMockShell(host, {
                declareAPIs: () => [newAPI],
                attach(shell) {
                    shell.contributeAPI(newAPI, () => createAPI(shell))
                }
            })

            const objForStateA = host.getAPI(newAPI).getNewObject()

            host.getStore().dispatch({ type: 'MOCK_ACTION' })
            host.getStore().flush()

            expect(objForStateA).toBe(host.getAPI(newAPI).getNewObject())
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
            const appHost = createAppHost([mockPackage], testHostOptions)
            expect(() => appHost.addShells([entryPointThatCallsAPI])).not.toThrow()
        })

        it('should not be able to call an API not declared in dependencies', () => {
            const entryPointThatCallsAPI: EntryPoint = {
                name: 'ENTRY_POINT_WITH_API_CALL',
                extend(shell: Shell) {
                    shell.getAPI(MockAPI).stubTrue()
                }
            }
            const appHost = createAppHost([mockPackage], testHostOptions)
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
            createAppHost([entryPointWithState], testHostOptions)
        })

        it('should be able to uninstall own installed packages', async () => {
            // note: this test assumes that addShells and removeShells complete synchronously
            const packageThatInstallsAPackage: EntryPoint = {
                name: 'ENTRY_POINT_THAT_INSTALLS_A_PACKAGE',
                extend(shell: Shell) {
                    shell.addShells([mockPackage])
                    shell.removeShells([mockPackage.name])
                }
            }
            createAppHost([packageThatInstallsAPackage], testHostOptions)
            expect(() => createAppHost([packageThatInstallsAPackage], testHostOptions)).not.toThrow()
        })

        it('should not be able to uninstall not own installed packages', () => {
            const packageThatTriesToUninstallAPackage: EntryPoint = {
                name: 'ENTRY_POINT_THAT_TRYIES_TO_UNINSTALL_A_PACKAGE',
                extend(shell: Shell) {
                    shell.removeShells([mockPackage.name])
                }
            }
            expect(() => createAppHost([mockPackage, packageThatTriesToUninstallAPackage], testHostOptions)).toThrow()
        })
    })

    describe('Entry Point HMR support', () => {
        const LowLevelSlotKey: SlotKey<string> = { name: 'LOW-LEVEL-SLOT' }
        const HighLevelSlotKey: SlotKey<string> = { name: 'HIGH-LEVEL-SLOT' }
        const ConsumerSlotKey: SlotKey<string> = { name: 'CONSUMER-SLOT' }
        const LowLevelAPI: SlotKey<{ lowLevelFunc(s: string): void }> = { name: 'LOW-LEVEL-API' }
        const HighLevelAPI: SlotKey<{ highLevelFunc(s: string): void }> = { name: 'HIGH-LEVEL-API' }
        const hmrTestPackage: EntryPoint[] = [
            {
                name: 'LOW_LEVEL_API_ENTRY_POINT',
                declareAPIs() {
                    return [LowLevelAPI]
                },
                attach(shell: Shell) {
                    shell.declareSlot(LowLevelSlotKey)
                    shell.contributeAPI(LowLevelAPI, () => ({
                        lowLevelFunc: jest.fn()
                    }))
                }
            },
            {
                name: 'HIGH_LEVEL_API_ENTRY_POINT',
                getDependencyAPIs() {
                    return [LowLevelAPI]
                },
                declareAPIs() {
                    return [HighLevelAPI]
                },
                attach(shell: Shell) {
                    shell.declareSlot(HighLevelSlotKey)
                    shell.contributeAPI(HighLevelAPI, () => ({
                        highLevelFunc: jest.fn
                    }))
                },
                extend(shell: Shell) {
                    shell.getAPI(LowLevelAPI).lowLevelFunc('HIGH')
                }
            },
            {
                name: 'CONSUMER_ENTRY_POINT',
                getDependencyAPIs() {
                    return [HighLevelAPI]
                },
                extend(shell: Shell) {
                    shell.declareSlot(ConsumerSlotKey)
                    shell.getAPI(HighLevelAPI).highLevelFunc('CONSUMER')
                }
            }
        ]

        it('should be able to reload entry points', async () => {
            const appHost = createAppHost(hmrTestPackage, testHostOptions)

            await appHost.removeShells(['LOW_LEVEL_API_ENTRY_POINT'])
            await appHost.addShells([hmrTestPackage[0]])

            expect(appHost.getAPI(HighLevelAPI)).toBeDefined()
        })
    })

    describe('API layer', () => {
        it('should allow dependency from high to lower level API', async () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: 'INFRA' }
            const layers = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]

            const host = createAppHost([], { ...emptyLoggerOptions, layers })
            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: 'PRODUCT',
                getDependencyAPIs: () => [MockAPI1]
            }
            const EntryPoint2: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_2',
                layer: 'INFRA',
                declareAPIs: () => [MockAPI1],
                attach(shell) {
                    shell.contributeAPI(MockAPI1, () => ({}))
                }
            }
            await host.addShells([EntryPoint2])

            expect(() => host.addShells([EntryPoint1])).not.toThrow()
        })

        it('should not allow dependency from low to higher level API', async () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: 'PRODUCT' }
            const layers = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]

            const host = createAppHost([], { ...emptyLoggerOptions, layers })
            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: 'INFRA',
                getDependencyAPIs: () => [MockAPI1]
            }
            const EntryPoint2: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_2',
                layer: 'PRODUCT',
                declareAPIs: () => [MockAPI1],
                attach(shell) {
                    shell.contributeAPI(MockAPI1, () => ({}))
                }
            }
            await host.addShells([EntryPoint2])

            expect(() => host.addShells([EntryPoint1])).toThrowError(
                `Entry point ${EntryPoint1.name} of layer ${layers[0].name} cannot depend on API ${MockAPI1.name} of layer ${EntryPoint2.layer}`
            )
        })

        it('should not allow adding shell of unknown layer', () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: 'NON_EXIXTING_layer' }
            const layers = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]

            const host = createAppHost([], { ...emptyLoggerOptions, layers })
            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: 'NON_EXIXTING_layer',
                getDependencyAPIs: () => [MockAPI1]
            }
            expect(() => host.addShells([EntryPoint1])).toThrowError(`Cannot find layer ${EntryPoint1.layer}`)
        })

        it('should not allow contribution of API with non-matching entry point layer', () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: 'PRODUCT' }
            const layers = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]

            const host = createAppHost([], { ...emptyLoggerOptions, layers })
            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: 'INFRA',
                declareAPIs: () => [MockAPI1],
                attach(shell) {
                    shell.contributeAPI(MockAPI1, () => ({}))
                }
            }
            expect(() => host.addShells([EntryPoint1])).toThrowError(
                `Cannot contribute API ${MockAPI1.name} of layer ${MockAPI1.layer} from entry point ${EntryPoint1.name} of layer ${EntryPoint1.layer}`
            )
        })

        it('should support multi dimensional layers definition', () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: ['COMMON', 'INFRA'] }
            const layersDimension1 = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]
            const layersDimension2 = [
                {
                    level: 0,
                    name: 'COMMON'
                },
                {
                    level: 1,
                    name: 'SPECIFIC'
                }
            ]

            const host = createAppHost([], {
                ...emptyLoggerOptions,
                layers: [layersDimension1, layersDimension2]
            })

            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: ['INFRA', 'COMMON'],
                declareAPIs: () => [MockAPI1],
                attach(shell) {
                    shell.contributeAPI(MockAPI1, () => ({}))
                }
            }

            const EntryPoint2: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_2',
                layer: ['PRODUCT', 'SPECIFIC'],
                getDependencyAPIs: () => [MockAPI1]
            }

            expect(() => host.addShells([EntryPoint1, EntryPoint2])).not.toThrow()
        })

        it('should throw for multi dimensional layers violation', () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: ['INFRA', 'SPECIFIC'] }
            const layersDimension1 = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]
            const layersDimension2 = [
                {
                    level: 0,
                    name: 'COMMON'
                },
                {
                    level: 1,
                    name: 'SPECIFIC'
                }
            ]

            const host = createAppHost([], {
                ...emptyLoggerOptions,
                layers: [layersDimension1, layersDimension2]
            })

            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: ['INFRA', 'SPECIFIC'],
                declareAPIs: () => [MockAPI1],
                attach(shell) {
                    shell.contributeAPI(MockAPI1, () => ({}))
                }
            }

            const EntryPoint2: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_2',
                layer: ['COMMON', 'PRODUCT'],
                getDependencyAPIs: () => [MockAPI1]
            }

            expect(() => host.addShells([EntryPoint1, EntryPoint2])).toThrowError(
                `Entry point ${EntryPoint2.name} of layer COMMON cannot depend on API ${MockAPI1.name} of layer SPECIFIC`
            )
        })

        it('should enforce cross-multi-dimensional-layers name uniqueness', () => {
            const layersDimension1 = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'NOT_UNIQUE'
                }
            ]
            const layersDimension2 = [
                {
                    level: 0,
                    name: 'COMMON'
                },
                {
                    level: 1,
                    name: 'NOT_UNIQUE'
                }
            ]

            expect(() =>
                createAppHost([], {
                    ...emptyLoggerOptions,
                    layers: [layersDimension1, layersDimension2]
                })
            ).toThrowError(`Cannot initialize host with non unique layers: NOT_UNIQUE`)
        })

        it('should allow single layered API for multi dimensional layers host', () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-API', layer: 'INFRA' }
            const layersDimension1 = [
                {
                    level: 0,
                    name: 'INFRA'
                },
                {
                    level: 1,
                    name: 'PRODUCT'
                }
            ]
            const layersDimension2 = [
                {
                    level: 0,
                    name: 'COMMON'
                },
                {
                    level: 1,
                    name: 'SPECIFIC'
                }
            ]

            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: 'PRODUCT',
                getDependencyAPIs: () => [MockAPI1]
            }
            const EntryPoint2: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_2',
                layer: 'INFRA',
                declareAPIs: () => [MockAPI1],
                attach(shell) {
                    shell.contributeAPI(MockAPI1, () => ({}))
                }
            }

            expect(() =>
                createAppHost([EntryPoint1, EntryPoint2], {
                    ...emptyLoggerOptions,
                    layers: [layersDimension1, layersDimension2]
                })
            ).not.toThrow()
        })

        it('should enforce contributed layers dimension', async () => {
            const MockAPI1: SlotKey<{}> = { name: 'Mock-Host-API', layer: 'HOST_0' }
            const MockAPI2: SlotKey<{}> = { name: 'Mock-Shell-API', layer: ['HOST_1', 'SHELL_1'] }
            const hostLayersDimension = [
                {
                    level: 0,
                    name: 'HOST_0'
                },
                {
                    level: 1,
                    name: 'HOST_1'
                }
            ]
            const shellLayersDimension = [
                {
                    level: 0,
                    name: 'SHELL_0'
                },
                {
                    level: 1,
                    name: 'SHELL_1'
                }
            ]

            const EntryPoint1: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_1',
                layer: 'HOST_0',
                declareAPIs: () => [MockAPI1],
                attach: shell => {
                    shell.contributeAPI(MockAPI1, () => ({}))
                    shell.contributeSubLayersDimension(shellLayersDimension)
                }
            }

            const EntryPoint2: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_2',
                layer: ['HOST_1', 'SHELL_1'],
                getDependencyAPIs: () => [MockAPI1],
                declareAPIs: () => [MockAPI2],
                attach(shell) {
                    shell.contributeAPI(MockAPI2, () => ({}))
                }
            }

            const EntryPointViolation: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_3',
                layer: ['HOST_1', 'SHELL_0'],
                getDependencyAPIs: () => [MockAPI2]
            }

            const EntryPointWithShellLayersOnly: EntryPoint = {
                name: 'MOCK_ENTRY_POINT_4',
                layer: ['HOST_1', 'SHELL_0'],
                getDependencyAPIs: () => []
            }

            const host = createAppHost([], {
                ...emptyLoggerOptions,
                layers: hostLayersDimension
            })

            expect(() => {
                host.addShells([EntryPointWithShellLayersOnly])
            }).toThrowError(`Cannot find layer SHELL_0`)

            host.addShells([EntryPoint1])

            expect(() => {
                host.addShells([EntryPoint2])
            }).not.toThrow()

            expect(() => {
                host.addShells([EntryPointViolation])
            }).toThrowError(
                `Entry point ${EntryPointViolation.name} of layer SHELL_0 cannot depend on API ${MockAPI2.name} of layer SHELL_1`
            )

            /* 
            TBD - Should we detach entry points with layers defined by detached shells (?)
            If so - should they stay on pending list? should we allow adding entry points with layers that are not defined?
            (currently not really symmetrical with API dependencies behavior that are always pending if missing implementation)
            */
            // host.addShells([EntryPointWithShellLayersOnly])
            // await host.removeShells([EntryPoint1.name])
            // expect(host.hasShell(EntryPointWithShellLayersOnly.name)).toBe(false)
        })
    })

    describe('API version', () => {
        it('should provide API of matching version', async () => {
            const MockAPIv0: SlotKey<{ f1(): void }> = { name: 'Mock-API' }
            const MockAPIv2: SlotKey<{ f2(): void }> = { name: 'Mock-API', version: 2 }
            const host = createAppHost([])
            const entryPoint: EntryPoint = {
                name: 'MOCK_ENTRY_POINT',
                declareAPIs: () => [MockAPIv0, MockAPIv2],
                attach(shell) {
                    shell.contributeAPI(MockAPIv0, () => ({ f1() {} }))
                    shell.contributeAPI(MockAPIv2, () => ({ f2() {} }))
                }
            }
            await host.addShells([entryPoint])

            expect(host.getAPI(MockAPIv0).f1).toBeDefined()
            expect((host.getAPI(MockAPIv0) as any).f2).not.toBeDefined()

            expect(host.getAPI(MockAPIv2).f2).toBeDefined()
            expect((host.getAPI(MockAPIv2) as any).f1).not.toBeDefined()

            const SecondMockAPIv2: SlotKey<{ f2(): void }> = { name: 'Mock-API', version: 2 }
            expect(() => {
                addMockShell(host, {
                    declareAPIs: () => [SecondMockAPIv2],
                    attach(shell) {
                        shell.contributeAPI(SecondMockAPIv2, () => ({ f2() {} }))
                    }
                })
            }).toThrowError(
                new RegExp(`Error: Extension slot with key '${SecondMockAPIv2.name}\\\(v${SecondMockAPIv2.version}\\\)' already exists`)
            )
        })
    })

    describe('Host API', () => {
        it('should get all entry points', async () => {
            const host = createAppHost([mockPackage], testHostOptions) as AppHost & AppHostServicesProvider
            await host.addShells([mockPackageWithPublicAPI])

            const allEntryPoints = host.getAPI(AppHostAPI).getAllEntryPoints()

            expect(_.sortBy(allEntryPoints, 'name')).toEqual(
                _.sortBy([mockPackage, mockPackageWithPublicAPI, (host.getAppHostServicesShell() as PrivateShell).entryPoint], 'name')
            )
        })

        it('should get host options', () => {
            const host = createAppHost([mockPackage], testHostOptions)

            expect(host.getAPI(AppHostAPI).getAppHostOptions()).toEqual(testHostOptions)
        })
    })

    describe('Cyclic Mode', () => {
        it('should load cyclic dependencies groups if all other dependencies are ready', () => {
            const API1: SlotKey<{}> = { name: 'API1' }
            const API2: SlotKey<{}> = { name: 'API2' }
            const API3: SlotKey<{}> = { name: 'API3' }
            const entryPoints: EntryPoint[] = [
                {
                    name: 'Package1',
                    getDependencyAPIs: () => [API2],
                    declareAPIs: () => [API1],
                    attach(shell) {
                        shell.contributeAPI(API1, () => ({}))
                    }
                },
                {
                    name: 'Package2',
                    getDependencyAPIs: () => [API3],
                    declareAPIs: () => [API2],
                    attach(shell) {
                        shell.contributeAPI(API2, () => ({}))
                    }
                },
                {
                    name: 'Package3',
                    getDependencyAPIs: () => [API1],
                    declareAPIs: () => [API3],
                    attach(shell) {
                        shell.contributeAPI(API3, () => ({}))
                    }
                }
            ]
            const host = createAppHost(entryPoints, { ...testHostOptions, experimentalCyclicMode: true })

            expect(host.hasShell(entryPoints[0].name)).toBe(true)
            expect(host.hasShell(entryPoints[1].name)).toBe(true)
            expect(host.hasShell(entryPoints[2].name)).toBe(true)
        })

        it('should not load cyclic dependencies groups if some other dependencies are not ready', () => {
            const API1: SlotKey<{}> = { name: 'API1' }
            const API2: SlotKey<{}> = { name: 'API2' }
            const API3: SlotKey<{}> = { name: 'API3' }
            const API4: SlotKey<{}> = { name: 'API4' }
            const entryPoints: EntryPoint[] = [
                {
                    name: 'Package1',
                    getDependencyAPIs: () => [API2],
                    declareAPIs: () => [API1],
                    attach(shell) {
                        shell.contributeAPI(API1, () => ({}))
                    }
                },
                {
                    name: 'Package2',
                    getDependencyAPIs: () => [API3],
                    declareAPIs: () => [API2],
                    attach(shell) {
                        shell.contributeAPI(API2, () => ({}))
                    }
                },
                {
                    name: 'Package3',
                    getDependencyAPIs: () => [API1, API4],
                    declareAPIs: () => [API3],
                    attach(shell) {
                        shell.contributeAPI(API3, () => ({}))
                    }
                }
            ]
            const host = createAppHost(entryPoints, { ...testHostOptions, experimentalCyclicMode: true })

            expect(host.hasShell(entryPoints[0].name)).toBe(false)
            expect(host.hasShell(entryPoints[1].name)).toBe(false)
            expect(host.hasShell(entryPoints[2].name)).toBe(false)
        })
    })
})
