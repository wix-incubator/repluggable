module.exports = {
  entry: {
    repluggable: 'index',
  },
  exports: 'repluggable',
  hmr: true,
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
    lodash: '_',
    'react-redux': 'ReactRedux',
    redux: 'Redux',
  },
  servers: {
    cdn: {
      port: 3201,
    },
  },
};
