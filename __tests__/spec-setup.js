import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

configure({ adapter: new Adapter() });

global.console.error = (...args) => {
  throw new Error(args.join('\n'));
};
