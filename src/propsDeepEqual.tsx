import _ from 'lodash'

export const propsDeepEqual = (propsA: any, propsB: any) => {
    const customizer: _.IsEqualCustomizer = (a, b, key, objectA) => {
        if (key === 'children' && objectA === propsA) {
            if (_.isFunction(a) && _.isFunction(b)) {
                return false
            }
            return
        }
        if (_.isFunction(a) && _.isFunction(b)) {
            return true
        }
        return
    }
    return _.isEqualWith(propsA, propsB, customizer)
}
