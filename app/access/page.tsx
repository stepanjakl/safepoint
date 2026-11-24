import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccessForm } from '@/components/access/access-form';
import {
  accessConfig,
  NOT_CONFIGURED_MESSAGE,
  publicAccess,
} from '@/server/access/config';
import { RETURN_PARAM, safeReturnPath } from '@/server/access/return-path';

export const metadata: Metadata = { title: 'Sign in · Safepoint' };

/*
  The gate page: one form, outside the shell. Where the person was going comes
  in the query string, which anyone can write, so it is reduced to a path on
  this site here and again when the form is answered.
*/
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = (await searchParams)[RETURN_PARAM];
  const next = safeReturnPath(typeof requested === 'string' ? requested : null);
  // A public deployment has nothing to sign in to.
  if (publicAccess() === 'public') redirect(next);
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid w-full max-w-xs gap-5">
        <h1 className="font-display text-title text-primary font-semibold">
          Sign in to Safepoint
        </h1>
        {accessConfig() === null ? (
          <p className="text-dense text-muted">{NOT_CONFIGURED_MESSAGE}</p>
        ) : (
          <AccessForm next={next} />
        )}
      </div>
    </main>
  );
}
