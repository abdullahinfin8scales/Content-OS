import { EIGHT_PATH, WORDMARK_PATH } from './paths';

interface LogoProps {
  className?: string;
  title?: string;
}

function a11y(title?: string) {
  return title ? ({ role: 'img', 'aria-label': title } as const) : ({ 'aria-hidden': true } as const);
}

/** The |8| mark. Follows `currentColor`. */
export function Mark({ className, title }: LogoProps) {
  return (
    <svg viewBox="9 99 381 202" fill="currentColor" className={className} {...a11y(title)}>
      <rect x="9.3" y="99.3" width="20.7" height="200.9" />
      <rect x="369.3" y="99.3" width="20.7" height="200.9" />
      <path fillRule="evenodd" d={EIGHT_PATH} />
    </svg>
  );
}

/** INFIN|8|SCALE wordmark. Follows `currentColor`. */
export function Wordmark({ className, title = 'infin8scale' }: LogoProps) {
  return (
    <svg viewBox="10 11 476 49.5" fill="currentColor" className={className} {...a11y(title)}>
      <path fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}
