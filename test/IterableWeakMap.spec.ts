import { IterableWeakMap } from '../src/IterableWeakMap'

describe('IterableWeakMap', () => {
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
        it('should delete value from Map', function () {
            const iwm = new IterableWeakMap()
            const ref = {}
            const value = {}

            iwm.set(ref, value)

            iwm.delete(ref)

            expect(iwm.size).toBe(0)
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
            const ref2 = {}
            const value2 = {}

            iwm.set(ref, value)
            iwm.set(ref2, value2)

            const res: [object, object, IterableWeakMap<any, any>][] = []

            iwm.forEach((v, k, map) => {
                res.push([v, k, map])
            })

            expect(res).toEqual([
                [ref, value, iwm],
                [ref2, value2, iwm]
            ])
        })
    })

    describe('memory', () => {
        let cleanupMemory = (ref: any) => {}

        beforeEach(() => {
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
