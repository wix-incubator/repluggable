import _ from 'lodash'

export interface AnyObject {
    [key: string]: any
}
export type FunctionInterceptor = (name: string, original: Function) => Function
export type PropertyInterceptor = (name: string, original: any) => any

export function interceptAnyObject<T extends AnyObject>(inner: T, onFunction?: FunctionInterceptor, onProperty?: PropertyInterceptor): T {
    const result = _.mapValues(inner, (original, key) => {
        if (_.isFunction(original) && _.isFunction(onFunction)) {
            return onFunction(key, original)
        }
        if (_.isObjectLike(original)) {
            return interceptAnyObject(
                original,
                onFunction ? (name, func) => onFunction(`${key}.${name}`, func) : undefined,
                onProperty ? (name, value) => onProperty(`${key}.${name}`, value) : undefined
            )
        }
        if (_.isFunction(onProperty)) {
            return onProperty(key, original)
        }
        return original
    }) as T

    return result
}
