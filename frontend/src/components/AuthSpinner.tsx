/** Small spinning circle shown inside a button while its action is running. */
export default function AuthSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current ${className}`}
    />
  );
}
