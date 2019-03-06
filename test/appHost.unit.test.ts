import _ from 'lodash'

import { createAppHost, mainViewSlotKey, stateSlotKey } from '../src/appHost'

import { AnySlotKey, AppHost, FeatureHost, FeatureLifecycle } from '../src/api'
import { mockFeature, MockFeatureAPI, mockFeatureInitialState, mockFeatureStateKey } from '../testKit/mockFeature'

const createHostWithDependantFeatures = (DependencyAPI: AnySlotKey) => {
    const MockAPI = _.clone(DependencyAPI)
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
                host.contributeApi(MockAPI, () => ({}))
            }
        }
    ]

    const deeplyDependentFeature: FeatureLifecycle[] = [
        {
            name: 'DEPENDENT_MOCK_FEATURE_3',
            getDependencyApis() {
                return [MockAPI]
            }
        }
    ]

    const host = createAppHost([dependentFeature, deeplyDependentFeature])

    return {
        host,
        dependentFeature,
        deeplyDependentFeature
    }
}

describe('App Host', () => {
    it('should create an app host', () => {
        const host = createAppHost([])
        expect(host).toBeInstanceOf(Object)
    })

    describe('Features Installation', () => {
        it('should install initial features', () => {
            const host = createAppHost([mockFeature])
            expect(host.isFeatureInstalled(mockFeature.name)).toBe(true)
        })

        it('should install features after initial installations', () => {
            const host = createAppHost([])
            expect(host.isFeatureInstalled(mockFeature.name)).toBe(false)

            host.installFeatures([mockFeature])
            expect(host.isFeatureInstalled(mockFeature.name)).toBe(true)
        })

        it('should uninstall feature', () => {
            const host = createAppHost([mockFeature])
            host.uninstallFeatures([mockFeature.name])

            expect(host.isFeatureInstalled(mockFeature.name)).toBe(false)
        })

        it('should not install multiple features with the same name', () => {
            expect(() => createAppHost([mockFeature, _.pick(mockFeature, 'name')])).toThrow()
        })

        it('should not install dependent feature until dependency is installed', () => {
            const { host, dependentFeature } = createHostWithDependantFeatures(MockFeatureAPI)

            expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)

            host.installFeatures([mockFeature])
            expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(true)
        })

        it('should install all dependent features chain when dependencies are installed', () => {
            const { host, dependentFeature, deeplyDependentFeature } = createHostWithDependantFeatures(MockFeatureAPI)

            expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)
            expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(false)
            expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(false)

            host.installFeatures([mockFeature])

            expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(true)
            expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(true)
            expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(true)
        })

        it('should uninstall all dependent features chain when dependencies are uninstalled', () => {
            const { host, dependentFeature, deeplyDependentFeature } = createHostWithDependantFeatures(MockFeatureAPI)

            host.installFeatures([mockFeature])
            host.uninstallFeatures([mockFeature.name])

            expect(host.isFeatureInstalled(dependentFeature[0].name)).toBe(false)
            expect(host.isFeatureInstalled(dependentFeature[1].name)).toBe(false)
            expect(host.isFeatureInstalled(deeplyDependentFeature[0].name)).toBe(false)
        })
    })

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
