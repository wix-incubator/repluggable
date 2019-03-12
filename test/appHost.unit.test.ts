import _ from 'lodash'

import { createAppHost, mainViewSlotKey, makeLazyFeature, stateSlotKey } from '../src/appHost'

import { AnySlotKey, AppHost, FeatureHost, FeatureLifecycle, SlotKey } from '../src/api'
import {
    mockFeature,
    MockFeatureAPI,
    mockFeatureInitialState,
    MockFeaturePublicAPI,
    mockFeatureStateKey,
    mockFeatureWithPublicAPI
} from '../testKit/mockFeature'

const createHostWithDependantFeatures = (DependencyAPI: AnySlotKey) => {
    const MockAPI2: SlotKey<{}> = { name: 'Mock-API-2' }
    const dependentFeature: FeatureLifecycle[] = [
        {
            name: 'DEPENDENT_MOCK_FEATURE_1',
            getDependencyApis() {
                return [DependencyAPI]
            }
        },
        {
            name: 'DEPENDENT_MOCK_FEATURE_2',
            getDependencyApis() {
                return [DependencyAPI]
            },
            install(host: FeatureHost) {
                host.contributeApi(MockAPI2, () => ({}))
            }
        }
    ]

    const deeplyDependentFeature: FeatureLifecycle[] = [
        {
            name: 'DEPENDENT_MOCK_FEATURE_3',
            getDependencyApis() {
                return [MockAPI2]
            }
        }
    ]

    let getHelperFeatureHost: () => FeatureHost = () => {
        throw new Error()
    }
    const helperLifecycle: FeatureLifecycle = {
        name: 'TEST_HELPER',
        install(host: FeatureHost) {
            getHelperFeatureHost = () => host
        }
    }

    const host = createAppHost([dependentFeature, deeplyDependentFeature, helperLifecycle])

    return {
        host,
        dependentFeature,
        deeplyDependentFeature,
        helperFeatureHost: getHelperFeatureHost()
    }
}

describe('App Host', () => {
    it('should create an app host', () => {
        const host = createAppHost([])
        expect(host).toBeInstanceOf(Object)
    })

    describe('Features Installation', () => {
        it('should install initial features', async () => {
            const host = createAppHost([mockFeature])
            await new Promise(resolve => host.onFeaturesChanged(resolve))

            expect(host.isFeatureInstalled(mockFeature.name)).toBe(true)
        })

        it('should install features after initial installations', async () => {
            const host = createAppHost([])
            await new Promise(resolve => host.onFeaturesChanged(resolve))

            expect(host.isFeatureInstalled(mockFeature.name)).toBe(false)

            host.installFeatures([mockFeature])
            await new Promise(resolve => host.onFeaturesChanged(resolve))

            expect(host.isFeatureInstalled(mockFeature.name)).toBe(true)
        })

        it('should uninstall feature', async () => {
            const host = createAppHost([mockFeature])
            await new Promise(resolve => host.onFeaturesChanged(resolve))

            host.uninstallFeatures([mockFeature.name])
            await new Promise(resolve => host.onFeaturesChanged(resolve))

            expect(host.isFeatureInstalled(mockFeature.name)).toBe(false)
        })

        it('should not install multiple features with the same name', () => {
            expect(() => createAppHost([mockFeature, _.pick(mockFeature, 'name')])).toThrow()
        })

        it('should install lazy featues', async () => {
            const lazyFeature = makeLazyFeature(mockFeature.name, async () => mockFeature)
            const host = createAppHost([lazyFeature])
            await new Promise(resolve => host.onFeaturesChanged(resolve))

            expect(host.isFeatureInstalled(lazyFeature.name)).toBe(true)
        })
    })

    _.forEach(
        [
            { testCase: 'private API keys', dependencyAPI: MockFeatureAPI, providerLifecycle: mockFeature },
            {
                testCase: 'public API keys',
                dependencyAPI: { name: MockFeaturePublicAPI.name, public: true },
                providerLifecycle: mockFeatureWithPublicAPI
            }
        ],
        ({ testCase, dependencyAPI, providerLifecycle }) => {
            describe(`Dependecy features installation (${testCase})`, () => {
                it('should not install dependent feature until dependency is installed', async () => {
                    const { host, dependentFeature } = createHostWithDependantFeatures(dependencyAPI)
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)

                    host.installFeatures([providerLifecycle])
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(true)
                })

                it('should install all dependent features chain when dependencies are installed from lifecycle', async () => {
                    const { host, dependentFeature, deeplyDependentFeature } = createHostWithDependantFeatures(dependencyAPI)
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)
                    expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(false)
                    expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(false)

                    host.installFeatures([providerLifecycle])
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(true)
                    expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(true)
                    expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(true)
                })

                it('should install all dependent features chain when dependencies are installed outside of lifecycle', async () => {
                    const { host, dependentFeature, deeplyDependentFeature, helperFeatureHost } = createHostWithDependantFeatures(
                        dependencyAPI
                    )
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)
                    expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(false)
                    expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(false)

                    helperFeatureHost.contributeApi(dependencyAPI, () => ({ stubTrue: () => true }))
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(true)
                    expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(true)
                    expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(true)
                })

                it('should uninstall all dependent features chain when dependencies are uninstalled', async () => {
                    const { host, dependentFeature, deeplyDependentFeature } = createHostWithDependantFeatures(dependencyAPI)
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    host.installFeatures([providerLifecycle])
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    host.uninstallFeatures([providerLifecycle.name])
                    await new Promise(resolve => host.onFeaturesChanged(resolve))

                    expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)
                    expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(false)
                    expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(false)
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

            const host = createAppHost([mockFeature])

            const actual = sortSlotKeys(host.getAllSlotKeys())
            const expected = sortSlotKeys([mainViewSlotKey, stateSlotKey, MockFeatureAPI])

            expect(actual).toEqual(expected)
        })

        describe('private API slot key', () => {
            it('should equal itself', () => {
                const host = createAppHost([mockFeature])

                const api = host.getApi(MockFeatureAPI)

                expect(api).toBeTruthy()
            })

            it('should not equal another key with same name', () => {
                const host = createAppHost([mockFeature])
                const fakeKey: SlotKey<MockFeatureAPI> = { name: MockFeatureAPI.name }

                expect(() => {
                    host.getApi(fakeKey)
                }).toThrowError(new RegExp(MockFeatureAPI.name))
            })

            it('should not equal another key with same name that claims it is public', () => {
                const host = createAppHost([mockFeature])
                const fakeKey1: SlotKey<MockFeatureAPI> = {
                    name: MockFeatureAPI.name,
                    public: true
                }
                const fakeKey2: SlotKey<MockFeatureAPI> = {
                    name: MockFeatureAPI.name,
                    public: false
                }
                const fakeKey3: any = {
                    name: MockFeatureAPI.name,
                    public: 'zzz'
                }

                expect(() => host.getApi(fakeKey1)).toThrowError(new RegExp(MockFeatureAPI.name))
                expect(() => host.getApi(fakeKey2)).toThrowError(new RegExp(MockFeatureAPI.name))
                expect(() => host.getApi(fakeKey3)).toThrowError(new RegExp(MockFeatureAPI.name))
            })
        })

        describe('public API slot key', () => {
            it('should equal itself', () => {
                const host = createAppHost([mockFeatureWithPublicAPI])

                const api = host.getApi(MockFeaturePublicAPI)

                expect(api).toBeTruthy()
            })

            it('should equal another key with same name that claims it is public', () => {
                const host = createAppHost([mockFeatureWithPublicAPI])
                const anotherKey: SlotKey<MockFeatureAPI> = {
                    name: MockFeaturePublicAPI.name,
                    public: true
                }

                const api = host.getApi(anotherKey)

                expect(api).toBeTruthy()
            })

            it('should not equal another key with same name than does not claim it is public', () => {
                const host = createAppHost([mockFeatureWithPublicAPI])
                const anotherKey1: SlotKey<MockFeatureAPI> = {
                    name: MockFeaturePublicAPI.name
                }
                const anotherKey2: SlotKey<MockFeatureAPI> = {
                    name: MockFeaturePublicAPI.name,
                    public: false
                }
                const anotherKey3: any = {
                    name: MockFeaturePublicAPI.name,
                    public: 'zzz'
                }

                expect(() => host.getApi(anotherKey1)).toThrowError(new RegExp(MockFeaturePublicAPI.name))
                expect(() => host.getApi(anotherKey2)).toThrowError(new RegExp(MockFeaturePublicAPI.name))
                expect(() => host.getApi(anotherKey3)).toThrowError(new RegExp(MockFeaturePublicAPI.name))
            })
        })
    })

    describe('Host State', () => {
        it('should have a store with initial state', () => {
            const host = createAppHost([])
            expect(host.getStore().getState()).toEqual({
                $installedFeatures: {
                    installedFeatures: {}
                }
            })
        })
    })

    describe('Feature Contributions', () => {
        it('should contribute API', () => {
            const host = createAppHost([mockFeature])
            expect(host.getApi(MockFeatureAPI)).toBeTruthy()
        })

        it('should contribute API after initial installations', () => {
            const host = createAppHost([])
            expect(() => host.getApi(MockFeatureAPI)).toThrow()

            host.installFeatures([mockFeature])
            expect(host.getApi(MockFeatureAPI)).toBeTruthy()
        })

        it('should contribute state', () => {
            const getMockFeatureState = (host: AppHost) => _.get(host.getStore().getState(), [mockFeature.name, mockFeatureStateKey], null)

            const host = createAppHost([])
            expect(getMockFeatureState(host)).toBeNull()

            host.installFeatures([mockFeature])
            expect(getMockFeatureState(host)).toEqual(mockFeatureInitialState)
        })
    })

    describe('Feature Context', () => {
        it('should be able to call an API declared in dependencies', () => {
            const featureThatCallsAPI: FeatureLifecycle = {
                name: 'FEATURE_WITH_API_CALL',
                getDependencyApis() {
                    return [MockFeatureAPI]
                },
                extend(host: FeatureHost) {
                    host.getApi(MockFeatureAPI).stubTrue()
                }
            }
            const host = createAppHost([mockFeature])
            expect(() => host.installFeatures([featureThatCallsAPI])).not.toThrow()
        })

        it('should not be able to call an API not declared in dependencies', () => {
            const featureThatCallsAPI: FeatureLifecycle = {
                name: 'FEATURE_WITH_API_CALL',
                extend(host: FeatureHost) {
                    host.getApi(MockFeatureAPI).stubTrue()
                }
            }
            const host = createAppHost([mockFeature])
            expect(() => host.installFeatures([featureThatCallsAPI])).toThrow()
        })

        it('should get scoped state', done => {
            const state = {}
            const MOCK_STATE_KEY = 'mockStateKey'
            const featureWithState: FeatureLifecycle = {
                name: 'FEATURE_WITH_STATE',
                install(host: FeatureHost) {
                    host.contributeState(() => ({
                        [MOCK_STATE_KEY]: () => state
                    }))
                },
                extend(host: FeatureHost) {
                    expect(_.get(host.getStore().getState(), MOCK_STATE_KEY)).toBe(state)
                    done()
                }
            }
            createAppHost([featureWithState])
        })

        it('should be able to uninstall own installed features', () => {
            const featureThatInstallsOtherFeature: FeatureLifecycle = {
                name: 'FEATURE_THAT_INSTALLS_A_FEATURE',
                extend(host: FeatureHost) {
                    host.installFeatures([mockFeature])
                    host.uninstallFeatures([mockFeature.name])
                }
            }
            expect(() => createAppHost([featureThatInstallsOtherFeature])).not.toThrow()
        })

        it('should not be able to uninstall not own installed features', () => {
            const featureThatInstallsOtherFeature: FeatureLifecycle = {
                name: 'FEATURE_THAT_INSTALLS_A_FEATURE',
                extend(host: FeatureHost) {
                    host.uninstallFeatures([mockFeature.name])
                }
            }
            expect(() => createAppHost([mockFeature, featureThatInstallsOtherFeature])).toThrow()
        })
    })
})
