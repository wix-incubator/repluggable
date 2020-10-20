import _ from 'lodash'

export interface AnyObject {
    [key: string]: any
}
export type FunctionInterceptor = (name: string, original: Function) => Function
export type PropertyInterceptor = (name: string, original: any) => any

export function interceptAnyObject<T extends AnyObject>(
    inner: T,
    onFunction?: FunctionInterceptor,
    onProperty?: PropertyInterceptor,
    includeNestedLevels?: number
): T {
    const result = _.mapValues(inner, (original, key) => {
        if (typeof original === 'function' && typeof onFunction === 'function') {
            return onFunction(key, original)
        }
        if (includeNestedLevels && _.isObjectLike(original)) {
            return interceptAnyObject(
                original,
                onFunction ? (name, func) => onFunction(`${key}.${name}`, func) : undefined,
                onProperty ? (name, value) => onProperty(`${key}.${name}`, value) : undefined,
                includeNestedLevels - 1
            )
        }
        if (typeof onProperty === 'function') {
            return onProperty(key, original)
        }
        return original
    }) as T

    return result
}
