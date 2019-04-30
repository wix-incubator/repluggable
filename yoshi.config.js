const _ = require('lodash');

const externalsMap = {
  'react': 'React',
  'react-dom': 'ReactDOM',
  'lodash': '_',
  'react-redux': 'ReactRedux',
  'redux': 'Redux'
};

const externals = _.reduce(externalsMap, (result, val, key) => {
  result[key] = {
    root: val,
    commonjs: key,
    commonjs2: key,
    amd: key
  };
  return result;
}, {});

module.exports = {
  entry: 'index',
  exports: 'repluggable',
  hmr: true,
  externals
};
