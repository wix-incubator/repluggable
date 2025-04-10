interface WeakMapValue<K extends object, V> {
    value: V
    ref: WeakRefOrPlain<K>
}

type WeakRefOrPlain<T extends object> = WeakRef<T> | T

const isWeakRef = (val: unknown): val is WeakRef<any> => {
    return typeof val === 'object' && val !== null && 'deref' in val
}

const createWeakMapOrPlain = <T extends object>(val: T): WeakRef<T> | T => {
    return typeof WeakRef !== 'undefined' ? new WeakRef(val) : val
}

export class IterableWeakMap<K extends object = object, V = any> implements Map<K, V> {
    private readonly weakMap = new WeakMap<K, WeakMapValue<K, V>>()
    private readonly refSet: Set<WeakRefOrPlain<K>> = new Set()
    private readonly finalizationGroup =
        typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(IterableWeakMap.cleanup) : null

    private static cleanup({ set, ref }: { set: Set<WeakRefOrPlain<any>>; ref: WeakRefOrPlain<any> }) {
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
        const ref = createWeakMapOrPlain(key)

        this.weakMap.set(key, { value, ref })
        this.refSet.add(ref)
        this.finalizationGroup?.register(
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
        this.finalizationGroup?.unregister(entry.ref)
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

    forEach(callbackfn: (value: V, key: K, map: this) => void, thisArg?: any): void {
        for (const [key, value] of this) {
            callbackfn(value, key, this )
        }
    }

    get [Symbol.toStringTag]() {
        return '[object IterableWeakMap]'
    }

    // can't use private type of MapIterator
    *[Symbol.iterator](): any {
        for (const ref of this.refSet) {
            const key = isWeakRef(ref) ? ref.deref() : ref

            if (!key) {
                continue
            }
            const value = this.weakMap.get(key)
            if (value) {
                yield [key, value.value] as [K, V]
            }
        }
    }

    entries(): ReturnType<Map<K, V>['entries']> {
        return this[Symbol.iterator]() as unknown as ReturnType<Map<K, V>['entries']>
    }

    *keys(): ReturnType<Map<K, V>['keys']>  {
        for (const [key] of this) {
            yield key
        }
    }

    *values():  ReturnType<Map<K, V>['values']> {
        for (const [_, value] of this) {
            yield value
        }
    }
}


