module.exports = {
    "transform": {
        "^.+\\.tsx?$": "babel-jest",
        '.+\\.(css|styl|less|sass|scss|png|jpg|ttf|woff|woff2)$': 'jest-transform-stub'
    },
    "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    moduleFileExtensions: [
        "js", "json", "jsx", "ts", "tsx", "node"
    ],
    clearMocks: true,
    coverageDirectory: "coverage",
    setupFilesAfterEnv: ["./testSetup.js"]
}
