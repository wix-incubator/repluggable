export interface AnySlotKey {
    readonly name: string
    readonly public?: boolean // TODO: Move to new interface - APIKey
}

/**
 * A key that represents an {ExtensionSlot} of shape T that's held in the {AppHost}
 * Created be calling {Shell.declareSlot}
 * Retrieved by calling {Shell.getSlot} (scoped to specific {Shell})
 *
 * @export
 * @interface SlotKey
 * @extends {AnySlotKey}
 * @template T
 */
export interface SlotKey<T> extends AnySlotKey {
    /**
     * Holds no value, only triggers type-checking of T
     */
    readonly empty?: T
    /**
     * Application layer/layers that will restrict usage of APIs contributed by this entry point.
     * Layers hierarchy is defined in the host options
     * @See {AppHostOptions.layers}
     */
    readonly layer?: string | string[] // TODO: Move to new interface - APIKey
    /**
     * Version of the API that will be part of the API key unique identification
     */
    readonly version?: number // TODO: Move to new interface - APIKey
}