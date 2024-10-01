import _ from 'lodash'

export type FunctionInterceptor = (name: string, original: Function) => Function
export type PropertyInterceptor = (name: string, original: any) => any

export interface AnyObject {
    [key: string]: any
}
const isPlainObject = (value: any): value is AnyObject => _.isPlainObject(value)

export function interceptAnyObject<T>(
    inner: T,
    onFunction?: FunctionInterceptor,
    onProperty?: PropertyInterceptor,
    includeNestedLevels?: number
): T {
    if (isPlainObject(inner)) {
        const result = _.mapValues(inner, (original, key) => {
            if (typeof original === 'function' && typeof onFunction === 'function') {
                return onFunction(key, original)
            }
            if (includeNestedLevels && _.isPlainObject(original)) {
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
    return inner
}
