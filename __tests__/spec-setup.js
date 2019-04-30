const Enzyme = require('enzyme')
const Adapter = require('enzyme-adapter-react-16')

beforeAll(() => {
    global.console.error = (...args) => {
        throw new Error(args.join('\n'))
    }

    Enzyme.configure({ adapter: new Adapter() })
})
