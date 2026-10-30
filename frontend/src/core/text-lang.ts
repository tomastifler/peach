/* 馆藏文本的语言标记：片名、简介、别名来自日文站或英文站，页面是 `lang="zh-CN"`。
 * 标上 `lang` 之后浏览器按语言挑字体与字形（`:lang(ja)` 的字体栈见 `react/base.css` 与
 * `web/css/01-base.css`），长文段落也按语言决定对齐方式。
 *
 * 判据只认得出的两种：含假名是日文；一个汉字都没有、只有拉丁字母是英文。纯汉字分不出中日
 * （女优规范名本就是简体中文），沿用页面的语言，不猜。 */

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

export function textLang(value: unknown): 'ja' | 'en' | undefined {
  const text = String(value ?? '');
  if (KANA.test(text)) return 'ja';
  if (!HAN.test(text) && LATIN.test(text)) return 'en';
  return undefined;
}

/** 拼 HTML 用：认得出语言时给出 ` lang="…"`，否则空串。 */
export const langAttr = (value: unknown): string => {
  const lang = textLang(value);
  return lang ? ` lang="${lang}"` : '';
};
