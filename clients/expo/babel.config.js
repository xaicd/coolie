/**
 * Expo needs a Babel config to transform JSX and the React Native runtime; its
 * absence is why `expo start` / `expo export` could not run from this app before.
 * `babel-preset-expo` is declared in devDependencies rather than relied on
 * transitively, because this package installs standalone (pnpm does not expose
 * another package's dependencies here).
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
