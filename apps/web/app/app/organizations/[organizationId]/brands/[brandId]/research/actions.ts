'use server';

import {
  createResearchWorkspaceService,
  getAuth,
  ResearchWorkspaceBlockedExternalError,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type ResearchActionState = {
  error?: string;
  success?: string;
  blockedExternal?: boolean;
  results?: Array<{ title: string; url: string; snippet?: string }>;
};

type RouteContext = { organizationId: string; brandId: string };
const genericError =
  'Не удалось выполнить операцию с исследованием. Проверьте данные и права доступа.';

export async function addResearchTextAction(
  route: RouteContext,
  _previous: ResearchActionState,
  formData: FormData,
): Promise<ResearchActionState> {
  return ingest(route, (service, actor) =>
    service.ingestText(actor, {
      title: String(formData.get('title') ?? ''),
      content: String(formData.get('content') ?? ''),
    }),
  );
}

export async function addResearchUrlAction(
  route: RouteContext,
  _previous: ResearchActionState,
  formData: FormData,
): Promise<ResearchActionState> {
  return ingest(route, (service, actor) =>
    service.ingestUrl(actor, {
      title: String(formData.get('title') ?? ''),
      sourceUrl: String(formData.get('sourceUrl') ?? ''),
    }),
  );
}

export async function searchResearchAction(
  route: RouteContext,
  _previous: ResearchActionState,
  formData: FormData,
): Promise<ResearchActionState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  const query = String(formData.get('query') ?? '').trim();
  if (!query || query.length > 500) return { error: 'Введите запрос длиной до 500 символов.' };

  try {
    const results = await createResearchWorkspaceService().search(
      { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId },
      query,
    );
    return { results };
  } catch (error) {
    if (error instanceof ResearchWorkspaceBlockedExternalError)
      return { error: error.message, blockedExternal: true };
    return { error: genericError };
  }
}

async function ingest(
  route: RouteContext,
  operation: (
    service: ReturnType<typeof createResearchWorkspaceService>,
    actor: { userId: string; organizationId: string; brandId: string },
  ) => Promise<{ title: string }>,
): Promise<ResearchActionState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  try {
    const item = await operation(createResearchWorkspaceService(), {
      userId: session.user.id,
      organizationId: route.organizationId,
      brandId: route.brandId,
    });
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/research`);
    return { success: `Материал «${item.title}» добавлен в исследование.` };
  } catch (error) {
    if (error instanceof ResearchWorkspaceBlockedExternalError)
      return { error: error.message, blockedExternal: true };
    return { error: genericError };
  }
}
