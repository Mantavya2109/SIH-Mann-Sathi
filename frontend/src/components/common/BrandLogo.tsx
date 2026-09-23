import { useState } from "react";
import logoUrl from "../../assets/logo.svg";

interface BrandLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textColor?: string;
  subtextColor?: string;
  subtitle?: string;
}

export default function BrandLogo({
  className = "",
  size = 40,
  showText = true,
  textColor = "text-slate-900",
  subtextColor = "text-slate-500",
  subtitle = "AI-powered Victim Support",
}: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {!imgError ? (
        <img
          src={logoUrl}
          alt="Mann Sathi Logo"
          style={{ width: size, height: size }}
          className="object-contain"
          onError={() => setImgError(true)}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth === 0) {
              setImgError(true);
            }
          }}
        />
      ) : (
        <div
          className="rounded-2xl flex items-center justify-center bg-emerald-600 text-white shadow-sm flex-shrink-0"
          style={{ width: size, height: size }}
        >
          {/* Leaf / Heart SVG icon */}
          <svg
            width={Math.round(size * 0.55)}
            height={Math.round(size * 0.55)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z" />
          </svg>
        </div>
      )}

      {showText && (
        <div>
          <span
            className={`font-bold tracking-tight block ${textColor}`}
            style={{ fontFamily: "Manrope, sans-serif", fontSize: Math.max(16, Math.round(size * 0.45)) }}
          >
            Mann Sathi
          </span>
          <p
            className={`text-xs ${subtextColor}`}
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {subtitle}
          </p>
        </div>
      )}
    </div>
  );
}
