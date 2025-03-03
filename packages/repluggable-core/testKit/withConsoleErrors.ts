const noopConsoleError: Console['error'] = () => {}

export function withConsoleErrors<T>(action: () => T, mock?: Console['error']): T {
    const savedConsoleError = console.error
    console.error = mock || noopConsoleError

    try {
        return action()
    } finally {
        console.error = savedConsoleError
    }
}
