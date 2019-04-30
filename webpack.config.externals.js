const externalLibNames = [
        'lodash',
        'react',
        'react-dom',
        'react-redux',
        'redux'
];

function configExternal(libName) {
    let result = {};
    result[libName] = {
        root: ['repluggable', 'packages', libName],
        commonjs: libName,
        commonjs2: libName
    };
    return result;
}

module.exports = externalLibNames.reduce((config, libName) => Object.assign(config, configExternal(libName)), {});
