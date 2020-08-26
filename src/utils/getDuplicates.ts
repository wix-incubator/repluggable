export function getDuplicates<T>(array: T[]): Set<T> {
    const seen = new Set<T>()
    const duplicates = new Set<T>()

    array.forEach(curr => {
        if (seen.has(curr)) {
            duplicates.add(curr)
        }
        seen.add(curr)
    })
    return duplicates
}
