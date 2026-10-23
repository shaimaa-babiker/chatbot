/* jsdom polyfills — vitest runs in jsdom which doesn't ship every DOM
 * API. We stub the ones the widget uses so the smoke test can mount
 * without exploding. None of these are bugs in the production code. */
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
