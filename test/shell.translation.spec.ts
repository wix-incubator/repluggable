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

describe('Shell.contributeTranslations', () => {
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

describe('Shell.translate', () => {
    it('should handle placeholders', () => {
        const { firstShell } = createAppHostWithTwoShells(shell => {
            shell.contributeTranslations({
                no_placeholder: 'literal text',
                single_placeholder: 'this is a {color} car',
                many_placeholders: 'this {color} {brand} costs $ {quote} K',
                only_many_placeholders: '{first_name} {last_name}',
                only_placeholder: '{user_name}',
                empty_string: '',
                positional_placeholders: 'this {0} {1} costs $ {2} K'
            })
        })

        expect(firstShell.translate('no_placeholder', { a: 'b' })).toBe('literal text')
        expect(firstShell.translate('single_placeholder', { color: 'green' })).toBe('this is a green car')
        expect(firstShell.translate('many_placeholders', { color: 'white', brand: 'Honda', quote: 123 })).toBe(
            'this white Honda costs $ 123 K'
        )
        expect(firstShell.translate('only_many_placeholders', { first_name: 'Jon', last_name: 'Snow' })).toBe('Jon Snow')
        expect(firstShell.translate('empty_string', { a: 'b' })).toBe('')
        expect(firstShell.translate('positional_placeholders', ['white', 'Honda', 123])).toBe('this white Honda costs $ 123 K')
    })
})
