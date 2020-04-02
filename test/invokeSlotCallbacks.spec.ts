import _ from 'lodash'
import { EntryPoint, SlotKey, ExtensionSlot, invokeSlotCallbacks, AppHostOptions } from '../src'
import { createAppHost, addMockShell } from '../testKit'
import { emptyLoggerOptions } from '../testKit/emptyLoggerOptions'

type TestCallback = (input: string) => void
const testSlotKey: SlotKey<TestCallback> = { name: 'TEST_SLOT' }

describe('invokeSlotCallbacks', () => {
    let slotUnderTest: ExtensionSlot<TestCallback>

    const testEntryPoint: EntryPoint = {
        name: 'TEST',
        attach(shell) {
            slotUnderTest = shell.declareSlot<TestCallback>(testSlotKey)
        }
    }

    const monitoringEnabledCases: boolean[] = [true, false]

    monitoringEnabledCases.forEach(monitoringEnabled => {
        const hostOptions: AppHostOptions = {
            ...emptyLoggerOptions,
            monitoring: { disableMonitoring: !monitoringEnabled }
        }

        it(`should invokes every callback once (monitoring = ${monitoringEnabled})`, () => {
            const host = createAppHost([testEntryPoint], hostOptions)
            const contributorShell1 = addMockShell(host)
            const contributorShell2 = addMockShell(host)
            const log: string[] = []

            slotUnderTest.contribute(contributorShell1, input => log.push(`1:${input}`))
            slotUnderTest.contribute(contributorShell2, input => log.push(`2:${input}`))

            invokeSlotCallbacks(slotUnderTest, 'A')

            expect(log).toEqual(['1:A', '2:A'])
        })

        it(`should invoke every callback when some throw (monitoring = ${monitoringEnabled})`, () => {
            const host = createAppHost([testEntryPoint], hostOptions)
            const contributorShells = [addMockShell(host), addMockShell(host), addMockShell(host), addMockShell(host)]
            const log: string[] = []

            slotUnderTest.contribute(contributorShells[0], input => log.push(`1:${input}`))
            slotUnderTest.contribute(contributorShells[1], () => {
                throw new Error('ERROR_2')
            })
            slotUnderTest.contribute(contributorShells[2], input => log.push(`3:${input}`))
            slotUnderTest.contribute(contributorShells[3], () => {
                throw new Error('ERROR_4')
            })

            invokeSlotCallbacks(slotUnderTest, 'A')
            expect(log).toEqual(['1:A', '3:A'])
        })
    })
})
