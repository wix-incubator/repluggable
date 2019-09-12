function __get<O, K extends keyof O, D = undefined>(o: O, key: K, defaultValue: D): O[K] | D {
    const value = o[key]
    return typeof value !== 'undefined' ? value : defaultValue
}

const obj = { x: 123, y: 'abc' }
__get(obj, 'x', undefined)
