'use client';

import { useActionState } from 'react';
import {
  saveBrandContextAction,
  type BrandContextActionState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/settings/actions';

const initialState: BrandContextActionState = {};
type Values = Record<string, string>;

export function BrandContextForm({
  organizationId,
  brandId,
  values,
}: {
  organizationId: string;
  brandId: string;
  values: Values;
}) {
  const action = saveBrandContextAction.bind(null, { organizationId, brandId });
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="organization-form" action={formAction}>
      <label>
        Описание бренда
        <textarea name="description" defaultValue={values.description} maxLength={5_000} />
      </label>
      <label>
        Сайт бренда
        <input
          name="websiteUrl"
          defaultValue={values.websiteUrl}
          placeholder="https://example.ru"
        />
      </label>
      <label>
        Позиционирование
        <textarea name="positioning" defaultValue={values.positioning} maxLength={5_000} />
      </label>
      <label>
        Целевая аудитория
        <textarea name="targetAudience" defaultValue={values.targetAudience} maxLength={5_000} />
      </label>
      <label>
        Предложения — по одному на строку
        <textarea name="offers" defaultValue={values.offers} maxLength={5_000} />
      </label>
      <label>
        Ограничения — по одному на строку
        <textarea name="constraints" defaultValue={values.constraints} maxLength={5_000} />
      </label>
      <label>
        Запрещённые claims — по одному на строку
        <textarea name="forbiddenClaims" defaultValue={values.forbiddenClaims} maxLength={5_000} />
      </label>
      <label>
        Тон коммуникации
        <textarea name="toneSummary" defaultValue={values.toneSummary} maxLength={2_000} />
      </label>
      <label>
        Правила стиля — по одному на строку
        <textarea name="styleRules" defaultValue={values.styleRules} maxLength={5_000} />
      </label>
      <label>
        Запрещённые слова — по одному на строку
        <textarea name="forbiddenWords" defaultValue={values.forbiddenWords} maxLength={5_000} />
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
        {pending ? 'Сохраняем…' : 'Сохранить контекст'}
      </button>
    </form>
  );
}
