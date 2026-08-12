'use client';

import { useActionState } from 'react';
import {
  createOrganizationAction,
  type CreateOrganizationState,
} from '../app/app/organizations/actions';

const initialState: CreateOrganizationState = {};

export function OrganizationForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, initialState);
  return (
    <form
      className="organization-form"
      action={action}
      aria-describedby={state.error ? 'organization-error' : undefined}
    >
      <label>
        Название организации
        <input name="name" required minLength={2} maxLength={120} autoComplete="organization" />
      </label>
      {state.error ? (
        <p id="organization-error" className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать организацию'}
      </button>
    </form>
  );
}
