import _ from 'lodash'
import { FunctionInterceptor, PropertyInterceptor } from '../src/API'
import { interceptAnyObject } from '../src/interceptAnyObject'

type LogSpy = jest.Mock<void, string[]>

function takeLog(spy: LogSpy): string[] {
    return _.flatten(spy.mock.calls)
}

interface StringDict {
    [key: string]: string
}

function dictToString(dict: StringDict): string {
    return Object.keys(dict)
        .map(key => ({
            key,
            value: dict[key]
        }))
        .filter(kvp => typeof kvp.value === 'string')
        .map(kvp => `${kvp.key}:${kvp.value}`)
        .join(';')
}

function argToString(arg: any): string {
    switch (typeof arg) {
        case 'number':
        case 'string':
            return `${arg}`
        case 'object':
            return dictToString(arg)
        case 'undefined':
            return 'undefined'
        default:
            return '???'
    }
}

interface TestTarget {
    voidFunc(): void
    voidFuncWithArgs(str: string, num: number, obj: StringDict): void
    nonVoidFunc(): StringDict
    nonVoidFuncWithArgs(str: string, num: number): StringDict
    scalarProp: string
    objectProp: TestTargetNested
}

interface TestTargetNested {
    nestedFunc(): void
    nestedProp: string
    nestedObject: TestTargetNestedLevelTwo
}

interface TestTargetNestedLevelTwo {
    nestedFuncLevelTwo(): number
}

function createTestTarget(spy: LogSpy): TestTarget {
    return {
        voidFunc() {
            spy('voidFunc')
        },
        voidFuncWithArgs(str: string, num: number, dict: StringDict): void {
            spy(`voidFuncWithArgs(str=${str},num=${num},dict=${dictToString(dict)})`)
        },
        nonVoidFunc() {
            spy('nonVoidFunc')
            return {
                aaa: '111'
            }
        },
        nonVoidFuncWithArgs(str: string, num: number): StringDict {
            spy(`nonVoidFuncWithArgs(str=${str},num=${num})`)
            return {
                bbb: '222'
            }
        },
        scalarProp: 'original-scalar',
        objectProp: {
            nestedProp: 'original-nested',
            nestedFunc() {
                spy('objectProp.nestedFunc')
            },
            nestedObject: {
                nestedFuncLevelTwo() {
                    spy('objectProp.nestedObject.nestedFuncLevelTwo')
                    return 12345
                }
            }
        }
    }
}

describe('interceptAnyObject', () => {
    function createFuncInterceptor(spy: LogSpy): FunctionInterceptor {
        return (name, func) => {
            return (...args: any[]) => {
                spy(`BEFORE:${name}(${args.map(argToString).join(';')})`)
                const retVal = func.apply(null, args)
                spy(`AFTER:${name}(${argToString(retVal)})`)
                return retVal
            }
        }
    }

    function createPropInterceptor(spy: LogSpy): PropertyInterceptor {
        return (name, value) => {
            return typeof value === 'string' ? value.replace('original', `INTERCEPTED[${name}]`) : value
        }
    }

    it('should return same members if no interceptors passed', () => {
        const spy: LogSpy = jest.fn()
        const real = createTestTarget(spy)
        const intercepted = interceptAnyObject(real)

        expect(intercepted.voidFunc).toBe(real.voidFunc)
        expect(intercepted.scalarProp).toBe(real.scalarProp)
        expect(intercepted.objectProp.nestedFunc).toBe(real.objectProp.nestedFunc)
    })

    it('should intercept void functions', () => {
        const spy: LogSpy = jest.fn()
        const real = createTestTarget(spy)
        const intercepted = interceptAnyObject(real, createFuncInterceptor(spy))

        intercepted.voidFunc()

        const log = takeLog(spy)
        expect(log).toEqual(['BEFORE:voidFunc()', 'voidFunc', 'AFTER:voidFunc(undefined)'])
    })

    it('should intercept non-void functions with arguments', () => {
        const spy: LogSpy = jest.fn()
        const real = createTestTarget(spy)
        const intercepted = interceptAnyObject(real, createFuncInterceptor(spy))

        const retVal = intercepted.nonVoidFuncWithArgs('abc', 123)

        const log = takeLog(spy)
        expect(log).toEqual([
            'BEFORE:nonVoidFuncWithArgs(abc;123)',
            'nonVoidFuncWithArgs(str=abc,num=123)',
            'AFTER:nonVoidFuncWithArgs(bbb:222)'
        ])
        expect(dictToString(retVal)).toBe('bbb:222')
    })

    it('should intercept scalar props', () => {
        const spy: LogSpy = jest.fn()
        const real = createTestTarget(spy)
        const intercepted = interceptAnyObject(real, createFuncInterceptor(spy), createPropInterceptor(spy))

        const propValue = intercepted.scalarProp

        expect(propValue).toBe('INTERCEPTED[scalarProp]-scalar')
    })

    it('should intercept nested objects', () => {
        const spy: LogSpy = jest.fn()
        const real = createTestTarget(spy)
        const intercepted = interceptAnyObject(real, createFuncInterceptor(spy), createPropInterceptor(spy), 10)

        const nestedPropValue = intercepted.objectProp.nestedProp
        intercepted.objectProp.nestedFunc()

        const log = takeLog(spy)
        expect(log).toEqual(['BEFORE:objectProp.nestedFunc()', 'objectProp.nestedFunc', 'AFTER:objectProp.nestedFunc(undefined)'])
        expect(nestedPropValue).toBe('INTERCEPTED[objectProp.nestedProp]-nested')
    })

    it('should intercept multiple levels of nested objects', () => {
        const spy: LogSpy = jest.fn()
        const real = createTestTarget(spy)
        const intercepted = interceptAnyObject(real, createFuncInterceptor(spy), createPropInterceptor(spy), 10)

        const nestedFuncLevelTwoRetVal = intercepted.objectProp.nestedObject.nestedFuncLevelTwo()

        const log = takeLog(spy)
        expect(log).toEqual([
            'BEFORE:objectProp.nestedObject.nestedFuncLevelTwo()',
            'objectProp.nestedObject.nestedFuncLevelTwo',
            'AFTER:objectProp.nestedObject.nestedFuncLevelTwo(12345)'
        ])
        expect(nestedFuncLevelTwoRetVal).toBe(12345)
    })
})
