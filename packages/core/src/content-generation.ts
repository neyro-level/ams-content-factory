import {
  ContentProjectStatus,
  ContentVersionAuthorType,
  createAiExecutionRepository,
  createContentRepository,
} from '@ams-content-factory/db';
import {
  OpenAiTextGenerationProvider,
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
      if (assembled.project.status === ContentProjectStatus.IDEA) {
        const started = await content.transition({
          ...scope,
          id: input.contentProjectId,
          from: ContentProjectStatus.IDEA,
          to: ContentProjectStatus.RESEARCHING,
        });
        if (started.count !== 1) throw new Error('Content project generation could not start.');
      } else if (assembled.project.status !== ContentProjectStatus.RESEARCHING) {
        throw new AccessDeniedError('Content project is not ready for generation.');
      }
      const prompt = getPrompt(input.promptKey);
      const execution = await executions.create({
        ...scope,
        provider: 'openai',
        model: input.model ?? 'gpt-5-mini',
        operation: input.promptKey,
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
          operation: input.promptKey,
          ...(input.model === undefined ? {} : { model: input.model }),
          prompt: `${prompt.instruction}\n\nContext:\n${JSON.stringify(assembled)}`,
        });
      } catch (error) {
        const blocked = error instanceof TextGenerationProviderUnavailableError;
        await executions.markFailed({
          ...scope,
          id: execution.id,
          errorCode: blocked ? 'BLOCKED_EXTERNAL' : 'GENERATION_FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown generation failure.',
        });
        if (blocked) throw new ContentGenerationBlockedExternalError();
        await content.transition({
          ...scope,
          id: input.contentProjectId,
          from: ContentProjectStatus.RESEARCHING,
          to: ContentProjectStatus.FAILED,
        });
        throw error;
      }

      // From this point the provider has already succeeded. Do not reclassify a
      // persistence failure as a provider failure: the running execution is the
      // durable reconciliation signal until the integrity wave handles it.
      const version = await content.appendVersion({
        ...scope,
        createdByType: ContentVersionAuthorType.AI,
        aiExecutionId: execution.id,
        body: result.text,
      });
      if (!version) throw new Error('Generated content version could not be persisted.');
      if (
        (
          await executions.markSucceeded({
            ...scope,
            id: execution.id,
            ...(result.usage?.inputTokens === undefined
              ? {}
              : { inputTokens: result.usage.inputTokens }),
            ...(result.usage?.outputTokens === undefined
              ? {}
              : { outputTokens: result.usage.outputTokens }),
          })
        ).count !== 1
      )
        throw new Error('AI execution success could not be persisted.');
      if (
        (
          await content.transition({
            ...scope,
            id: input.contentProjectId,
            from: ContentProjectStatus.RESEARCHING,
            to: ContentProjectStatus.DRAFT,
          })
        ).count !== 1
      )
        throw new Error('Generated content could not enter DRAFT.');
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

      const version = await content.appendVersion({
        ...scope,
        createdByType: ContentVersionAuthorType.AI,
        aiExecutionId: execution.id,
        body: result.text,
      });
      if (!version) throw new Error('Rewritten content version could not be persisted.');
      if (
        (
          await executions.markSucceeded({
            ...scope,
            id: execution.id,
            ...(result.usage?.inputTokens === undefined
              ? {}
              : { inputTokens: result.usage.inputTokens }),
            ...(result.usage?.outputTokens === undefined
              ? {}
              : { outputTokens: result.usage.outputTokens }),
          })
        ).count !== 1
      )
        throw new Error('AI rewrite success could not be persisted.');
      return { executionId: execution.id, version };
    },
  };
}

/** Production composition root kept in core so web entry points never import a provider directly. */
export function createProductionContentGenerationService() {
  return createContentGenerationService({ provider: new OpenAiTextGenerationProvider() });
}
