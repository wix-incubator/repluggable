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
        const interceptValue = (original: any, key: string) => {
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
        }

        const innerObject: AnyObject = inner
        const result: AnyObject = {}
        for (const key of Object.keys(innerObject)) {
            const descriptor = Object.getOwnPropertyDescriptor(innerObject, key)
            if (descriptor && (descriptor.get || descriptor.set)) {
                // Accessors may return different values over time (e.g. services initialized after the API is contributed),
                // so they are delegated to the inner object (and intercepted) on every access rather than read once and frozen
                Object.defineProperty(result, key, {
                    enumerable: true,
                    configurable: true,
                    get: descriptor.get && (() => interceptValue(innerObject[key], key)),
                    set: descriptor.set && ((value: any) => (innerObject[key] = value))
                })
            } else {
                result[key] = interceptValue(innerObject[key], key)
            }
        }

        return result as T
    }
    return inner
}
