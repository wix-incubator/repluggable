import _ from 'lodash'
import { AnyFeature, FeatureLifecycle } from '../src/api'
import { AnyExtensionSlot } from '../src/extensionSlot'
import { getFeaturesDependencies } from '../testKit'

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
interface FeaturesMap {
    [name: string]: AnyFeature
}
const allFeatures: FeaturesMap = {
    A: {
        name: 'A'
    },
    B: {
        name: 'B',
        declareApis() {
            return [APIs.B]
        }
    },
    C: {
        name: 'C',
        getDependencyApis() {
            return [APIs.B]
        },
        declareApis() {
            return [APIs.C]
        }
    },
    D: [
        {
            name: 'D',
            getDependencyApis() {
                return [APIs.C]
            },
            declareApis() {
                return [APIs.E]
            }
        },
        {
            name: 'E'
        }
    ],
    F: {
        name: 'F',
        getDependencyApis() {
            return [APIs.E]
        }
    }
}

describe('App Host TestKit', () => {
    it('should get feature dependencies', () => {
        const toResult = (features: AnyFeature[]) =>
            _(features)
                .flatten()
                .sortBy('name')
                .value()
        const getDependencies = (features: AnyFeature[]) => toResult(getFeaturesDependencies(_.values(allFeatures), features))
        const { A, B, C, D, F } = allFeatures

        expect(getDependencies([])).toEqual(toResult([]))
        expect(getDependencies([A])).toEqual(toResult([A]))
        expect(getDependencies([C])).toEqual(toResult([B, C]))
        expect(getDependencies([D])).toEqual(toResult([B, C, D]))
        expect(getDependencies([D, B])).toEqual(toResult([B, C, D]))
        expect(getDependencies([D, B, A])).toEqual(toResult([B, C, D, A]))

        // TODO: Should 'E' be included ?
        expect(getDependencies([F])).toEqual(toResult([B, C, (D as FeatureLifecycle[])[0], F]))
    })
})
