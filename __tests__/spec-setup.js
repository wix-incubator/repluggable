const enzyme = require('enzyme');
const Adapter = require('enzyme-adapter-react-16');

enzyme.configure({ adapter: new Adapter() });

global.console.error = (...args) => {
  throw new Error(args.join('\n'));
};
