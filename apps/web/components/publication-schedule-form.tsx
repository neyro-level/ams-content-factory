'use client';

import { useActionState } from 'react';
import {
  cancelPublicationAction,
  reschedulePublicationAction,
  schedulePublicationAction,
  type PublicationScheduleState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/calendar/actions';

const initialState: PublicationScheduleState = {};

export function PublicationScheduleForm({
  organizationId,
  brandId,
  publicationId,
}: {
  organizationId: string;
  brandId: string;
  publicationId: string;
}) {
  const action = schedulePublicationAction.bind(null, { organizationId, brandId }, publicationId);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="organization-form" action={formAction}>
      <label>
        Время публикации
        <input name="scheduledAt" type="datetime-local" required />
      </label>
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
      <button className="button button-compact" type="submit" disabled={pending}>
        {pending ? 'Планируем…' : 'Запланировать'}
      </button>
    </form>
  );
}

function datetimeLocalValue(value: Date) {
  return value.toISOString().slice(0, 16);
}

export function PublicationRescheduleForm({
  organizationId,
  brandId,
  publicationId,
  scheduledAt,
}: {
  organizationId: string;
  brandId: string;
  publicationId: string;
  scheduledAt: Date;
}) {
  const action = reschedulePublicationAction.bind(null, { organizationId, brandId }, publicationId);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="organization-form" action={formAction}>
      <label>
        Новое время публикации
        <input
          name="scheduledAt"
          type="datetime-local"
          defaultValue={datetimeLocalValue(scheduledAt)}
          required
        />
      </label>
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
      <button className="button button-compact" type="submit" disabled={pending}>
        {pending ? 'Переносим…' : 'Перенести'}
      </button>
    </form>
  );
}

export function PublicationCancelForm({
  organizationId,
  brandId,
  publicationId,
}: {
  organizationId: string;
  brandId: string;
  publicationId: string;
}) {
  const action = cancelPublicationAction.bind(null, { organizationId, brandId }, publicationId);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="organization-form" action={formAction}>
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
      <button className="button button-secondary button-compact" type="submit" disabled={pending}>
        {pending ? 'Отменяем…' : 'Отменить публикацию'}
      </button>
    </form>
  );
}
