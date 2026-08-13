import {
  ContentProjectStatus,
  createAiExecutionRepository,
  createContentRepository,
} from '@ams-content-factory/db';
import {
  OpenAiTextGenerationProvider,
  MockTextGenerationProvider,
  TextGenerationProviderUnavailableError,
  type TextGenerationProvider,
} from '@ams-content-factory/providers';
import { createContentContextAssembler } from './content-context';
import { getPrompt } from './prompts';
import { AccessDeniedError } from './tenant-context';

type Actor = { userId: string; organizationId: string; brandId: string };

export class ContentGenerationBlockedExternalError extends Error {
  constructor() {
    super('BLOCKED_EXTERNAL: text generation provider is not configured.');
    this.name = 'ContentGenerationBlockedExternalError';
  }
}

export class ContentGenerationInProgressError extends Error {
  constructor() {
    super('Генерация этого проекта уже выполняется. Результат появится после завершения операции.');
    this.name = 'ContentGenerationInProgressError';
  }
}

/**
 * Product capability only: it reveals whether generation can be offered, never a credential or provider detail.
 * The deterministic provider remains restricted to the isolated local E2E runtime.
 */
export function isTextGenerationAvailable() {
  return (
    Boolean(process.env.OPENAI_API_KEY?.trim()) ||
    (process.env.E2E_TEST_TEXT_GENERATION === '1' &&
      Boolean(process.env.APP_URL?.startsWith('http://127.0.0.1:')))
  );
}

export function createContentGenerationService(options: {
  provider: TextGenerationProvider;
  contextAssembler?: ReturnType<typeof createContentContextAssembler>;
  contentRepository?: ReturnType<typeof createContentRepository>;
  executionRepository?: ReturnType<typeof createAiExecutionRepository>;
}) {
  const assembler = options.contextAssembler ?? createContentContextAssembler();
  const content = options.contentRepository ?? createContentRepository();
  const executions = options.executionRepository ?? createAiExecutionRepository();

  return {
    async generateDraft(
      actor: Actor,
      input: { contentProjectId: string; promptKey: 'social-post' | 'reel-script'; model?: string },
    ) {
      const assembled = await assembler.assemble(actor, {
        contentProjectId: input.contentProjectId,
      });
      const scope = {
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        contentProjectId: input.contentProjectId,
      };
      const prompt = getPrompt(input.promptKey);
      const claim = await executions.claimInitialGeneration({
        ...scope,
        provider: 'openai',
        model: input.model ?? 'gpt-5-mini',
        operation: input.promptKey,
        idempotencyKey: `draft:${input.promptKey}`,
        promptKey: prompt.key,
        promptVersion: prompt.version,
      });
      if (claim.kind === 'missing')
        throw new AccessDeniedError('Content project is outside the active organization.');
      if (claim.kind === 'completed' && claim.version)
        return { executionId: claim.execution.id, version: claim.version };
      if (claim.kind === 'in_progress') throw new ContentGenerationInProgressError();
      const execution = claim.execution;
      if ((await executions.markRunning({ ...scope, id: execution.id })).count !== 1)
        throw new Error('AI execution could not start.');
      let result: Awaited<ReturnType<TextGenerationProvider['generate']>>;
      try {
        result = await options.provider.generate({
          operation: input.promptKey,
          ...(input.model === undefined ? {} : { model: input.model }),
          prompt: `${prompt.instruction}\n\nContext:\n${JSON.stringify(assembled)}`,
        });
      } catch (error) {
        const blocked = error instanceof TextGenerationProviderUnavailableError;
        await executions.failGeneration({
          ...scope,
          id: execution.id,
          errorCode: blocked ? 'BLOCKED_EXTERNAL' : 'GENERATION_FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown generation failure.',
        });
        if (blocked) throw new ContentGenerationBlockedExternalError();
        throw error;
      }

      let version;
      try {
        version = await executions.completeGeneration({
          ...scope,
          id: execution.id,
          body: result.text,
          ...(result.usage?.inputTokens === undefined
            ? {}
            : { inputTokens: result.usage.inputTokens }),
          ...(result.usage?.outputTokens === undefined
            ? {}
            : { outputTokens: result.usage.outputTokens }),
        });
        if (!version) throw new Error('Generated content version could not be persisted.');
      } catch (error) {
        await executions.failGeneration({
          ...scope,
          id: execution.id,
          errorCode: 'GENERATION_PERSISTENCE_FAILED',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown generation persistence failure.',
        });
        throw error;
      }
      return { executionId: execution.id, version };
    },
    async rewriteDraft(
      actor: Actor,
      input: {
        contentProjectId: string;
        sourceVersionId: string;
        model?: string;
        instruction: string;
      },
    ) {
      const assembled = await assembler.assemble(actor, {
        contentProjectId: input.contentProjectId,
      });
      if (assembled.project.status !== ContentProjectStatus.DRAFT)
        throw new AccessDeniedError('Content project is not ready for rewrite.');
      const scope = {
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        contentProjectId: input.contentProjectId,
      };
      const source = await content.findVersion({ ...scope, id: input.sourceVersionId });
      if (!source)
        throw new AccessDeniedError('Content version is outside the active organization.');
      const instruction = input.instruction.trim();
      if (!instruction) throw new Error('Rewrite instruction is required.');

      const prompt = getPrompt('rewrite');
      const execution = await executions.create({
        ...scope,
        provider: 'openai',
        model: input.model ?? 'gpt-5-mini',
        operation: 'rewrite',
        promptKey: prompt.key,
        promptVersion: prompt.version,
      });
      if (!execution)
        throw new AccessDeniedError('Content project is outside the active organization.');
      if ((await executions.markRunning({ ...scope, id: execution.id })).count !== 1)
        throw new Error('AI execution could not start.');

      let result: Awaited<ReturnType<TextGenerationProvider['generate']>>;
      try {
        result = await options.provider.generate({
          operation: 'rewrite',
          ...(input.model === undefined ? {} : { model: input.model }),
          prompt: `${prompt.instruction}\n\nRewrite instruction:\n${instruction}\n\nSource version:\n${source.body ?? source.script ?? ''}\n\nContext:\n${JSON.stringify(assembled)}`,
        });
      } catch (error) {
        const blocked = error instanceof TextGenerationProviderUnavailableError;
        await executions.markFailed({
          ...scope,
          id: execution.id,
          errorCode: blocked ? 'BLOCKED_EXTERNAL' : 'REWRITE_FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown rewrite failure.',
        });
        if (blocked) throw new ContentGenerationBlockedExternalError();
        throw error;
      }

      try {
        const version = await executions.completeRewrite({
          ...scope,
          id: execution.id,
          body: result.text,
          ...(result.usage?.inputTokens === undefined
            ? {}
            : { inputTokens: result.usage.inputTokens }),
          ...(result.usage?.outputTokens === undefined
            ? {}
            : { outputTokens: result.usage.outputTokens }),
        });
        if (!version) throw new Error('Rewritten content version could not be persisted.');
        return { executionId: execution.id, version };
      } catch (error) {
        await executions.markFailed({
          ...scope,
          id: execution.id,
          errorCode: 'REWRITE_PERSISTENCE_FAILED',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown rewrite persistence failure.',
        });
        throw error;
      }
    },
  };
}

/** Production composition root kept in core so web entry points never import a provider directly. */
export function createProductionContentGenerationService() {
  // This double is deliberately reachable only from the local Playwright server.
  // It is never selected by a production URL or by an absent provider credential.
  if (
    process.env.E2E_TEST_TEXT_GENERATION === '1' &&
    process.env.APP_URL?.startsWith('http://127.0.0.1:')
  ) {
    return createContentGenerationService({
      provider: new MockTextGenerationProvider({
        text: 'Детерминированный тестовый черновик.',
        model: 'e2e-deterministic-v1',
      }),
    });
  }
  return createContentGenerationService({ provider: new OpenAiTextGenerationProvider() });
}
