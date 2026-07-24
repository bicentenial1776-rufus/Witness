import { forwardRef } from 'react';

export interface DiscoveryCardProps {
  headline: string;
  detail: string;
  years: string;
}

/** What callers need from the ref: just capture(). */
export interface DiscoveryCardHandle {
  capture?: () => Promise<string>;
}

/**
 * Web variant: react-native-view-shot has no web implementation, so the
 * off-screen capture card renders nothing and exposes no capture() —
 * callers already treat capture as optional. Web share cards arrive as
 * server-rendered OG images in Phase B (WEB_APP_DESIGN.md §5).
 */
export const DiscoveryCard = forwardRef<DiscoveryCardHandle, DiscoveryCardProps>(
  function DiscoveryCard(_props, _ref) {
    return null;
  },
);
