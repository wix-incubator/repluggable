/* tslint:disable */

function __get<O, K extends keyof O, D = undefined>(obj: O, key: K, defaultValue: D): O[K] | D {
    const value = obj[key]
    return typeof value !== 'undefined' ? value : defaultValue
}

const obj = { x: 123, y: 'abc' }
__get(obj, 'x', undefined)


/* tslint:enable */