import { isErrorLikeObject } from '../src/typeGuards'

describe('isErrorLikeObject', () => {
    it('should return true for a real Error', () => {
        expect(isErrorLikeObject(new Error('test'))).toBe(true)
    })

    it('should return true for a TypeError', () => {
        expect(isErrorLikeObject(new TypeError('type error'))).toBe(true)
    })

    it('should return true for an error-like plain object', () => {
        expect(isErrorLikeObject({ name: 'CustomError', message: 'something went wrong' })).toBe(true)
    })

    it('should return true for an error-like object with stack', () => {
        expect(isErrorLikeObject({ name: 'CustomError', message: 'msg', stack: 'stack trace' })).toBe(true)
    })

    it('should return false for a string', () => {
        expect(isErrorLikeObject('error message')).toBe(false)
    })

    it('should return false for an object missing name', () => {
        expect(isErrorLikeObject({ message: 'no name' })).toBe(false)
    })

    it('should return false for an object missing message', () => {
        expect(isErrorLikeObject({ name: 'NoMessage' })).toBe(false)
    })

    it('should return false for an object with non-string name', () => {
        expect(isErrorLikeObject({ name: 123, message: 'msg' })).toBe(false)
    })

    it('should return false for an object with non-string message', () => {
        expect(isErrorLikeObject({ name: 'Err', message: 123 })).toBe(false)
    })

    it('should return false for an empty object', () => {
        expect(isErrorLikeObject({})).toBe(false)
    })
})
