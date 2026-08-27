type SpanAttributes = Record<string, string | number | boolean>;

export type Span = {
  setAttribute: (key: string, value: string | number | boolean) => void;
  addEvent: (name: string, attributes?: SpanAttributes) => void;
};

const noopSpan: Span = {
  setAttribute: () => {},
  addEvent: () => {},
};

export async function withSpan<T>(
  _name: string,
  _attributes: SpanAttributes | undefined,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return fn(noopSpan);
}

export function addSpanEvent(_name: string, _attributes?: SpanAttributes): void {}
