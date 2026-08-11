export type TranscriptWord = { word: string; startMs: number; endMs: number };
export interface TranscriptionProvider {
  transcribe(input: {
    assetKey: string;
    language: string;
  }): Promise<{ text: string; words: TranscriptWord[]; durationMs: number }>;
}
export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe() {
    return {
      text: 'Mock transcript',
      words: [
        { word: 'Mock', startMs: 0, endMs: 400 },
        { word: 'transcript', startMs: 450, endMs: 1000 },
      ],
      durationMs: 1000,
    };
  }
}
