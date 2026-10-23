/* Imports the raw CSS text as a string at build time. The file uses a
 * custom .tokens extension (not .css) so tsup's postcss plugin never
 * sees it, and esbuild's `text` loader (configured in tsup.config.ts)
 * inlines the file contents as a default-exported string. The CSS is
 * then injected at runtime by `ensureAssistlyStyles` in injectStyles.ts. */
import styles from '../styles.tokens';
export default styles as string;
