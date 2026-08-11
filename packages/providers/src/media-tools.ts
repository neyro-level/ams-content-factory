export type MediaInspection = {
  mimeType: string;
  durationMs?: number;
  width?: number;
  height?: number;
};

export interface FfmpegProvider {
  inspect(input: { assetKey: string }): Promise<MediaInspection>;
  transcode(input: { inputKey: string; outputKey: string }): Promise<{ outputKey: string }>;
  normalize(input: { inputKey: string; outputKey: string }): Promise<{ outputKey: string }>;
  createThumbnail(input: { inputKey: string; outputKey: string }): Promise<{ outputKey: string }>;
  extractAudio(input: { inputKey: string; outputKey: string }): Promise<{ outputKey: string }>;
  concatenate(input: { inputKeys: string[]; outputKey: string }): Promise<{ outputKey: string }>;
  burnCaptions(input: {
    inputKey: string;
    captionKey: string;
    outputKey: string;
  }): Promise<{ outputKey: string }>;
  technicalQc(input: { inputKey: string }): Promise<{ passed: boolean; issues: string[] }>;
  outputH264(input: { inputKey: string; outputKey: string }): Promise<{ outputKey: string }>;
}

/** Contract-only renderer: process execution is deliberately kept out of application code. */
export class MockFfmpegProvider implements FfmpegProvider {
  async inspect(): Promise<MediaInspection> {
    return { mimeType: 'video/mp4', durationMs: 1_000, width: 1080, height: 1920 };
  }

  async transcode(input: { inputKey: string; outputKey: string }) {
    return this.oneInput(input);
  }

  async normalize(input: { inputKey: string; outputKey: string }) {
    return this.oneInput(input);
  }

  async createThumbnail(input: { inputKey: string; outputKey: string }) {
    return this.oneInput(input);
  }

  async extractAudio(input: { inputKey: string; outputKey: string }) {
    return this.oneInput(input);
  }

  async concatenate(input: { inputKeys: string[]; outputKey: string }) {
    if (input.inputKeys.length === 0)
      throw new Error('At least one input asset is required to compose video.');
    return { outputKey: input.outputKey };
  }

  async burnCaptions(input: { inputKey: string; captionKey: string; outputKey: string }) {
    if (!input.captionKey.trim()) throw new Error('A caption asset is required.');
    return this.oneInput(input);
  }

  async technicalQc(input: { inputKey: string }) {
    if (!input.inputKey.trim()) throw new Error('An input asset is required.');
    return { passed: true, issues: [] };
  }

  async outputH264(input: { inputKey: string; outputKey: string }) {
    return this.oneInput(input);
  }

  private oneInput(input: { inputKey: string; outputKey: string }) {
    if (!input.inputKey.trim() || !input.outputKey.trim()) {
      throw new Error('Input and output assets are required.');
    }
    return { outputKey: input.outputKey };
  }
}

export interface RemotionProvider {
  render(input: {
    composition: string;
    props: Record<string, unknown>;
    outputKey: string;
  }): Promise<{ outputKey: string }>;
}

export class MockRemotionProvider implements RemotionProvider {
  async render(input: { composition: string; props: Record<string, unknown>; outputKey: string }) {
    if (!input.composition.trim()) throw new Error('A Remotion composition name is required.');
    return { outputKey: input.outputKey };
  }
}
