/**
 * カタカナ正規化ユーティリティ
 * 氏名の揺れを吸収して重複登録を防止
 */

/**
 * ひらがな→カタカナ変換
 */
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (match) => {
    const chr = match.charCodeAt(0) + 0x60;
    return String.fromCharCode(chr);
  });
}

/**
 * 半角カタカナ→全角カタカナ変換
 */
function hankakuToZenkaku(str: string): string {
  const kanaMap: Record<string, string> = {
    'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
    'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
    'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
    'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
    'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
    'ｳﾞ': 'ヴ', 'ﾜﾞ': 'ヷ', 'ｦﾞ': 'ヺ',
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
    '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・',
    'ｰ': 'ー', 'ﾞ': '゛', 'ﾟ': '゜'
  };

  let result = str;
  // 濁点・半濁点付き文字を先に変換
  Object.keys(kanaMap).forEach((key) => {
    if (key.length > 1) {
      result = result.replace(new RegExp(key, 'g'), kanaMap[key]);
    }
  });
  // 1文字ずつ変換
  Object.keys(kanaMap).forEach((key) => {
    if (key.length === 1) {
      result = result.replace(new RegExp(key, 'g'), kanaMap[key]);
    }
  });

  return result;
}

/**
 * 氏名の正規化
 * - ひらがな→カタカナ
 * - 半角→全角
 * - 空白除去
 * - 大文字化（英字）
 * - トリム
 * 
 * @example
 * normalizeKana("やまだ")     → "ヤマダ"
 * normalizeKana("ﾔﾏﾀﾞ")       → "ヤマダ"
 * normalizeKana("山田 太郎")  → "山田太郎"
 * normalizeKana("YAMADA")     → "YAMADA"
 */
export function normalizeKana(str: string): string {
  if (!str) return '';

  return str
    .trim()                          // 前後の空白除去
    .replace(/\s+/g, '')             // 空白すべて除去
    .replace(/　/g, '')              // 全角スペース除去
    .split('')
    .map(char => {
      // ひらがな→カタカナ
      const katakana = hiraganaToKatakana(char);
      // 半角→全角
      const zenkaku = hankakuToZenkaku(katakana);
      // 英字は大文字化
      return zenkaku.toUpperCase();
    })
    .join('');
}

/**
 * 電話番号の正規化
 * - ハイフン除去
 * - 空白除去
 * - 全角→半角
 * 
 * @example
 * normalizePhone("090-1234-5678")  → "09012345678"
 * normalizePhone("090 1234 5678")  → "09012345678"
 * normalizePhone("０９０-1234-5678") → "09012345678"
 */
export function normalizePhone(str: string): string {
  if (!str) return '';

  return str
    .trim()
    .replace(/[-\s　]/g, '')         // ハイフン・空白除去
    .replace(/[０-９]/g, (s) => {    // 全角数字→半角
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
}
