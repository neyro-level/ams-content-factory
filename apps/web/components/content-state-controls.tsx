'use client';

import { useActionState } from 'react';
import {
  contentWorkflowAction,
  type ContentActionState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/content/actions';

const initialState: ContentActionState = {};
export function ContentStateControls({
  organizationId,
  brandId,
  contentProjectId,
  status,
  canWrite,
}: {
  organizationId: string;
  brandId: string;
  contentProjectId: string;
  status: string;
  canWrite: boolean;
}) {
  const action = contentWorkflowAction.bind(null, { organizationId, brandId, contentProjectId });
  const [state, formAction, pending] = useActionState(action, initialState);
  if (!canWrite || !['IDEA', 'RESEARCHING', 'DRAFT'].includes(status)) return null;
  const config =
    status === 'IDEA'
      ? ['start-research', 'Начать исследование']
      : status === 'RESEARCHING'
        ? ['generate-draft', 'Сгенерировать черновик']
        : ['fact-check', 'Запустить fact-check'];
  return (
    <form action={formAction} className="editorial-actions">
      <button
        className="button"
        type="submit"
        name="contentAction"
        value={config[0]}
        disabled={pending}
      >
        {pending ? 'Выполняем…' : config[1]}
      </button>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
