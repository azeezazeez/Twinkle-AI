import { Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * The project-wide search field. Same look as the Claude message box:
 * large rounded corners, soft border, white surface, subtle shadow and a
 * clear button. Use this instead of ad-hoc <input> search fields.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> & {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  size?: 'md' | 'lg';
  className?: string;
};

const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { value, onChange, onClear, size = 'md', className = '', placeholder = 'Search', ...rest },
  ref,
) {
  const large = size === 'lg';
  return (
    <div
      className={`flex w-full items-center gap-3 rounded-[20px] border border-zinc-300/80 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.06)] transition-colors focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-500 ${
        large ? 'px-5 py-3.5' : 'px-4 py-2.5'
      } ${className}`}
    >
      <Search className={`shrink-0 text-zinc-400 ${large ? 'h-5 w-5' : 'h-4 w-4'}`} strokeWidth={1.8} />
      <input
        ref={ref}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        {...rest}
        className={`min-w-0 flex-1 bg-transparent font-normal text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 ${
          large ? 'text-[17px]' : 'text-sm'
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClear?.();
          }}
          aria-label="Clear search"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
});

export default SearchBar;
