'use server';

import {
  ContentGenerationBlockedExternalError,
  createProductionContentGenerationService,
  createContentService,
  createFactCheckService,
  getAuth,
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
  if (title.length < 2 || title.length > 200 || !allowedTypes.has(contentType))
    return { error: 'Проверьте название и тип контента.' };
  try {
    const context = await resolveTenantContext(actor);
    const project = await createContentService().create(context, {
      title,
      contentType: contentType as AllowedContentType,
    });
    if (!project) return { error: 'Не удалось создать проект в активном бренде.' };
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
    if (action === 'start-research') {
      const context = await resolveTenantContext(actor);
      await createContentService().transition(context, route.contentProjectId, 'RESEARCHING');
    } else if (action === 'generate-draft') {
      await createProductionContentGenerationService().generateDraft(actor, {
        contentProjectId: route.contentProjectId,
        promptKey: 'social-post',
      });
    } else if (action === 'fact-check') {
      await createFactCheckService().run(actor, { contentProjectId: route.contentProjectId });
    } else return { error: 'Неподдерживаемое действие контента.' };
    revalidatePath(
      `/app/organizations/${route.organizationId}/brands/${route.brandId}/content/${route.contentProjectId}`,
    );
    return { success: 'Статус проекта обновлён.' };
  } catch (error) {
    if (error instanceof ContentGenerationBlockedExternalError)
      return { error: error.message, blockedExternal: true };
    return { error: 'Действие недоступно для текущего статуса или прав доступа.' };
  }
}

async function actorFor(route: Route) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user
    ? { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId }
    : null;
}
