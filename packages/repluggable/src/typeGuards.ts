interface ErrorLikeObject {
    name: string
    message: string
    stack?: string
}

export function isErrorLikeObject(value: unknown): value is ErrorLikeObject {
    return (
        !!value &&
        typeof value === 'object' &&
        'name' in value &&
        typeof value.name === 'string' &&
        'message' in value &&
        typeof value.message === 'string'
    )
}
