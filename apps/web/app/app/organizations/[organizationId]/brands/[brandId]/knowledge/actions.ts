'use server';

import {
  createKnowledgeWorkspaceService,
  getAuth,
  limitActor,
  KnowledgeIngestionError,
  KnowledgeRetrievalBlockedExternalError,
  rateLimitPolicies,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type KnowledgeIntakeState = { error?: string; success?: string };
export type KnowledgeSearchState = {
  error?: string;
  blockedExternal?: boolean;
  hits?: Array<{ chunkId: string; documentId: string; content: string; score: number }>;
};

type RouteContext = { organizationId: string; brandId: string };

const genericError = 'Не удалось добавить источник. Проверьте данные и права доступа.';

export async function createKnowledgeTextAction(
  route: RouteContext,
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  return ingest(
    route,
    async (service, actor) =>
      service.ingestText(actor, {
        title: String(formData.get('title') ?? ''),
        text: String(formData.get('text') ?? ''),
      }),
    undefined,
    false,
  );
}

export async function createKnowledgeUrlAction(
  route: RouteContext,
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  return ingest(
    route,
    async (service, actor) =>
      service.ingestUrl(actor, {
        title: String(formData.get('title') ?? ''),
        sourceUrl: String(formData.get('sourceUrl') ?? ''),
      }),
    undefined,
    true,
  );
}

export async function createKnowledgeFileAction(
  route: RouteContext,
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  const file = formData.get('file');
  if (!(file instanceof File) || !file.name) return { error: 'Выберите текстовый файл.' };

  return ingest(
    route,
    async (service, actor) =>
      service.ingestFile(actor, {
        title: String(formData.get('title') ?? file.name),
        fileName: file.name,
        ...(file.type ? { contentType: file.type } : {}),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
    undefined,
    false,
  );
}

export async function retryKnowledgeDocumentAction(
  route: RouteContext,
  documentId: string,
  _previous: KnowledgeIntakeState,
  _formData: FormData,
): Promise<KnowledgeIntakeState> {
  return ingest(
    route,
    async (service, actor) => service.retry(actor, documentId),
    (document) => `Документ «${document.title}» повторно обработан.`,
    true,
  );
}

export async function searchKnowledgeAction(
  route: RouteContext,
  _previous: KnowledgeSearchState,
  formData: FormData,
): Promise<KnowledgeSearchState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  const query = String(formData.get('query') ?? '').trim();
  if (!query || query.length > 500)
    return { error: 'Введите поисковый запрос длиной до 500 символов.' };

  try {
    await limitActor(rateLimitPolicies.externalProvider, {
      userId: session.user.id,
      organizationId: route.organizationId,
    });
    const hits = await createKnowledgeWorkspaceService().search(
      {
        userId: session.user.id,
        organizationId: route.organizationId,
        brandId: route.brandId,
      },
      { query },
    );
    return { hits };
  } catch (error) {
    if (error instanceof KnowledgeRetrievalBlockedExternalError)
      return {
        error: 'Поиск по базе знаний будет доступен после подключения AI-индекса.',
        blockedExternal: true,
      };
    return { error: 'Не удалось выполнить поиск. Проверьте доступ к бренду и повторите попытку.' };
  }
}

export async function indexKnowledgeDocumentAction(
  route: RouteContext,
  documentId: string,
  _previous: KnowledgeIntakeState,
  _formData: FormData,
): Promise<KnowledgeIntakeState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  try {
    await limitActor(rateLimitPolicies.externalProvider, {
      userId: session.user.id,
      organizationId: route.organizationId,
    });
    const chunks = await createKnowledgeWorkspaceService().indexDocument(
      {
        userId: session.user.id,
        organizationId: route.organizationId,
        brandId: route.brandId,
      },
      documentId,
    );
    return { success: `В поисковый индекс добавлено фрагментов: ${chunks}.` };
  } catch (error) {
    if (error instanceof KnowledgeRetrievalBlockedExternalError)
      return { error: 'Индексация будет доступна после подключения AI-индекса.' };
    return { error: genericError };
  }
}

async function ingest(
  route: RouteContext,
  operation: (
    service: ReturnType<typeof createKnowledgeWorkspaceService>,
    actor: { userId: string; organizationId: string; brandId: string },
  ) => Promise<{ title: string }>,
  successMessage: (document: { title: string }) => string = (document) =>
    `Документ «${document.title}» добавлен в базу знаний.`,
  limitExternalProvider = false,
): Promise<KnowledgeIntakeState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  try {
    if (limitExternalProvider) {
      await limitActor(rateLimitPolicies.externalProvider, {
        userId: session.user.id,
        organizationId: route.organizationId,
      });
    }
    const document = await operation(createKnowledgeWorkspaceService(), {
      userId: session.user.id,
      organizationId: route.organizationId,
      brandId: route.brandId,
    });
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/knowledge`);
    return { success: successMessage(document) };
  } catch (error) {
    if (error instanceof KnowledgeIngestionError) return { error: error.message };
    return { error: genericError };
  }
}
