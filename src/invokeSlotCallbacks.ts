import { ExtensionSlot } from './API'

export function invokeSlotCallbacks<T extends any[]>(slot: ExtensionSlot<(...args: T) => void | Promise<void>>, ...args: T): void {
    const slotItems = slot.getItems()
    const monitoring = !slot.host.options.monitoring.disableMonitoring

    slotItems.forEach(slotItem => {
        try {
            if (monitoring) {
                const messageId = `${slot.host}-${slot.name}:${slotItem.shell.name}${slotItem.name && '-' + slotItem.name}`
                slotItem.shell.log.monitor(messageId, {}, () => slotItem.contribution(...args))
            } else {
                slotItem.contribution(...args)
            }
        } catch (e) {
            slotItem.shell.log.error(e)
        }
    })
}
