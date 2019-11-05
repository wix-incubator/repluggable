import _ from 'lodash'
export interface ComparePropsOptions {
    compareFuncProps: boolean
}

export const propsDeepEqual = ({ compareFuncProps }: ComparePropsOptions) => (propsA: any, propsB: any) => {
    const customizer: _.IsEqualCustomizer = (a, b, key, objectA) => {
        if (key === 'children' && objectA === propsA) {
            if (_.isFunction(a) && _.isFunction(b)) {
                return false
            }
            return
        }
        if (!compareFuncProps && _.isFunction(a) && _.isFunction(b)) {
            return true
        }
        return
    }
    return _.isEqualWith(propsA, propsB, customizer)
}
