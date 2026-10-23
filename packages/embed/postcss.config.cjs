/* Intentionally empty postcss config.
 *
 * The repo's root postcss.config.mjs references @tailwindcss/postcss which
 * isn't installed. We don't need postcss for the embed (CSS is loaded as
 * text at build time and injected as a <style> tag at runtime), so we ship
 * an empty config here to keep vitest/vite happy when it walks up looking
 * for a postcss config in this package. */
module.exports = { plugins: [] };
