import { IterableWeakMap } from '../src/IterableWeakMap'

describe('IterableWeakMap', () => {
    function runCommonTests() {
        describe('#constructor', () => {
            it('should add initial values to Map', function () {
                const ref = {}
                const value = {}
                const iwm = new IterableWeakMap([[ref, value]])

                const entries = Array.from(iwm.entries())
                expect(entries).toEqual([[ref, value]])
            })
        })

        describe('#set', () => {
            it('should add new value', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}

                iwm.set(ref, value)

                const entries = Array.from(iwm.entries())
                expect(entries).toEqual([[ref, value]])
            })
        })

        describe('#get', () => {
            it('should return value if ref exists in Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}

                iwm.set(ref, value)

                const getValue = iwm.get(ref)
                expect(getValue).toEqual(value)
            })

            it("should return undefined if ref doesn't exist in Map", function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}

                iwm.set(ref, value)

                const getValue = iwm.get(ref2)
                expect(getValue).toBeUndefined()
            })
        })

        describe('#delete', () => {
            it('should delete value from Map and return true', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}

                iwm.set(ref, value)

                const res = iwm.delete(ref)

                expect(iwm.size).toBe(0)
                expect(res).toBeTruthy()
            })

            it('should return false if there is no ref in Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const refToDelete = {}

                iwm.set(ref, value)

                const res = iwm.delete(refToDelete)

                expect(iwm.size).toBe(1)
                expect(res).toBeFalsy()
            })
        })

        describe('#size', () => {
            it('should return size of Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}
                const value2 = {}

                iwm.set(ref, value)
                iwm.set(ref2, value2)

                expect(iwm.size).toBe(2)
            })
        })

        describe('#has', () => {
            it('should return true if map has ref', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}

                iwm.set(ref, value)

                expect(iwm.has(ref)).toBe(true)
            })

            it("should return false if map doesn't have ref", function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}

                iwm.set(ref, value)

                expect(iwm.has(ref2)).toBe(false)
            })
        })

        describe('#clear', () => {
            it('should delete all refs from Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}
                const value2 = {}

                iwm.set(ref, value)
                iwm.set(ref2, value2)

                expect(iwm.size).toBe(2)

                iwm.clear()

                expect(iwm.size).toBe(0)
            })
        })

        describe('#forEach', () => {
            it('should iterate over all entries in Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                let ref2: any = {}
                const value2 = {}

                iwm.set(ref, value)
                iwm.set(ref2, value2)

                const res: [object, object, IterableWeakMap<any, any>][] = []

                ref2 = null

                iwm.forEach((v, k, map) => {
                    res.push([v, k, map])
                })

                // expect(res).toEqual([
                //     [ref, value, iwm],
                //     [ref2, value2, iwm]
                // ])
            })
        })

        describe('#keys', () => {
            it('should return all keys in Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}
                const value2 = {}

                iwm.set(ref, value)
                iwm.set(ref2, value2)

                const res = Array.from(iwm.keys())

                expect(res).toEqual([ref, ref2])
            })
        })

        describe('#valeus', () => {
            it('should return all values in Map', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}
                const value2 = {}

                iwm.set(ref, value)
                iwm.set(ref2, value2)

                const res = Array.from(iwm.values())

                expect(res).toEqual([value, value2])
            })
        })
    }

    describe('environment supports WeakRef and FinalizationRegistry', () => {
        runCommonTests()

        describe('memory', () => {
            let originalFinalizationRegistry: FinalizationRegistry
            let cleanupMemory = (ref: any) => {}

            beforeEach(() => {
                originalFinalizationRegistry = FinalizationRegistry as any
                window.FinalizationRegistry = function (cleanupCb: (heldValue: any) => void) {
                    const heldValueSet = new Map()

                    cleanupMemory = ref => {
                        const heldValue = heldValueSet.get(ref)

                        cleanupCb(heldValue)
                    }

                    return ({
                        register(target: object, heldValue: any, unregisterToken?: object) {
                            heldValueSet.set(target, heldValue)
                        },
                        unregister() {}
                    } as unknown) as FinalizationRegistry
                } as any
            })

            afterEach(() => {
                window.FinalizationRegistry = originalFinalizationRegistry as any
            })

            it('should be auto cleaned when ref in Map is freeing in program', function () {
                const iwm = new IterableWeakMap()
                const ref = {}
                const value = {}
                const ref2 = {}
                const value2 = {}

                iwm.set(ref, value)
                iwm.set(ref2, value2)

                expect(iwm.size).toBe(2)
                expect(Array.from(iwm.entries())).toEqual([
                    [ref, value],
                    [ref2, value2]
                ])

                // emulate freeing "ref" in memory
                cleanupMemory(ref)

                expect(iwm.size).toBe(1)
                expect(Array.from(iwm.entries())).toEqual([[ref2, value2]])
            })
        })
    })

    describe("environment doesn't support WeakRef and FinalizationRegistry", () => {
        let originalWeakRef: WeakRefConstructor | undefined
        let originalFinalizationRegistry: FinalizationRegistryConstructor | undefined

        beforeAll(() => {
            originalWeakRef = global.WeakRef
            // @ts-ignore
            global.WeakRef = undefined
            originalFinalizationRegistry = global.FinalizationRegistry
            // @ts-ignore
            global.FinalizationRegistry = undefined
        })

        afterAll(() => {
            if (originalWeakRef && originalFinalizationRegistry) {
                global.WeakRef = originalWeakRef
                originalWeakRef = undefined

                global.FinalizationRegistry = originalFinalizationRegistry
                originalFinalizationRegistry = undefined
            }
        })

        runCommonTests()
    })
})
