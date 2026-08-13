'use client';

import { useActionState } from 'react';
import {
  createContentProjectAction,
  type ContentActionState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/content/actions';

const initialState: ContentActionState = {};
export function ContentProjectForm({
  organizationId,
  brandId,
}: {
  organizationId: string;
  brandId: string;
}) {
  const action = createContentProjectAction.bind(null, { organizationId, brandId });
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="organization-form" action={formAction}>
      <label>
        Название проекта
        <input name="title" required minLength={2} maxLength={200} />
      </label>
      <label>
        Тип контента
        <select name="contentType" defaultValue="SOCIAL_POST">
          <option value="SOCIAL_POST">Пост</option>
          <option value="REEL">Reel</option>
          <option value="ARTICLE">Статья</option>
        </select>
      </label>
      <label>
        Цель
        <input name="goal" required maxLength={500} placeholder="Например: объяснить услугу" />
      </label>
      <label>
        Аудитория
        <input name="audience" required maxLength={500} placeholder="Для кого создаётся материал" />
      </label>
      <label>
        Brief
        <textarea
          name="brief"
          required
          maxLength={10_000}
          placeholder="Тема, факты, пожелания к материалу"
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
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать проект'}
      </button>
    </form>
  );
}
