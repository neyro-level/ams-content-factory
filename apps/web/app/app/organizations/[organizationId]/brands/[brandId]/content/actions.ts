'use server';

import {
  ContentGenerationBlockedExternalError,
  createProductionContentGenerationService,
  createContentService,
  ContentGenerationInProgressError,
  createFactCheckService,
  getAuth,
  limitActor,
  rateLimitPolicies,
  resolveTenantContext,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

type Route = { organizationId: string; brandId: string; contentProjectId?: string };
export type ContentActionState = { error?: string; success?: string; blockedExternal?: boolean };
const allowedTypes = new Set([
  'SOCIAL_POST',
  'REEL',
  'SHORT_VIDEO',
  'CAROUSEL',
  'STORY',
  'ARTICLE',
  'CASE',
  'EXPLAINER',
]);
type AllowedContentType =
  'SOCIAL_POST' | 'REEL' | 'SHORT_VIDEO' | 'CAROUSEL' | 'STORY' | 'ARTICLE' | 'CASE' | 'EXPLAINER';

export async function createContentProjectAction(
  route: Route,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const actor = await actorFor(route);
  if (!actor) return { error: 'Сессия истекла. Войдите снова.' };
  const title = String(formData.get('title') ?? '').trim();
  const contentType = String(formData.get('contentType') ?? 'SOCIAL_POST');
  const goal = String(formData.get('goal') ?? '').trim();
  const audience = String(formData.get('audience') ?? '').trim();
  const brief = String(formData.get('brief') ?? '').trim();
  if (title.length < 2 || title.length > 200 || !allowedTypes.has(contentType))
    return { error: 'Проверьте название и тип контента.' };
  try {
    const context = await resolveTenantContext(actor);
    const project = await createContentService().create(context, {
      title,
      contentType: contentType as AllowedContentType,
      ...(goal ? { goal } : {}),
      ...(audience ? { audience } : {}),
      createdBy: actor.userId,
    });
    if (!project) return { error: 'Не удалось создать проект в активном бренде.' };
    if (brief) {
      await createContentService().appendVersion(context, project.id, {
        createdByType: 'USER',
        createdByUserId: actor.userId,
        body: brief,
        brief,
      });
    }
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/content`);
    return { success: `Проект «${project.title}» создан.` };
  } catch {
    return { error: 'Не удалось создать проект. Проверьте доступ к бренду.' };
  }
}

export async function contentWorkflowAction(
  route: Route,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const actor = await actorFor(route);
  if (!actor || !route.contentProjectId) return { error: 'Сессия истекла. Войдите снова.' };
  const action = String(formData.get('contentAction') ?? '');
  try {
    if (action === 'generate-draft') {
      await limitActor(rateLimitPolicies.aiGeneration, actor);
      await createProductionContentGenerationService().generateDraft(actor, {
        contentProjectId: route.contentProjectId,
        promptKey: 'social-post',
      });
    } else if (action === 'fact-check') {
      await createFactCheckService().run(actor, { contentProjectId: route.contentProjectId });
    } else if (action === 'mark-ready') {
      const context = await resolveTenantContext(actor);
      await createContentService().transition(context, route.contentProjectId, 'READY');
    } else return { error: 'Неподдерживаемое действие контента.' };
    revalidatePath(
      `/app/organizations/${route.organizationId}/brands/${route.brandId}/content/${route.contentProjectId}`,
    );
    return { success: 'Статус проекта обновлён.' };
  } catch (error) {
    if (error instanceof ContentGenerationBlockedExternalError)
      return {
        error: 'AI-генерация пока недоступна: для рабочего режима требуется подключение модели.',
        blockedExternal: true,
      };
    if (error instanceof ContentGenerationInProgressError) return { error: error.message };
    return { error: 'Действие недоступно для текущего статуса или прав доступа.' };
  }
}

export async function contentVersionAction(
  route: Route,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const actor = await actorFor(route);
  if (!actor || !route.contentProjectId) return { error: 'Сессия истекла. Войдите снова.' };
  const action = String(formData.get('versionAction') ?? '');
  try {
    const context = await resolveTenantContext(actor);
    if (action === 'save') {
      const body = String(formData.get('body') ?? '').trim();
      if (!body) return { error: 'Текст версии не может быть пустым.' };
      const version = await createContentService().appendVersion(context, route.contentProjectId, {
        createdByType: 'USER',
        createdByUserId: actor.userId,
        body,
      });
      if (!version) return { error: 'Не удалось сохранить версию в активном бренде.' };
    } else if (action === 'rewrite') {
      const sourceVersionId = String(formData.get('sourceVersionId') ?? '');
      const instruction = String(formData.get('instruction') ?? '').trim();
      if (!sourceVersionId || !instruction)
        return { error: 'Укажите инструкцию для новой версии.' };
      await limitActor(rateLimitPolicies.aiGeneration, actor);
      await createProductionContentGenerationService().rewriteDraft(actor, {
        contentProjectId: route.contentProjectId,
        sourceVersionId,
        instruction,
      });
    } else return { error: 'Неподдерживаемое действие версии.' };
    revalidatePath(
      `/app/organizations/${route.organizationId}/brands/${route.brandId}/content/${route.contentProjectId}`,
    );
    return { success: 'Создана следующая версия текста.' };
  } catch (error) {
    if (error instanceof ContentGenerationBlockedExternalError)
      return {
        error: 'AI-генерация пока недоступна: для рабочего режима требуется подключение модели.',
      };
    return { error: 'Не удалось выполнить действие с версией.' };
  }
}

async function actorFor(route: Route) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user
    ? { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId }
    : null;
}
