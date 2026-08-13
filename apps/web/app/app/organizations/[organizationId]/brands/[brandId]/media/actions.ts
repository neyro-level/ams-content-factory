'use server';

import {
  createMediaWorkspaceService,
  getAuth,
  MediaStorageBlockedExternalError,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type MediaUploadState = { error?: string; success?: string; blockedExternal?: boolean };

type Route = { organizationId: string; brandId: string };

function mediaType(file: File) {
  if (file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')) return 'VIDEO';
  if (file.type === 'image/png' || file.type === 'image/jpeg' || /\.(png|jpe?g)$/i.test(file.name))
    return 'IMAGE';
  return null;
}

export async function uploadMediaAction(
  route: Route,
  _previous: MediaUploadState,
  formData: FormData,
): Promise<MediaUploadState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  const file = formData.get('file');
  if (!(file instanceof File) || !file.name)
    return { error: 'Выберите MP4, PNG или JPEG файл для загрузки.' };
  const type = mediaType(file);
  if (!type) return { error: 'Поддерживаются только MP4, PNG и JPEG файлы.' };

  try {
    const asset = await createMediaWorkspaceService().upload(
      { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId },
      {
        type,
        filename: file.name,
        content: new Uint8Array(await file.arrayBuffer()),
        sourceType: 'UPLOAD',
      },
    );
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/media`);
    return { success: `Файл «${asset.filename}» сохранён в приватном хранилище.` };
  } catch (error) {
    if (error instanceof MediaStorageBlockedExternalError)
      return { error: error.message, blockedExternal: true };
    return { error: 'Не удалось загрузить файл. Проверьте тип, размер и права доступа.' };
  }
}
