// The only thing the rest of the app knows about "the AI": a provider turns a few
// product facts into draft text. Swapping Gemini for another vendor (or for the
// mock) is a change to one file, and tests never need the network.
export interface DescriptionInput {
  name: string;
  category: string;
  priceCents: number;
}

export interface DescriptionProvider {
  readonly name: "gemini" | "mock";
  /** Returns raw model text. Callers must pass it through sanitizeDescription. */
  generate(input: DescriptionInput): Promise<string>;
}
