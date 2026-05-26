declare module "./phonemizer.min.mjs" {
  export function phonemize(text: string, lang?: string): Promise<string[]>;
  export function list_voices(lang?: string): Promise<unknown>;
}
