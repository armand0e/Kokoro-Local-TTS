/**
 * Type declarations for @huggingface/transformers.
 * The package's type exports don't resolve correctly with bundler module resolution.
 * We declare the subset we actually use.
 */
declare module "@huggingface/transformers" {
  export interface PretrainedModelOptions {
    device?: string;
    dtype?: string;
    progress_callback?: (progress: { progress?: number; status?: string }) => void;
    [key: string]: unknown;
  }

  export interface ImageToTextOutput {
    generated_text: string;
  }

  export interface ImageToTextPipeline {
    (input: Blob | string, options?: { max_new_tokens?: number }): Promise<
      ImageToTextOutput | ImageToTextOutput[]
    >;
    dispose?: () => Promise<void>;
  }

  export interface StyleTextToSpeech2ModelOutput {
    waveform: Tensor;
  }

  export interface StyleTextToSpeech2ModelInstance {
    (inputs: Record<string, unknown>): Promise<{ waveform: Tensor }>;
    generate_speech(
      input_ids: Tensor,
      options: { voice: Tensor; speed?: number }
    ): Promise<StyleTextToSpeech2ModelOutput>;
  }

  export const StyleTextToSpeech2Model: {
    from_pretrained(
      modelId: string,
      options?: PretrainedModelOptions
    ): Promise<StyleTextToSpeech2ModelInstance>;
  };
  export type StyleTextToSpeech2Model = StyleTextToSpeech2ModelInstance;

  export interface AutoTokenizerInstance {
    (text: string, options?: Record<string, unknown>): { input_ids: Tensor };
  }

  export const AutoTokenizer: {
    from_pretrained(
      modelId: string,
      options?: PretrainedModelOptions
    ): Promise<AutoTokenizerInstance>;
  };

  export class Tensor {
    data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
    dims: number[];
    constructor(type: string, data: ArrayLike<number> | BigInt64Array, dims: number[]);
    tolist(): number[] | number[][];
  }

  export class RawImage {
    static fromBlob(blob: Blob): Promise<RawImage>;
    static fromURL(url: string): Promise<RawImage>;
  }

  export function pipeline<T = ImageToTextPipeline>(
    task: string,
    model?: string,
    options?: PretrainedModelOptions
  ): Promise<T>;
}
