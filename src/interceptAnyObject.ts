export interface AnyObject {
    [key: string]: any
}
export type FunctionInterceptor = (name: string, original: Function) => Function
export type PropertyInterceptor = (name: string, original: any) => any

export function interceptAnyObject<T extends AnyObject>(inner: T, onFunction?: FunctionInterceptor, onProperty?: PropertyInterceptor): T {
    const result = {} as T

    Object.keys(inner).forEach(key => {
        const original = inner[key]
        result[key] =
            typeof original === 'function'
                ? onFunction
                    ? onFunction(key, original)
                    : original
                : onProperty
                ? onProperty(key, original)
                : original
    })

    return result
}
