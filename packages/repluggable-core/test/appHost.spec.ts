import _ from 'lodash'

import { createAppHost, mainViewSlotKey, makeLazyEntryPoint, stateSlotKey } from '../src/appHost'

import {
    AnySlotKey,
    AppHost,
    AppHostOptions,
    EntryPoint,
    HostLogger,
    ObservableState,
    PrivateAppHost,
    PrivateShell,
    Shell,
    SlotKey
} from '../src/API'
import {
    addMockShell,
    asyncLoadMockPackage,
    dependsOnMockPackageEntryPoint,
    emptyLoggerOptions,
    MockAPI,
    mockPackage,
    mockPackageWithPublicAPI,
    mockPackageWithSlot,
    MockPublicAPI,
    mockShellInitialState,
    mockShellStateKey,
    MockSlot
} from '../testKit'

import { AppHostAPI, AppHostServicesEntryPointName, AppHostServicesProvider } from '../src/appHostServices'
import { ConsoleHostLogger } from '../src/loggers'
import { createCircularEntryPoints, createDirectCircularEntryPoints } from './appHost.mock'
import { createSignalItemsDataStructure } from './createSignalItemsDataStructure'

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

interface ObservableValueState {
    stateValue: number
}
interface ObservableValueSelector {
    getStateValue(): number
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

        it('should delay extend until implementation dependencies are satisfied', async () => {
            interface SomeAPIImplementation {
                implementation: () => any
            }

            const implementationSlotKey: SlotKey<SomeAPIImplementation> = {
                name: 'IMPLEMENTATION_SLOT'
            }

            interface SomeAPI {
                getImplementation(): SomeAPIImplementation
            }

            interface SomeAPIContributionAPI {
                contributeImplementation(fromShell: Shell, implementation: SomeAPIImplementation): void
                getContributedImplementation(): SomeAPIImplementation
            }

            const someAPIKey: SlotKey<SomeAPI> = {
                name: 'SOME_API'
            }

            const someAPIContributionKey: SlotKey<SomeAPIContributionAPI> = {
                name: 'SOME_API_CONTRIBUTION'
            }

            let getImplementationSpy: jest.SpyInstance | null = null

            const createSomeAPIContributionAPI = (shell: Shell): SomeAPIContributionAPI => {
                const implementationSlot = shell.declareSlot(implementationSlotKey)
                return {
                    contributeImplementation(fromShell: Shell, implementation: SomeAPIImplementation) {
                        implementationSlot.contribute(fromShell, implementation)
                    },
                    getContributedImplementation() {
                        const firstItem = implementationSlot.getItems()[0]
                        return firstItem.contribution
                    }
                }
            }

            const createSomeAPI = (shell: Shell): SomeAPI => {
                const someAPIContributionAPI = shell.getAPI(someAPIContributionKey)
                const api: SomeAPI = {
                    getImplementation() {
                        return someAPIContributionAPI.getContributedImplementation()
                    }
                }

                // Jest spy directly on the API method implementation so we can assert
                // exactly when it is invoked.
                getImplementationSpy = jest.spyOn(api, 'getImplementation')

                return api
            }

            const contributionProviderEntryPoint: EntryPoint = {
                name: 'CONTRIBUTION_PROVIDER_EP',
                declareAPIs() {
                    return [someAPIContributionKey]
                },
                attach(shell: Shell) {
                    shell.contributeAPI(someAPIContributionKey, () => createSomeAPIContributionAPI(shell))
                }
            }

            const interfaceProviderEntryPoint: EntryPoint = {
                name: 'INTERFACE_PROVIDER_EP',
                declareAPIs() {
                    return [someAPIKey]
                },
                getInterfaceDependencies() {
                    return [someAPIContributionKey]
                },
                declareIOCSlots() {
                    return [implementationSlotKey]
                },
                attach(shell: Shell) {
                    shell.contributeAPI(someAPIKey, () => createSomeAPI(shell))
                }
            }

            const implementationProviderEntryPoint: EntryPoint = {
                name: 'IMPLEMENTATION_PROVIDER_EP',
                getInterfaceDependencies() {
                    return [someAPIContributionKey]
                },

                extend(shell: Shell) {
                    const contributionAPI = shell.getAPI(someAPIContributionKey)
                    contributionAPI.contributeImplementation(shell, { implementation: () => {} })
                }
            }

            const consumerEntryPoint: EntryPoint = {
                name: 'CONSUMER_EP',

                getInterfaceDependencies() {
                    return [someAPIKey]
                },

                getImplementationDependencies() {
                    return [implementationSlotKey]
                },
                extend(shell: Shell) {
                    const someAPI = shell.getAPI(someAPIKey)
                    const impl = someAPI.getImplementation()
                    expect(impl).toBeDefined()
                }
            }

            // Create host with base infrastructure and consumer entry point
            const host = createAppHost(
                [contributionProviderEntryPoint, interfaceProviderEntryPoint, consumerEntryPoint],
                testHostOptions
            )

            // At this point, implementation provider is not yet installed, so consumer's extend should NOT have run, so getImplementation
            expect(getImplementationSpy).not.toHaveBeenCalled()

            // Verify consumer shell is not yet installed and implementation slot is still empty
            // (consumer's extend is delayed waiting for implementation)
            expect(host.hasShell('CONSUMER_EP')).toBe(false)
            expect(host.getSlot(implementationSlotKey).getItems().length).toBe(0)

            // Now add the implementation provider
            await host.addShells([implementationProviderEntryPoint])

            // After the implementation is contributed, consumer's extend should run
            // and call getImplementation exactly once, and the consumer shell should be installed.
            expect(getImplementationSpy).toHaveBeenCalledTimes(1)
            expect(host.hasShell('CONSUMER_EP')).toBe(true)
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
        describe('hasSlot', () => {
            it('should return false for hasSlot if the slot is not defined on the host', () => {
                const host = createAppHost([], testHostOptions)
                expect(host.hasSlot(MockSlot)).toBeFalsy()
            })

            it('should return true for hasSlot if the slot is defined on the host', () => {
                const host = createAppHost([mockPackageWithSlot], testHostOptions)
                expect(host.hasSlot(MockSlot)).toBeTruthy()
            })
        })
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
            const expected = sortSlotKeys([AppHostAPI, mainViewSlotKey, stateSlotKey, MockAPI])

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
        describe('hasSlot', () => {
            it('should return false for hasSlot if the slot is not defined on the host', async () => {
                const host = createAppHost([], testHostOptions)
                const entryPointWithoutSlot: EntryPoint = {
                    name: 'MOCK_WITHOUT_SLOT',
                    extend(shell) {
                        expect(shell.hasSlot(MockSlot)).toBeFalsy()
                    }
                }
                await host.addShells([entryPointWithoutSlot])
            })

            it('should return true for hasSlot if the slot is defined on the host', async () => {
                const host = createAppHost([], testHostOptions)
                const entryPointWithSlot: EntryPoint = {
                    name: 'MOCK_WITH_SLOT',
                    attach(shell) {
                        shell.declareSlot(MockSlot)
                    },
                    extend(shell) {
                        expect(shell.hasSlot(MockSlot)).toBeTruthy()
                    }
                }
                await host.addShells([entryPointWithSlot])
            })
        })
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

        describe('memoizeForState', () => {
            interface MemoizedAPIInterface {
                getNewObject(): object
            }
            const memoizedAPI: SlotKey<MemoizedAPIInterface> = {
                name: 'memoizedAPI'
            }

            function contributeMemoizedAPI(host: AppHost, shouldClear?: () => boolean): Shell {
                const createAPI = (shell: Shell): MemoizedAPIInterface => ({
                    getNewObject: shell.memoizeForState(() => ({}), _.stubTrue, shouldClear)
                })
                const mockShell = addMockShell(host, {
                    declareAPIs: () => [memoizedAPI],
                    attach(shell) {
                        shell.contributeAPI(memoizedAPI, () => createAPI(shell))
                    }
                })

                return mockShell
            }

            const createMockShell = (host: AppHost) => {
                let observableState: ObservableState<ObservableValueSelector> = {} as any
                const mockShell = addMockShell(host, {
                    declareAPIs: () => [memoizedAPI],
                    attach(shell) {
                        observableState = shell.contributeObservableState<ObservableValueState, ObservableValueSelector>(
                            () => ({
                                stateValue: (state = 1, action) => {
                                    return action.type === 'increase' ? state + 1 : state
                                }
                            }),
                            state => {
                                return {
                                    getStateValue: () => state.stateValue
                                }
                            }
                        )

                        shell.contributeAPI(memoizedAPI, () => ({
                            getNewObject: shell.memoizeForState(
                                () => ({
                                    value: observableState.current(true).getStateValue()
                                }),
                                _.stubTrue
                            )
                        }))
                    }
                })

                return {
                    mockShell,
                    observableState
                }
            }

            it('should memoize functions upon demand', () => {
                const host = createAppHost([mockPackage], testHostOptions)
                const getObj = () => host.getAPI(MockAPI).getNewObject()
                expect(getObj()).not.toBe(getObj())

                contributeMemoizedAPI(host)

                const objForStateA = host.getAPI(memoizedAPI).getNewObject()
                expect(objForStateA).toBe(host.getAPI(memoizedAPI).getNewObject())
            })

            it('should clear memoized functions on store dispatch', () => {
                const host = createAppHost([mockPackage], testHostOptions)

                contributeMemoizedAPI(host)

                const objForStateA = host.getAPI(memoizedAPI).getNewObject()
                expect(objForStateA).toBe(host.getAPI(memoizedAPI).getNewObject())

                host.getStore().dispatch({ type: 'MOCK_ACTION' })
                host.getStore().flush()

                expect(objForStateA).not.toBe(host.getAPI(memoizedAPI).getNewObject())
            })

            it('should clear memoized functions on store dispatch when synchronous code is executing', () => {
                const host = createAppHost([mockPackage], testHostOptions)

                contributeMemoizedAPI(host)

                const res1 = host.getAPI(memoizedAPI).getNewObject()
                expect(res1).toBe(host.getAPI(memoizedAPI).getNewObject())

                let res3
                host.getStore().subscribe(() => {
                    // cache was flushing, so call memoized API in order to create new cache
                    const res2 = host.getAPI(memoizedAPI).getNewObject()
                    expect(res1).not.toBe(res2)
                    expect(res2).toBe(host.getAPI(memoizedAPI).getNewObject())
                    // dispatch new action for sync cache flushing
                    host.getStore().dispatch({ type: 'MOCK_ACTION' })

                    res3 = host.getAPI(memoizedAPI).getNewObject()
                    expect(res2).not.toBe(res3)
                })

                host.getStore().flush()
                expect(res3).toBe(host.getAPI(memoizedAPI).getNewObject())
            })

            it('should clear memoized functions on observable dispatch', () => {
                const host = createAppHost([mockPackage], testHostOptions)
                const { mockShell } = createMockShell(host)

                const objForStateA = host.getAPI(memoizedAPI).getNewObject()
                expect(objForStateA).toBe(host.getAPI(memoizedAPI).getNewObject())

                const { dispatch, flush } = mockShell.getStore<ObservableValueState>()
                dispatch({ type: 'increase' })
                flush()

                expect(objForStateA).not.toBe(host.getAPI(memoizedAPI).getNewObject())
            })

            it('should clear memoized functions on observable dispatch when synchronous code is executing', () => {
                const host = createAppHost([mockPackage], testHostOptions)
                const { mockShell, observableState } = createMockShell(host)

                const { dispatch, flush } = mockShell.getStore<ObservableValueState>()

                const res1 = host.getAPI(memoizedAPI).getNewObject()
                expect(res1).toBe(host.getAPI(memoizedAPI).getNewObject())

                let res3
                observableState.subscribe(mockShell, () => {
                    // cache was flushing, so call memoized API in order to create new cache
                    const res2 = host.getAPI(memoizedAPI).getNewObject()
                    expect(res1).not.toBe(res2)
                    expect(res2).toBe(host.getAPI(memoizedAPI).getNewObject())
                    // dispatch new action for sync cache flushing
                    dispatch({ type: 'increase' })

                    res3 = host.getAPI(memoizedAPI).getNewObject()
                    expect(res2).not.toBe(res3)
                })

                dispatch({ type: 'increase' })
                flush()
                expect(res3).toBe(host.getAPI(memoizedAPI).getNewObject())
            })

            it('should not clear memoized functions if not needed', () => {
                const host = createAppHost([], testHostOptions)

                contributeMemoizedAPI(host, _.stubFalse)

                const objForStateA = host.getAPI(memoizedAPI).getNewObject()

                host.getStore().dispatch({ type: 'MOCK_ACTION' })
                host.getStore().flush()

                expect(objForStateA).toBe(host.getAPI(memoizedAPI).getNewObject())
            })
        })

        describe('memory cleanup:', () => {
            let originalFinalizationRegistry: FinalizationRegistry<any>
            let cleanupMemory = (ref: any) => {}

            beforeEach(() => {
                originalFinalizationRegistry = FinalizationRegistry as any
                globalThis.FinalizationRegistry = function (cleanupCb: (heldValue: any) => void) {
                    const heldValueSet = new Map()

                    cleanupMemory = ref => {
                        const heldValue = heldValueSet.get(ref)

                        cleanupCb(heldValue)
                    }

                    return {
                        register(target: object, heldValue: any, unregisterToken?: object) {
                            heldValueSet.set(target, heldValue)
                        },
                        unregister() {}
                    } as unknown as FinalizationRegistry<any>
                } as any
            })

            afterEach(() => {
                globalThis.FinalizationRegistry = originalFinalizationRegistry as any
            })

            it('should remove memoized function from memory when there is no ref to memoized function', () => {
                const host = createAppHost([], testHostOptions)

                interface NewAPI {
                    getNewObject(): object
                    getNewObject2(): object
                }
                const newAPI: SlotKey<NewAPI> = { name: 'newAPI' }
                let memFn1: _.MemoizedFunction | null = null
                let memFn2: _.MemoizedFunction | null = null
                const createAPI = (shell: Shell): NewAPI => {
                    memFn1 = shell.memoizeForState(() => ({}), _.stubTrue, _.stubTrue) as _.MemoizedFunction
                    memFn2 = shell.memoizeForState(() => ({}), _.stubTrue, _.stubTrue) as _.MemoizedFunction

                    memFn1.cache.clear = jest.fn()
                    memFn2.cache.clear = jest.fn()

                    return {
                        getNewObject: memFn1 as any,
                        getNewObject2: memFn2 as any
                    }
                }
                addMockShell(host, {
                    declareAPIs: () => [newAPI],
                    attach(shell) {
                        shell.contributeAPI(newAPI, () => createAPI(shell))
                    }
                })

                if (memFn1 && memFn2) {
                    const cacheFnMock1 = (memFn1 as any).cache.clear
                    const cacheFnMock2 = (memFn2 as any).cache.clear

                    host.getStore().dispatch({ type: 'MOCK_ACTION' })
                    host.getStore().flush()

                    expect(cacheFnMock1).toHaveBeenCalledTimes(1)
                    expect(cacheFnMock2).toHaveBeenCalledTimes(1)

                    cleanupMemory(memFn1)

                    host.getStore().dispatch({ type: 'MOCK_ACTION' })
                    host.getStore().flush()

                    expect(cacheFnMock1).toHaveBeenCalledTimes(1)
                    expect(cacheFnMock2).toHaveBeenCalledTimes(2)
                } else {
                    throw Error('memFn1 or memFn2 is not defined')
                }
            })
        })

        describe('lazyEvaluator', () => {
            it('should return a getter that is evaluated only once', () => {
                const { helperShell } = createHostWithDependantPackages(MockAPI)
                const func = jest.fn(() => 42)
                const lazyEval = helperShell.lazyEvaluator(func)

                expect(lazyEval.get()).toBe(42)
                expect(lazyEval.get()).toBe(42)
                expect(func).toHaveBeenCalledTimes(1)
            })
        })
    })

    describe('Entry Point Shell Scoping', () => {
        describe('Shell hasAPI', () => {
            it('should return false if the API is not defined on the host', async () => {
                const host = createAppHost([], testHostOptions)
                const entryPointWithoutAPI: EntryPoint = {
                    name: 'ENTRY_POINT_WITHOUT_API',
                    getDependencyAPIs: () => [],
                    extend(shell: Shell) {
                        expect(shell.hasAPI(MockAPI)).toBeFalsy()
                    }
                }
                await host.addShells([entryPointWithoutAPI])
            })
            it('should return false if the API is defined on the host but is not declared as dependency', async () => {
                const host = createAppHost([mockPackage], testHostOptions)
                const entryPointWithoutAPIDependency: EntryPoint = {
                    name: 'ENTRY_POINT_WITHOUT_API_DEPENDENCY',
                    getDependencyAPIs: () => [],
                    extend(shell: Shell) {
                        expect(shell.hasAPI(MockAPI)).toBeFalsy()
                    }
                }
                await host.addShells([entryPointWithoutAPIDependency])
            })
            it('should return true if the API is defined on the host and is declared as dependency', async () => {
                const host = createAppHost([mockPackage], testHostOptions)
                const entryPointWithAPIDependency: EntryPoint = {
                    name: 'ENTRY_POINT_WITH_API_DEPENDENCY',
                    getDependencyAPIs: () => [MockAPI],
                    extend(shell: Shell) {
                        expect(shell.hasAPI(MockAPI)).toBeTruthy()
                    }
                }
                await host.addShells([entryPointWithAPIDependency])
            })
            it('should return true if the API is declared on the shell', async () => {
                const host = createAppHost([], testHostOptions)
                const entryPointWithAPIDeclaration: EntryPoint = {
                    name: 'ENTRY_POINT_WITH_API_DECLARATION',
                    declareAPIs: () => [MockAPI],
                    attach(shell: Shell) {
                        shell.contributeAPI(MockAPI, () => ({}))
                    },
                    extend(shell: Shell) {
                        expect(shell.hasAPI(MockAPI)).toBeTruthy()
                    }
                }
                await host.addShells([entryPointWithAPIDeclaration])
            })
        })
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

        it('should not trigger other reducers by scoped dispatch', () => {
            interface ScopedState {
                value: number
            }
            interface State1 {
                state1: ScopedState
            }
            const INITIAL_STATE: ScopedState = { value: 0 }
            const SET_VALUE = 'SET_VALUE'
            const setValue = (value: number) => ({ type: SET_VALUE, value })

            const host = createAppHost([], {
                shouldScopeReducers: true,
                monitoring: {}
            })
            const shell1 = addMockShell(host, {
                attach(shell) {
                    shell.contributeState<State1>(() => ({
                        state1: (state: ScopedState = INITIAL_STATE, action): ScopedState => {
                            switch (action.type) {
                                case SET_VALUE:
                                    return { value: action.value }
                            }
                            return state
                        }
                    }))
                }
            })

            // Initial state
            const getState = () => shell1.getStore<State1>().getState().state1.value
            expect(getState()).toBe(0)

            // Scoped dispatch
            shell1.getStore<State1>().dispatch(setValue(73))
            expect(getState()).toBe(73)

            // Unscoped dispatch
            host.getStore().dispatch(setValue(1337))
            expect(getState()).toBe(1337)

            addMockShell(host, {
                extend(shell) {
                    // Scoped dispatch in a different scope
                    shell.getStore().dispatch(setValue(42))
                }
            })
            expect(getState()).toBe(1337)
        })
    })

    describe('Entry Point HMR support', () => {
        const LowLevelSlotKey: SlotKey<string> = { name: 'LOW-LEVEL-SLOT' }
        const HighLevelSlotKey: SlotKey<string> = { name: 'HIGH-LEVEL-SLOT' }
        const ConsumerSlotKey: SlotKey<string> = { name: 'CONSUMER-SLOT' }
        const LowLevelAPI: SlotKey<{ lowLevelFunc(s: string): void }> = {
            name: 'LOW-LEVEL-API'
        }
        const HighLevelAPI: SlotKey<{ highLevelFunc(s: string): void }> = {
            name: 'HIGH-LEVEL-API'
        }
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
            const MockAPI1: SlotKey<{}> = {
                name: 'Mock-API',
                layer: 'NON_EXIXTING_layer'
            }
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
            const MockAPI1: SlotKey<{}> = {
                name: 'Mock-API',
                layer: ['COMMON', 'INFRA']
            }
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
            const MockAPI1: SlotKey<{}> = {
                name: 'Mock-API',
                layer: ['INFRA', 'SPECIFIC']
            }
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
    })

    describe('API version', () => {
        it('should provide API of matching version', async () => {
            const MockAPIv0: SlotKey<{ f1(): void }> = { name: 'Mock-API' }
            const MockAPIv2: SlotKey<{ f2(): void }> = {
                name: 'Mock-API',
                version: 2
            }
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

            const SecondMockAPIv2: SlotKey<{ f2(): void }> = {
                name: 'Mock-API',
                version: 2
            }
            expect(() => {
                addMockShell(host, {
                    declareAPIs: () => [SecondMockAPIv2],
                    attach(shell) {
                        shell.contributeAPI(SecondMockAPIv2, () => ({ f2() {} }))
                    }
                })
            }).toThrowError(
                new RegExp(`Extension slot with key '${SecondMockAPIv2.name}\\\(v${SecondMockAPIv2.version}\\\)' already exists`)
            )
        })
    })

    describe('Host API', () => {
        describe('hasAPI', () => {
            it('should return false if the API is not defined on the host', () => {
                const host = createAppHost([], testHostOptions)
                expect(host.hasAPI(MockAPI)).toBeFalsy()
            })

            it('should return true if the API is defined on the host', () => {
                const host = createAppHost([mockPackage], testHostOptions)
                expect(host.hasAPI(MockAPI)).toBeTruthy()
            })
        })
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
            const host = createAppHost(entryPoints, {
                ...testHostOptions,
                experimentalCyclicMode: true
            })

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
            const host = createAppHost(entryPoints, {
                ...testHostOptions,
                experimentalCyclicMode: true
            })

            expect(host.hasShell(entryPoints[0].name)).toBe(false)
            expect(host.hasShell(entryPoints[1].name)).toBe(false)
            expect(host.hasShell(entryPoints[2].name)).toBe(false)
        })
    })

    describe('Host.executeWhenFree', () => {
        it('should be invoked immediately', () => {
            const host = createAppHost([], testHostOptions) as PrivateAppHost
            const spy = jest.fn()
            host.executeWhenFree('1', spy)
            expect(spy).toBeCalledTimes(1)
        })

        it('when invoked during entryPoints installation, should run once installation resumes ', async () => {
            const host = createAppHost([], testHostOptions) as PrivateAppHost
            const spy = jest.fn()

            const API1: SlotKey<{}> = { name: 'API1' }
            const API2: SlotKey<{}> = { name: 'API2' }
            const API3: SlotKey<{}> = { name: 'API3' }

            const entryPoints: EntryPoint[] = [
                {
                    name: 'Package1',
                    declareAPIs: () => [API1],
                    attach(shell) {
                        host.executeWhenFree('1', spy)
                        shell.contributeAPI(API1, () => ({}))
                    },
                    extend(shell: Shell) {
                        expect(spy).toBeCalledTimes(0)
                    }
                },
                {
                    name: 'Package2',
                    getDependencyAPIs: () => [API1],
                    declareAPIs: () => [API2],
                    attach(shell) {
                        shell.contributeAPI(API2, () => ({}))
                    },
                    extend(shell: Shell) {
                        expect(spy).toBeCalledTimes(0)
                    }
                },
                {
                    name: 'Package3',
                    getDependencyAPIs: () => [API2],
                    declareAPIs: () => [API3],
                    attach(shell) {
                        shell.contributeAPI(API3, () => ({}))
                    },
                    extend(shell: Shell) {
                        expect(spy).toBeCalledTimes(0)
                    }
                }
            ]

            await host.addShells(entryPoints)
            expect(spy).toBeCalledTimes(1)
        })
    })

    describe('Host.onDeclarationsChanged', () => {
        it('should be called once for an entry point attach phase', () => {
            const host = createAppHost([], testHostOptions)
            const spy = jest.fn()
            host.onDeclarationsChanged(spy)
            host.addShells([mockPackage, dependsOnMockPackageEntryPoint, mockPackageWithSlot])
            expect(spy).toBeCalledTimes(1)
        })
        it('should be called once for an entry point detach phase', () => {
            const host = createAppHost([], testHostOptions)
            const spy = jest.fn()
            host.onDeclarationsChanged(spy)
            host.addShells([mockPackage, dependsOnMockPackageEntryPoint, mockPackageWithSlot])
            expect(spy).toBeCalledTimes(1)
            host.removeShells([mockPackage.name])
            expect(spy).toBeCalledTimes(2)
        })
        it('should be called once for an async api contribution in the extend phase', () => {
            const host = createAppHost([], testHostOptions)
            const spy = jest.fn()
            host.onDeclarationsChanged(spy)
            host.addShells([asyncLoadMockPackage])
            expect(spy).toBeCalledTimes(1)
        })
        it('should be called for a slot declaration outside of an entry point', () => {
            const host = createAppHost([], testHostOptions)
            const spy = jest.fn()
            host.onDeclarationsChanged(spy)
            const shell = addMockShell(host)
            expect(spy).toBeCalledTimes(1)
            shell.declareSlot(MockSlot)
            expect(spy).toBeCalledTimes(2)
        })
    })

    describe('Host.verifyPendingEntryPointsAPIsMismatch', () => {
        it("should throw an error on verification if there's a pending entry points that waits for an API that is contributed but is not available", () => {
            const PrivateAPI = { name: 'PrivateAPI' }
            const entryPointA: EntryPoint = {
                name: 'EntryPointA',
                declareAPIs: () => [PrivateAPI],
                attach(shell) {
                    shell.contributeAPI(PrivateAPI, () => ({}))
                }
            }
            const PrivateAPIUsedAsPublicAPI = _.cloneDeep(PrivateAPI)
            const entryPointB: EntryPoint = {
                name: 'EntryPointB',
                getDependencyAPIs: () => [PrivateAPIUsedAsPublicAPI],
                extend(shell) {
                    shell.getAPI(PrivateAPIUsedAsPublicAPI)
                }
            }
            const host = createAppHost([entryPointA, entryPointB], testHostOptions)

            expect(() => host.verifyPendingEntryPointsAPIsMismatch()).toThrowError(
                new RegExp(
                    `Entry point 'EntryPointB' is waiting for API '${PrivateAPI.name}' that will never be available for it to use.
This usually happens when trying to consume a private API as a public API.
If the API is intended to be public, it should be declared as "public: true" in the API key, and built in both bundles.`
                )
            )
        })
    })

    describe('Custom Items Data Structure via AppHost Options (plugins)', () => {
        it('should use customCreateExtensionSlot from appHostOptions when contributing and removing items', async () => {
            interface SlotItem {
                value: string
            }
            const slotKey: SlotKey<SlotItem> = { name: 'host_options_signal_slot' }

            interface SlotContributionAPI {
                contributeItem(fromShell: Shell, item: SlotItem): void
                getItems(): SlotItem[]
            }
            const SlotContributionAPIKey: SlotKey<SlotContributionAPI> = {
                name: 'SLOT_CONTRIBUTION_API'
            }

            const itemsSpy = jest.fn()

            const { createDataStructure, effect } = createSignalItemsDataStructure()

            const slotOwnerEntryPoint: EntryPoint = {
                name: 'SLOT_OWNER_ENTRY_POINT',
                declareAPIs() {
                    return [SlotContributionAPIKey]
                },
                attach(shell: Shell) {
                    const slot = shell.declareSlot(slotKey)
                    shell.contributeAPI(SlotContributionAPIKey, () => ({
                        contributeItem(fromShell: Shell, item: SlotItem) {
                            slot.contribute(fromShell, item)
                        },
                        getItems() {
                            return slot.getItems().map(item => item.contribution)
                        }
                    }))
                }
            }

            const ContributorEntryPoint: EntryPoint = {
                name: 'CONTRIBUTOR_ENTRY_POINT',
                getDependencyAPIs() {
                    return [SlotContributionAPIKey, ListenerAPI]
                },
                extend(shell: Shell) {
                    const api = shell.getAPI(SlotContributionAPIKey)
                    api.contributeItem(shell, { value: 'item1' })
                    api.contributeItem(shell, { value: 'item2' })
                }
            }

            const ListenerAPI: SlotKey<{}> = { name: 'LISTENER_API' }

            const ListenerEntryPoint: EntryPoint = {
                name: 'LISTENER_ENTRY_POINT',
                declareAPIs() {
                    return [ListenerAPI]
                },
                getDependencyAPIs() {
                    return [SlotContributionAPIKey]
                },
                // move to attach to make sure
                attach(shell: Shell) {
                    const slotContributionAPI = shell.getAPI(SlotContributionAPIKey)
                    effect(() => {
                        slotContributionAPI.getItems()
                        itemsSpy()
                    })
                    // contribute an api to make sure that the contribution depends on it and happens after.
                    shell.contributeAPI(ListenerAPI, () => ({}))
                }
            }

            const host = createAppHost([slotOwnerEntryPoint, ContributorEntryPoint, ListenerEntryPoint], {
                monitoring: {},
                plugins: {
                    extensionSlot: {
                        customCreateExtensionSlot: createDataStructure
                    }
                }
            })

            // first was created and then two time
            expect(itemsSpy).toBeCalledTimes(3)

            await host.removeShells([ContributorEntryPoint.name])
            expect(itemsSpy).toBeCalledTimes(4)
        })
    })
})
