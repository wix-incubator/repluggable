import _ from 'lodash'

export const propsDeepEqual = (propsA: any, propsB: any) => {
    const customizer: _.IsEqualCustomizer = (a, b, key, objectA) => {
        if (key === '_owner') {
            return true
        }
        if (key === 'children' && objectA === propsA) {
            if (typeof a === 'function' && typeof b === 'function') {
                return false
            }
            return
        }
        if (typeof a === 'function' && typeof b === 'function') {
            return true
        }
        return
    }
    return _.isEqualWith(propsA, propsB, customizer)
}
