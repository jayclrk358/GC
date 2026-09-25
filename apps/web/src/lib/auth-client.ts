'use client';

import { createAuthClient } from 'better-auth/react';
import { adminClient, twoFactorClient, usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(window.location.search).get('next') ?? '/';
        // Called by the auth client outside React, so there is no router here.
        window.location.assign(
          new URL(`/sign-in/two-factor?next=${encodeURIComponent(next)}`, window.location.origin),
        );
      },
    }),
    adminClient(),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
