const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  entry: path.resolve(__dirname, 'src'),
  devtool: 'inline-source-map',
  mode: 'production',
  module: {
    rules: [{ 
      test: /\.(ts|js)x?$/, 
      loader: 'babel-loader', 
      exclude: /node_modules/ 
    }],
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin(),
  ],  
  resolve: {
    extensions: ['.js', '.jsx', '.tsx', '.ts', '.json'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'react-app-lego.min.js',
    library: 'react-app-lego',
    libraryTarget: 'umd',
    umdNamedDefine: true
  }
};
