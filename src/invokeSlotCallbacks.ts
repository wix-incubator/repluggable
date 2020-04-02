import { ExtensionSlot } from './API'

export function invokeSlotCallbacks<T extends any[]>(slot: ExtensionSlot<(...args: T) => void | Promise<void>>, ...args: T): void {
    const slotItems = slot.getItems()

    if (slot.host.options.monitoring.disableMonitoring) {
        slotItems.forEach(slotItem => {
            try {
                slotItem.contribution(...args)
            } catch (e) {
                console.error(e)
            }
        })
        return
    }
    slotItems.forEach(slotItem => {
        const messageId = `${slot.host}-${slot.name}:${slotItem.shell.name}${slotItem.name && '-' + slotItem.name}`
        slotItem.shell.log.monitor(messageId, {}, () => slotItem.contribution(...args))
    })
}
