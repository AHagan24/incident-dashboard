"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!POSTHOG_KEY || POSTHOG_KEY === "your_key_here") {
      return;
    }

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
  }, []);

  return children;
}
