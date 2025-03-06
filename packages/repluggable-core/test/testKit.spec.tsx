import _ from 'lodash'
import { EntryPoint, EntryPointOrPackage, SlotKey } from '../src/API'
import { AnyExtensionSlot } from '../src/extensionSlot'
import {
    getPackagesDependencies,
    createAppHost,
    addMockShell,
    MockAPI,
    mockPackage,
    createAppHostWithPacts,
    PactAPI,
    asyncLoadMockPackage,
    dependsOnMockPackageEntryPoint,
    MockPublicAPI,
    createAppHostAndWaitForLoading
} from '../testKit'

interface APIKeys {
    [name: string]: AnyExtensionSlot
}
const APIs: APIKeys = {
    A: { name: 'A' },
    B: { name: 'B' },
    C: { name: 'C' },
    D: { name: 'D' },
    E: { name: 'E' },
    F: { name: 'F' }
}
interface PackagesMap {
    [name: string]: EntryPointOrPackage
}
const allPackages: PackagesMap = {
    A: {
        name: 'A'
    },
    B: {
        name: 'B',
        declareAPIs() {
            return [APIs.B]
        }
    },
    C: {
        name: 'C',
        getDependencyAPIs() {
            return [APIs.B]
        },
        declareAPIs() {
            return [APIs.C]
        }
    },
    D: [
        {
            name: 'D',
            getDependencyAPIs() {
                return [APIs.C]
            },
            declareAPIs() {
                return [APIs.E]
            }
        },
        {
            name: 'E'
        }
    ],
    F: {
        name: 'F',
        getDependencyAPIs() {
            return [APIs.E]
        }
    }
}

describe('App Host TestKit', () => {
    it('should get packages dependencies', () => {
        const toResult = (packages: EntryPointOrPackage[]) => _(packages).flatten().sortBy('name').value()
        const getDependencies = (packages: EntryPointOrPackage[]) => toResult(getPackagesDependencies(_.values(allPackages), packages))
        const { A, B, C, D, F } = allPackages

        expect(getDependencies([])).toEqual(toResult([]))
        expect(getDependencies([A])).toEqual(toResult([A]))
        expect(getDependencies([C])).toEqual(toResult([B, C]))
        expect(getDependencies([D])).toEqual(toResult([B, C, D]))
        expect(getDependencies([D, B])).toEqual(toResult([B, C, D]))
        expect(getDependencies([D, B, A])).toEqual(toResult([B, C, D, A]))

        // TODO: Should 'E' be included ?
        expect(getDependencies([F])).toEqual(toResult([B, C, (D as EntryPoint[])[0], F]))
    })

    it('should add mock shell', async () => {
        const host = createAppHost([mockPackage])
        const shell = addMockShell(host, {
            name: 'MOCK',
            getDependencyAPIs() {
                return [MockAPI]
            }
        })
        //await new Promise(resolve => host.onShellsChanged(resolve))
        expect(host.hasShell('MOCK')).toBe(true)
        expect(() => shell.getAPI(MockAPI)).not.toThrow()
    })

    it('should throw if could not add mock shell', async () => {
        const host = createAppHost([mockPackage])
        const APIKey = 'API that would never exist'
        const add = async () => {
            addMockShell(host, {
                name: 'MOCK',
                getDependencyAPIs() {
                    return [MockAPI, { name: APIKey }]
                }
            })
            //await new Promise(resolve => host.onShellsChanged(resolve))
        }
        await expect(add()).rejects.toThrow(new RegExp(APIKey))
    })

    it('should create app host with provided pacts', () => {
        interface MockAPI1 {
            f(): number
        }
        const key: SlotKey<MockAPI1> = { name: 'MOCK-API', layer: 'MOCK_LAYER' }
        const pactAPI: MockAPI1 & PactAPI<MockAPI1> = {
            getAPIKey: () => key,
            f: () => 1
        }
        const host = createAppHostWithPacts([], [pactAPI])
        expect(host.getAPI(key).f()).toBe(1)
    })

    describe('createAppHostAndWaitForLoading', () => {
        beforeAll(() => {
            jest.useFakeTimers()
        })

        afterAll(() => {
            jest.useRealTimers()
        })

        it('should wait for loading all packages', async () => {
            const hostPromise = createAppHostAndWaitForLoading([dependsOnMockPackageEntryPoint, asyncLoadMockPackage], [])
            jest.runAllTimers()
            const host = await hostPromise
            expect(host.getAPI(MockPublicAPI)).toBeDefined()
        })

        it('should throw if failed to load all packages', async () => {
            const hostPromise = createAppHostAndWaitForLoading([dependsOnMockPackageEntryPoint], [])
            jest.runAllTimers()
            await expect(hostPromise).rejects.toThrow(new RegExp(MockPublicAPI.name))
        })
    })
})
