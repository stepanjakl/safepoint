'use client';

import { useActionState } from 'react';
import { Input, Label, TextField } from 'react-aria-components';

import { signIn, type SignInState } from '@/app/access/actions';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';

const FIELD = 'field text-dense text-primary min-h-9 w-full px-3';
const LABEL = 'text-meta text-primary font-medium';

/*
  The gate's one form: the shared password and the name the decisions will be
  written under. The error is an alert, so it is read out as it arrives; the
  name is kept for the next try, the password is not.
*/
export function AccessForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    { error: null, name: '' },
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        className="grid gap-1.5"
      >
        <Label className={LABEL}>Password</Label>
        <Input className={FIELD} />
      </TextField>
      <TextField
        name="name"
        autoComplete="name"
        defaultValue={state.name}
        className="grid gap-1.5"
      >
        <Label className={LABEL}>Your name</Label>
        <Input className={FIELD} maxLength={80} />
      </TextField>
      {state.error ? <AlertBox>{state.error}</AlertBox> : null}
      <Button type="submit" variant="primary" isPending={pending}>
        {pending ? 'Checking…' : 'Continue'}
      </Button>
    </form>
  );
}
