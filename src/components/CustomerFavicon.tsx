"use client";

import { useState } from "react";
import { InitialsAvatar } from "@/components/ui";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";

export function getCustomerFaviconUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const hostname = new URL(normalizedUrl).hostname;
    if (!hostname) return null;

    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const SIZES = {
  nav: {
    box: "h-4 w-4",
    image: "h-3.5 w-3.5",
    initials: "text-[8px]",
    frame: "rounded-sm",
    avatar: "xxs" as const,
  },
  xs: {
    box: "h-7 w-7",
    image: "h-4 w-4",
    initials: "text-[10px]",
    frame: "rounded-md border border-border-subtle bg-bg-default",
    avatar: "xs" as const,
  },
  sm: {
    box: "h-8 w-8",
    image: "h-5 w-5",
    initials: "text-xs",
    frame: "rounded-md border border-border-subtle bg-bg-default",
    avatar: "sm" as const,
  },
} as const;

type Props = {
  name: string;
  url?: string | null;
  color?: string | null;
  size?: keyof typeof SIZES;
};

export function CustomerFavicon({ name, url, color, size = "sm" }: Props) {
  const [imageError, setImageError] = useState(false);
  const faviconUrl = getCustomerFaviconUrl(url);
  const scale = SIZES[size];

  if (faviconUrl && !imageError) {
    return (
      <span
        className={`flex ${scale.box} shrink-0 items-center justify-center ${scale.frame}`}
      >
        {/* Favicons are loaded from the customer's public website domain. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faviconUrl}
          alt=""
          className={`${scale.image} object-contain`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
        />
      </span>
    );
  }

  if (color) {
    return (
      <span
        className={`flex ${scale.box} shrink-0 items-center justify-center rounded-full ${scale.initials} font-semibold text-white`}
        style={{ backgroundColor: color || DEFAULT_CUSTOMER_COLOR }}
        aria-hidden
      >
        {initialsFromName(name)}
      </span>
    );
  }

  if (size === "nav") {
    return (
      <span
        className={`flex ${scale.box} shrink-0 items-center justify-center rounded-full ${scale.initials} font-semibold text-white`}
        style={{ backgroundColor: color || DEFAULT_CUSTOMER_COLOR }}
        aria-hidden
      >
        {initialsFromName(name)}
      </span>
    );
  }

  return (
    <InitialsAvatar
      name={name}
      initials={initialsFromName(name)}
      size={scale.avatar}
    />
  );
}
