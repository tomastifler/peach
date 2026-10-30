import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { InputBase, TextField } from '@/components/base/input/input';
import { spriteGlyph } from '../components/sprite-glyph';

const SearchGlyph = spriteGlyph('search');

/* A read-only filter has no submit button: it searches 300ms after typing stops, and Enter means "don't wait, search now". While a Chinese input method is composing,
   input still fires, so filtering would use unfinished pinyin such as "zhon"; once composition completes, compositionend
   takes over, and Enter during composition only confirms the characters, so let it through. */
export function IndexSearch({ label, value, onQuery }: { label: string; value: string; onQuery(q: string): void }) {
  const [text, setText] = useState(value);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { clearTimeout(timer.current); setText(value) }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const later = (next: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onQuery(next.trim()), 300);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || composing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    clearTimeout(timer.current);
    onQuery(text.trim());
  };
  return (
    <div data-index-search="" className="ml-auto min-w-0 max-w-80 flex-1"
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(event) => { composing.current = false; later((event.target as HTMLInputElement).value) }}>
      <TextField aria-label={label} value={text}
        onChange={(next) => { setText(next); if (!composing.current) later(next) }}>
        <InputBase type="search" leadingIcon={SearchGlyph} spellCheck={false} autoComplete="off" enterKeyHint="search"
          onKeyDown={onKeyDown} />
      </TextField>
    </div>
  );
}

