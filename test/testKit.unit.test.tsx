import _ from 'lodash'
import { AnyPackage, EntryPoint } from '../src/api'
import { AnyExtensionSlot } from '../src/extensionSlot'
import { getPackagesDependencies } from '../testKit'

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
    [name: string]: AnyPackage
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
        const toResult = (packages: AnyPackage[]) =>
            _(packages)
                .flatten()
                .sortBy('name')
                .value()
        const getDependencies = (packages: AnyPackage[]) => toResult(getPackagesDependencies(_.values(allPackages), packages))
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
})
