/**
 * Streaming sentence chunker: LLM tokens in -> TTS-ready text chunks out.
 *
 * The single biggest latency win in the streaming voice pipeline is starting TTS
 * before the LLM has finished. We emit the FIRST chunk as early as possible (even
 * at a comma) so the candidate hears audio fast, then prefer full sentences for
 * natural prosody.
 *
 * Ported from rocketizer-mono packages/api/src/server/gateway/voice-chunker.ts.
 */

// Markdown / non-speech artefacts the model sometimes emits despite the prompt.
const MD_LINK = /\[([^\]]+)\]\([^)]+\)/g; //          [text](url) -> text
const MD_BULLET = /^\s*[-*+]\s+/gm; //                "- item" -> "item"
const MD_HEAD = /^\s*#+\s*/gm; //                     "## Heading" -> "Heading"
const MD_MARKS = /[*_`~#>]/g; //                      emphasis/code/quote chars
const EMOJI = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{2190}-\u{21ff}]+/gu;
const WS = /\s+/g;

const RE_DIGIT = /\p{Nd}/u;
const RE_ALPHA = /\p{L}/u;
const isDigit = (ch: string): boolean => RE_DIGIT.test(ch);
const isAlpha = (ch: string): boolean => RE_ALPHA.test(ch);

const CURRENCY_PREFIX_AMOUNT =
  /(^|[^\p{L}\p{N}])(?:₹|rs\.?|inr)\s*([+-]?\d(?:[\d,   ]*\d)?(?:\.\d+)?)(?:\s*(crores?|cr|lakhs?|lacs?|lac|l|k)(?=$|[^\p{L}\p{N}]))?(?:\s*(?:rupees?|rs\.?|inr)(?=$|[^\p{L}\p{N}]))?/giu;
const CURRENCY_SUFFIX_AMOUNT =
  /(^|[^\p{L}\p{N}])([+-]?\d(?:[\d,   ]*\d)?(?:\.\d+)?)(?:\s*(crores?|cr|lakhs?|lacs?|lac|l|k)(?=$|[^\p{L}\p{N}]))?\s*(?:rupees?|rs\.?|inr)(?=$|[^\p{L}\p{N}])/giu;

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
] as const;
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;

function underThousandToWords(value: number): string {
  const parts: string[] = [];
  let n = value;
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    parts.push(ones ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens]);
  } else if (n > 0 || parts.length === 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

function integerToIndianWords(value: bigint): string {
  if (value === 0n) return 'zero';

  const crore = 10_000_000n;
  const lakh = 100_000n;
  const thousand = 1_000n;
  const parts: string[] = [];
  let n = value;

  if (n >= crore) {
    const count = n / crore;
    parts.push(`${integerToIndianWords(count)} crore`);
    n %= crore;
  }
  if (n >= lakh) {
    const count = Number(n / lakh);
    parts.push(`${underThousandToWords(count)} lakh`);
    n %= lakh;
  }
  if (n >= thousand) {
    const count = Number(n / thousand);
    parts.push(`${underThousandToWords(count)} thousand`);
    n %= thousand;
  }
  if (n > 0n) parts.push(underThousandToWords(Number(n)));
  return parts.join(' ');
}

function splitAmount(raw: string): { negative: boolean; whole: bigint; fraction: string } | null {
  const compact = raw.replace(/[,   ]/g, '');
  const negative = compact.startsWith('-');
  const unsigned = compact.replace(/^[+-]/, '');
  const [wholeRaw, fractionRaw = '', extra] = unsigned.split('.');
  if (extra !== undefined || !/^\d+$/.test(wholeRaw) || (fractionRaw && !/^\d+$/.test(fractionRaw))) {
    return null;
  }
  return { negative, whole: BigInt(wholeRaw), fraction: fractionRaw };
}

function currencyUnit(rawUnit: string | undefined): 'thousand' | 'lakh' | 'crore' | null {
  if (!rawUnit) return null;
  const unit = rawUnit.toLowerCase();
  if (unit === 'k') return 'thousand';
  if (unit === 'l' || unit.startsWith('lac') || unit.startsWith('lakh')) return 'lakh';
  if (unit === 'cr' || unit.startsWith('crore')) return 'crore';
  return null;
}

function decimalAmountToWords(rawAmount: string): string | null {
  const parsed = splitAmount(rawAmount);
  if (!parsed) return null;
  const sign = parsed.negative ? 'minus ' : '';
  const fraction = parsed.fraction.replace(/0+$/, '');
  if (!fraction) return `${sign}${integerToIndianWords(parsed.whole)}`;
  const digitWords = [...fraction].map((digit) => ONES[Number(digit)]).join(' ');
  return `${sign}${integerToIndianWords(parsed.whole)} point ${digitWords}`;
}

function currencyAmountToWords(rawAmount: string, rawUnit?: string): string | null {
  const unit = currencyUnit(rawUnit);
  if (unit) {
    const amount = decimalAmountToWords(rawAmount);
    return amount ? `${amount} ${unit} rupees` : null;
  }

  const parsed = splitAmount(rawAmount);
  if (!parsed) return null;
  const paiseDigits = parsed.fraction ? parsed.fraction.padEnd(2, '0').slice(0, 2) : '';
  const paise = paiseDigits ? Number(paiseDigits) : 0;
  const sign = parsed.negative ? 'minus ' : '';
  const paiseText = paise ? `${underThousandToWords(paise)} ${paise === 1 ? 'paisa' : 'paise'}` : '';

  if (parsed.whole === 0n && paiseText) return `${sign}${paiseText}`;

  const rupeeText = `${integerToIndianWords(parsed.whole)} ${parsed.whole === 1n ? 'rupee' : 'rupees'}`;
  return `${sign}${paiseText ? `${rupeeText} and ${paiseText}` : rupeeText}`;
}

function normalizeCurrencyForTts(text: string): string {
  const withPrefixAmounts = text.replace(
    CURRENCY_PREFIX_AMOUNT,
    (match, leading: string, amount: string, unit: string | undefined) => {
      const spoken = currencyAmountToWords(amount, unit);
      return spoken ? `${leading}${spoken}` : match;
    },
  );
  return withPrefixAmounts.replace(
    CURRENCY_SUFFIX_AMOUNT,
    (match, leading: string, amount: string, unit: string | undefined) => {
      const spoken = currencyAmountToWords(amount, unit);
      return spoken ? `${leading}${spoken}` : match;
    },
  );
}

/** Strip markdown/emoji/odd whitespace so the TTS never voices symbols. */
export function cleanForTts(text: string): string {
  let out = text.replace(MD_LINK, '$1');
  out = out.replace(MD_HEAD, '');
  out = out.replace(MD_BULLET, '');
  out = out.replace(MD_MARKS, '');
  out = normalizeCurrencyForTts(out);
  out = out.replace(EMOJI, '');
  return out.replace(WS, ' ').trim();
}

// Sentence-final punctuation (treat the Devanagari danda too).
const HARD = new Set(['.', '!', '?', '…', '।']);
// Clause boundaries we may break on early.
const SOFT = new Set([',', ';', ':', '—']);
// Words that take a trailing period but don't end a sentence.
const ABBREV = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'rs',
  'etc', 'inc', 'ltd', 'approx', 'dept', 'govt',
]);

// Closing quote/bracket chars that should ride along with a terminal.
const CLOSERS = '"\')]}»';

function previousNumberNeighbor(text: string, index: number): string {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!/[\s,]/u.test(text[i])) return text[i];
  }
  return '';
}

function nextNumberNeighbor(text: string, index: number): string {
  for (let i = index + 1; i < text.length; i += 1) {
    if (!/[\s,]/u.test(text[i])) return text[i];
  }
  return '';
}

function isNumericSeparator(text: string, index: number): boolean {
  const ch = text[index];
  if (ch !== ',' && !/\s/u.test(ch)) return false;
  return isDigit(previousNumberNeighbor(text, index)) && isDigit(nextNumberNeighbor(text, index));
}

export function isSafeTtsChunkBreak(text: string, index: number): boolean {
  return !isNumericSeparator(text, index);
}

function lastSafeSpaceBefore(text: string, maxIndex: number): number {
  let index = Math.min(maxIndex, text.length - 1);
  while (index >= 0) {
    if (text[index] === ' ' && isSafeTtsChunkBreak(text, index)) return index;
    index -= 1;
  }
  return -1;
}

export class SentenceChunker {
  private readonly firstMin: number;
  private readonly softMin: number;
  private readonly hardMax: number;
  private buf = '';
  private emitted = 0;

  /**
   * @param firstMin min chars before the FIRST chunk may break at a comma (fast start)
   * @param softMin  min chars before later chunks may break at a comma
   * @param hardMax  force a break at the next space past this length
   */
  constructor(firstMin = 18, softMin = 60, hardMax = 220) {
    this.firstMin = firstMin;
    this.softMin = softMin;
    this.hardMax = hardMax;
  }

  /** Guard against decimals like '3.5'; defer the split when the digit after the
   *  dot may not have streamed yet. */
  private isRealTerminal(i: number): boolean {
    const ch = this.buf[i];
    if (ch === '.') {
      const prev = i > 0 ? this.buf[i - 1] : ' ';
      if (isDigit(prev)) {
        if (i + 1 >= this.buf.length) return false;
        if (isDigit(this.buf[i + 1])) return false;
        return true;
      }
      let j = i - 1;
      while (j >= 0 && isAlpha(this.buf[j])) j -= 1;
      if (ABBREV.has(this.buf.slice(j + 1, i).toLowerCase())) return false;
    }
    return true;
  }

  feed(token: string): string[] {
    this.buf += token;
    const out: string[] = [];
    while (true) {
      const chunk = this.take();
      if (chunk === null) break;
      out.push(chunk);
      this.emitted += 1;
    }
    return out;
  }

  private take(): string | null {
    const buf = this.buf;
    const n = buf.length;
    const softFloor = this.emitted === 0 ? this.firstMin : this.softMin;

    for (let i = 0; i < n; i++) {
      const ch = buf[i];
      if (HARD.has(ch) && this.isRealTerminal(i)) {
        let end = i + 1;
        while (end < n && CLOSERS.includes(buf[end])) end += 1;
        const cut = buf.slice(0, end).trim();
        if (cut) {
          this.buf = buf.slice(end).trimStart();
          return cut;
        }
      }
      if (ch === '\n') {
        const cut = buf.slice(0, i).trim();
        this.buf = buf.slice(i + 1).trimStart();
        if (cut) return cut;
        return null;
      }
    }

    // No hard boundary. Allow an early break at a clause boundary once we have
    // enough text, so the first audio doesn't wait for a full sentence.
    if (n >= softFloor) {
      let lastSoft = -1;
      for (let j = 0; j < n; j++) {
        if (SOFT.has(buf[j]) && isSafeTtsChunkBreak(buf, j)) lastSoft = j;
      }
      if (lastSoft >= Math.floor(softFloor / 2)) {
        const cut = buf.slice(0, lastSoft + 1).trim();
        this.buf = buf.slice(lastSoft + 1).trimStart();
        if (cut) return cut;
      }
    }

    // Safety valve: never let a single chunk grow unbounded.
    if (n >= this.hardMax) {
      const sp = lastSafeSpaceBefore(buf, this.hardMax - 1);
      const cutAt = sp > 0 ? sp : this.hardMax;
      const cut = buf.slice(0, cutAt).trim();
      this.buf = buf.slice(cutAt).trimStart();
      if (cut) return cut;
    }
    return null;
  }

  flush(): string | null {
    const cut = this.buf.replace(/\s+/g, ' ').trim();
    this.buf = '';
    if (cut) {
      this.emitted += 1;
      return cut;
    }
    return null;
  }
}
