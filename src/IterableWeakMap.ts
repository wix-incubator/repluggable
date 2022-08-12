interface WakMapValue<K extends object, V> {
    value: V
    ref: WeakRef<K>
}

export class IterableWeakMap<K extends object = object, V = any> {
    private readonly weakMap = new WeakMap<K, WakMapValue<K, V>>()
    private readonly refSet: Set<WeakRef<any>> = new Set()
    private readonly finalizationGroup = new FinalizationRegistry(IterableWeakMap.cleanup)

    private static cleanup({ set, ref }: { set: Set<WeakRef<any>>; ref: WeakRef<any> }) {
        set.delete(ref)
    }

    constructor(iterable?: unknown[][]) {
        if (iterable) {
            for (const [key, value] of iterable) {
                this.set(key, value)
            }
        }
    }

    set(key: any, value: any) {
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
    }

    get(key: any) {
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

    *[Symbol.iterator]() {
        for (const ref of this.refSet) {
            const key = ref.deref()

            if (!key) {
                continue
            }
            const value = this.weakMap.get(key)
            if (value) {
                yield [key, value.value]
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
