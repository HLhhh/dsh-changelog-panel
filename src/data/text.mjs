// text.mjs — the one helper every data module uses to declare bilingual text.
//
// Schema revision 2: reader-facing prose is a frozen { en, zh } pair so the
// panel's 中文/EN switch changes the content, not just the chrome.
//
//   L('English text')          → { en: 'English text', zh: '' }
//   L('English text', '中文')  → { en: 'English text', zh: '中文' }
//
// A missing (or non-string) Chinese argument records an empty `zh`, which the
// panel renders as the English fallback instead of an empty card; verify.mjs
// reports how many pairs still lack a translation.
//
// `tests/build.mjs` inlines this file ahead of the data modules, so the data
// modules themselves stay import-free and plain ESM. This module is import-free,
// I/O-free and network-free like the rest of plugin/src/data.
//
// The pair is frozen: the dataset is read-only, and verify.mjs asserts that
// every bilingual field is a pair produced here rather than a hand-built object.

export function L(en, zh) {
  return Object.freeze({
    en: typeof en === 'string' ? en : '',
    zh: typeof zh === 'string' ? zh : '',
  })
}
