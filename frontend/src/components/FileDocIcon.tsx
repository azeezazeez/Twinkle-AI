import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & {
  /** Stroke width in the 24x24 viewBox. */
  strokeWidth?: number | string;
};


export default function FileDocIcon({ strokeWidth = 1.9, className, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {/* page with folded corner */}
      <path d="M14.5 2.5H7a2.5 2.5 0 0 0-2.5 2.5v14A2.5 2.5 0 0 0 7 21.5h10a2.5 2.5 0 0 0 2.5-2.5V7.5z" />
      <path d="M14.5 2.5V6a1.5 1.5 0 0 0 1.5 1.5h3.5" />
      {/* wavy lines */}
      <path d="M8 12.6c.8-.9 1.6-.9 2.4 0s1.6.9 2.4 0 1.6-.9 2.4 0" />
      <path d="M8 16.6c.8-.9 1.6-.9 2.4 0s1.6.9 2.4 0 1.6-.9 2.4 0" />
    </svg>
  );
}
