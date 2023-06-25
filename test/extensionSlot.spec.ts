import { SlotKey } from '../src'
import { addMockShell, createAppHost } from '../testKit/v2'
import { PrivateExtensionSlot, Shell, EntryPoint } from '../src/API'

describe('ExtensionSlot', () => {
    describe('Subscribe', () => {
        it('should be invoked on contribution', () => {
            const slotKey: SlotKey<{}> = {
                name: 'mock_key'
            }
            const host = createAppHost([])
            const shell = addMockShell(host)
            const spy = jest.fn()
            const slot = shell.declareSlot(slotKey) as PrivateExtensionSlot<{}>

            slot.subscribe(spy)

            slot.contribute(shell, () => ({}))

            expect(spy).toBeCalledTimes(1)

            slot.contribute(shell, () => ({}))

            expect(spy).toBeCalledTimes(2)
        })
        it('should be invoked once when contribution is during installation phase', () => {
            interface SlotItem {
                name: string
            }
            const slotKey: SlotKey<SlotItem> = {
                name: 'MOCK_SLOT'
            }
            interface MockContributionAPI {
                contributeItem(fromShell: Shell, item: SlotItem): void
            }

            const ContributionAPI: SlotKey<MockContributionAPI> = {
                name: 'CONTRIBUTION_API'
            }

            const spy = jest.fn()

            const contributionEntryPoint: EntryPoint = {
                name: 'PRIVATE CONTRIBUTION ENTRY POINT',
                declareAPIs() {
                    return [ContributionAPI]
                },
                attach(shell) {
                    const slot = shell.declareSlot(slotKey) as PrivateExtensionSlot<SlotItem>
                    slot.subscribe(spy)
                    shell.contributeAPI(ContributionAPI, () => ({
                        contributeItem(fromShell, item) {
                            shell.getSlot(slotKey).contribute(fromShell, item)
                        }
                    }))
                }
            }

            const API_A: SlotKey<{}> = { name: 'API_A' }

            const itemContributionEntryPointA: EntryPoint = {
                name: 'ITEM CONTRIBUTION ENTRY POINT A',
                getDependencyAPIs() {
                    return [ContributionAPI]
                },
                declareAPIs(): SlotKey<{}>[] {
                    return [API_A]
                },
                attach(shell: Shell) {
                    shell.contributeAPI(API_A, () => ({}))
                },
                extend(shell: Shell) {
                    shell.getAPI(ContributionAPI).contributeItem(shell, { name: 'A.1' })
                    shell.getAPI(ContributionAPI).contributeItem(shell, { name: 'A.2' })
                }
            }

            const itemContributionEntryPointB: EntryPoint = {
                name: 'ITEM CONTRIBUTION ENTRY POINT B',
                getDependencyAPIs() {
                    return [ContributionAPI, API_A]
                },
                extend(shell: Shell) {
                    shell.getAPI(ContributionAPI).contributeItem(shell, { name: 'B.1' })
                    shell.getAPI(ContributionAPI).contributeItem(shell, { name: 'B.2' })
                }
            }

            createAppHost([contributionEntryPoint, itemContributionEntryPointA, itemContributionEntryPointB])

            expect(spy).toBeCalledTimes(1)
        })
    })
})
