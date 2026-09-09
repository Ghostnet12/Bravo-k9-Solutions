/* eslint-disable @next/next/no-img-element -- direct static image delivery is required by the Sites host */
import Link from "./Link";

type BrandLockupProps = {
  className?: string;
};

export default function BrandLockup({ className = "" }: BrandLockupProps) {
  return (
    <Link className={`brand-lockup ${className}`.trim()} href="/" aria-label="Bravo K9 Solutions home">
      <img src="/images/bravo-logo-small.webp" width="128" height="144" loading="eager" decoding="async" alt="" aria-hidden="true" />
      <span>
        <strong>BRAVO K9</strong>
        <small>SOLUTIONS</small>
      </span>
    </Link>
  );
}
