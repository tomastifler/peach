/* Language tags for library text: titles, synopses and aliases come from Japanese or English sites, while the page is `lang="zh-CN"`.
 * With `lang` set, the browser picks fonts and glyph forms by language (the `:lang(ja)` font stack is in `react/base.css` and
 * `web/css/01-base.css`), and long paragraphs also decide their alignment by language.
 *
 * The criteria only recognize two cases: containing kana means Japanese; having no Han characters at all and only Latin letters means English. Pure Han text cannot tell Chinese from Japanese
 * (canonical performer names are Simplified Chinese anyway), so the page's language is kept and nothing is guessed. */

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

export function textLang(value: unknown): 'ja' | 'en' | undefined {
  const text = String(value ?? '');
  if (KANA.test(text)) return 'ja';
  if (!HAN.test(text) && LATIN.test(text)) return 'en';
  return undefined;
}

/** For building HTML: when the language is recognized, gives ` lang="…"`, otherwise an empty string. */
export const langAttr = (value: unknown): string => {
  const lang = textLang(value);
  return lang ? ` lang="${lang}"` : '';
};
