import React from 'react'
import { propsDeepEqual } from '../src/propsDeepEqual'

interface MyProps {
    value: number
    comp: React.ReactElement<MyProps>
}

const MyComponent: React.FC<MyProps> = ({ value, comp }) => (
    <div>
        {value} - {comp}
    </div>
)

describe('propsDeepEqual', () => {
    it('should compare two equal components', () => {
        const comp101 = <MyComponent value={10} comp={<MyComponent value={10} comp={<div />} />} />
        const comp102 = <MyComponent value={10} comp={<MyComponent value={10} comp={<div />} />} />
        const comp20 = <MyComponent value={10} comp={<MyComponent value={20} comp={<div />} />} />
        expect(propsDeepEqual(comp101.props, comp102.props)).toBeTruthy()
        expect(propsDeepEqual(comp101.props, comp20.props)).toBeFalsy()
    })

    it('should avoid circular references', () => {})
})
