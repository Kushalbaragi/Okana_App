const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Inline requires: a module is loaded the first time something actually uses it,
// not all up front when the app starts. Most of the app's modules (every sheet,
// the charts, the export code) are not needed to show the first screen, so this
// is the cheapest cold-start win there is. Expo leaves it off by default.
const defaultGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = defaultGetTransformOptions ? await defaultGetTransformOptions(...args) : {};
  return { ...options, transform: { ...options.transform, inlineRequires: true } };
};

module.exports = withNativeWind(config, { input: './global.css' });
