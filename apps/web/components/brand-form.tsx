'use client';

import { useActionState } from 'react';
import {
  createBrandAction,
  type CreateBrandState,
} from '../app/app/organizations/[organizationId]/brands/actions';

const initialState: CreateBrandState = {};

export function BrandForm({ organizationId }: { organizationId: string }) {
  const action = createBrandAction.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form
      className="organization-form"
      action={formAction}
      aria-describedby={state.error ? 'brand-error' : undefined}
    >
      <label>
        Название бренда
        <input name="name" required minLength={2} maxLength={120} autoComplete="organization" />
      </label>
      {state.error ? (
        <p id="brand-error" className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать бренд'}
      </button>
    </form>
  );
}
