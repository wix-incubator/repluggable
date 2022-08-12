interface WakMapValue<K extends object, V> {
    value: V
    ref: WeakRef<K>
}

export class IterableWeakMap<K extends object = object, V = any> implements Map<K, V> {
    private readonly weakMap = new WeakMap<K, WakMapValue<K, V>>()
    private readonly refSet: Set<WeakRef<any>> = new Set()
    private readonly finalizationGroup = new FinalizationRegistry(IterableWeakMap.cleanup)

    private static cleanup({ set, ref }: { set: Set<WeakRef<any>>; ref: WeakRef<any> }) {
        set.delete(ref)
    }

    constructor(iterable?: [K, V][]) {
        if (iterable) {
            for (const [key, value] of iterable) {
                this.set(key, value)
            }
        }
    }

    set(key: K, value: V) {
        const ref = new WeakRef(key)

        this.weakMap.set(key, { value, ref })
        this.refSet.add(ref)
        this.finalizationGroup.register(
            key,
            {
                set: this.refSet,
                ref
            },
            ref
        )

        return this
    }

    get(key: K): V | undefined {
        const entry = this.weakMap.get(key)
        return entry && entry.value
    }

    delete(key: any) {
        const entry = this.weakMap.get(key)
        if (!entry) {
            return false
        }

        this.weakMap.delete(key)
        this.refSet.delete(entry.ref)
        this.finalizationGroup.unregister(entry.ref)
        return true
    }

    get size() {
        return this.refSet.size
    }

    has(key: K): boolean {
        return this.weakMap.has(key)
    }

    clear() {
        for (const [key] of this) {
            this.delete(key)
        }
    }

    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) {
        for (const [key, value] of this) {
            callbackfn(value, key, this)
        }
    }

    get [Symbol.toStringTag]() {
        return '[object IterableWeakMap]'
    }

    *[Symbol.iterator]() {
        for (const ref of this.refSet) {
            const key = ref.deref()

            if (!key) {
                continue
            }
            const value = this.weakMap.get(key)
            if (value) {
                yield [key, value.value] as [K, V]
            }
        }
    }

    entries() {
        return this[Symbol.iterator]()
    }

    *keys() {
        for (const [key] of this) {
            yield key
        }
    }

    *values() {
        for (const [_, value] of this) {
            yield value
        }
    }
}
