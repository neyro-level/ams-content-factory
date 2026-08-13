'use server';

import { createEditorialApprovalService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

type Route = { organizationId: string; brandId: string; contentProjectId: string };
export type EditorialActionState = { error?: string; success?: string };

export async function editorialAction(
  route: Route,
  _previous: EditorialActionState,
  formData: FormData,
): Promise<EditorialActionState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  const actor = {
    userId: session.user.id,
    organizationId: route.organizationId,
    brandId: route.brandId,
  };
  const service = createEditorialApprovalService();
  const action = String(formData.get('editorialAction') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  try {
    let success: string;
    if (action === 'request-review') {
      await service.requestReview(actor, { contentProjectId: route.contentProjectId });
      success = 'Материал отправлен на редакционное согласование.';
    } else if (action === 'approve') {
      await service.approve(actor, {
        contentProjectId: route.contentProjectId,
        ...(note ? { note } : {}),
      });
      success = 'Материал одобрен вручную.';
    } else if (action === 'return-to-draft') {
      await service.returnToDraft(actor, {
        contentProjectId: route.contentProjectId,
        ...(note ? { note } : {}),
      });
      success = 'Материал возвращён в черновик.';
    } else if (action === 'reject') {
      await service.reject(actor, {
        contentProjectId: route.contentProjectId,
        ...(note ? { note } : {}),
      });
      success = 'Материал отклонён.';
    } else if (action === 'comment') {
      if (!note) return { error: 'Введите комментарий.' };
      await service.comment(actor, { contentProjectId: route.contentProjectId, body: note });
      success = 'Комментарий добавлен.';
    } else return { error: 'Неподдерживаемое редакционное действие.' };
    revalidatePath(
      `/app/organizations/${route.organizationId}/brands/${route.brandId}/content/${route.contentProjectId}`,
    );
    return { success };
  } catch {
    return { error: 'Действие недоступно для текущего статуса или прав доступа.' };
  }
}
