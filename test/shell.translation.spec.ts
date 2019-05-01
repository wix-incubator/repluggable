import _ from 'lodash'
import { Shell } from '../src/API'
import { createAppHost } from '../src/appHost'

function createAppHostWithTwoShells(firstAttach?: (shell: Shell) => void, secondAttach?: (shell: Shell) => void) {
    let firstShell: Shell | null = null
    let secondShell: Shell | null = null

    const appHost = createAppHost([
        {
            name: 'FIRST_ENTRY_POINT',
            attach(shell: Shell) {
                firstShell = shell
                firstAttach && firstAttach(shell)
            }
        },
        {
            name: 'SECOND_ENTRY_POINT',
            attach(shell: Shell) {
                secondShell = shell
                secondAttach && secondAttach(shell)
            }
        }
    ])

    if (!firstShell || !secondShell) {
        throw new Error('createHostWithEntryPoints did not create 2 shells')
    }

    return {
        appHost,
        firstShell: firstShell as Shell,
        secondShell: secondShell as Shell
    }
}

describe('translations', () => {
    it('should implement translations use case', () => {
        const { firstShell, secondShell } = createAppHostWithTwoShells(
            // 1st entry point
            shell => {
                shell.contributeTranslations({ a_b_c: 'text-1' })
            },
            // 2nd entry point
            shell => {
                shell.contributeTranslations({ d_e_f: 'text-2' })
            }
        )

        expect(firstShell.translate('a_b_c')).toBe('text-1')
        expect(secondShell.translate('d_e_f')).toBe('text-2')
    })

    it('should merge multiple contributions per entry point', () => {
        const { firstShell } = createAppHostWithTwoShells(
            // 1st entry point
            shell => {
                shell.contributeTranslations({
                    a_b_c: 'text-1',
                    d_e_f: 'text-2'
                })
                shell.contributeTranslations({
                    d_e_f: 'text-2-OVER',
                    g_h_i: 'text-3'
                })
            }
            // 2nd entry point - nothing
        )

        expect(firstShell.translate('a_b_c')).toBe('text-1')
        expect(firstShell.translate('d_e_f')).toBe('text-2-OVER')
        expect(firstShell.translate('g_h_i')).toBe('text-3')
    })

    it('should scope translations per entry point', () => {
        const { firstShell, secondShell } = createAppHostWithTwoShells(
            // 1st entry point
            shell => {
                shell.contributeTranslations({
                    a_b_c: 'text-1'
                })
            },
            // 2nd entry point
            shell => {
                shell.contributeTranslations({
                    a_b_c: 'text-2'
                })
            }
        )

        expect(firstShell.translate('a_b_c')).toBe('text-1')
        expect(secondShell.translate('a_b_c')).toBe('text-2')
    })

    it('should allow custom translation func per entry point', () => {
        const { firstShell, secondShell } = createAppHostWithTwoShells(
            // 1st entry point
            shell => {
                shell.contributeTranslations({
                    a_b_c: 'text-1'
                })
            },
            // 2nd entry point
            shell => {
                shell.useTranslationFunction(key => `CUSTOM:${key}`)
            }
        )

        expect(firstShell.translate('a_b_c')).toBe('text-1')
        expect(secondShell.translate('a_b_c')).toBe('CUSTOM:a_b_c')
    })
})
