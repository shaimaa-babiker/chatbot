/* Tell TypeScript that `*.tokens` files exist and resolve to a string.
 * This pairs with the esbuild `loader: { '.tokens': 'text' }` config
 * in tsup.config.ts which inlines the file contents as a default-exported
 * string at build time. */
declare module '*.tokens' {
  const text: string;
  export default text;
}
