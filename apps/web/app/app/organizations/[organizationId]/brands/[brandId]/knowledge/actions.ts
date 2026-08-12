'use server';

import {
  createKnowledgeWorkspaceService,
  getAuth,
  KnowledgeIngestionError,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type KnowledgeIntakeState = { error?: string; success?: string };

type RouteContext = { organizationId: string; brandId: string };

const genericError = 'Не удалось добавить источник. Проверьте данные и права доступа.';

export async function createKnowledgeTextAction(
  route: RouteContext,
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  return ingest(route, async (service, actor) =>
    service.ingestText(actor, {
      title: String(formData.get('title') ?? ''),
      text: String(formData.get('text') ?? ''),
    }),
  );
}

export async function createKnowledgeUrlAction(
  route: RouteContext,
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  return ingest(route, async (service, actor) =>
    service.ingestUrl(actor, {
      title: String(formData.get('title') ?? ''),
      sourceUrl: String(formData.get('sourceUrl') ?? ''),
    }),
  );
}

export async function createKnowledgeFileAction(
  route: RouteContext,
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  const file = formData.get('file');
  if (!(file instanceof File) || !file.name) return { error: 'Выберите текстовый файл.' };

  return ingest(route, async (service, actor) =>
    service.ingestFile(actor, {
      title: String(formData.get('title') ?? file.name),
      fileName: file.name,
      ...(file.type ? { contentType: file.type } : {}),
      bytes: new Uint8Array(await file.arrayBuffer()),
    }),
  );
}

async function ingest(
  route: RouteContext,
  operation: (
    service: ReturnType<typeof createKnowledgeWorkspaceService>,
    actor: { userId: string; organizationId: string; brandId: string },
  ) => Promise<{ title: string }>,
): Promise<KnowledgeIntakeState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  try {
    const document = await operation(createKnowledgeWorkspaceService(), {
      userId: session.user.id,
      organizationId: route.organizationId,
      brandId: route.brandId,
    });
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/knowledge`);
    return { success: `Документ «${document.title}» добавлен в базу знаний.` };
  } catch (error) {
    if (error instanceof KnowledgeIngestionError) return { error: error.message };
    return { error: genericError };
  }
}
