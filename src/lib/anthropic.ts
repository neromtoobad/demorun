// Thin Anthropic Messages API client. Uses forced tool-use for reliable
// structured output — the model must call our tool, so we get validated JSON
// back instead of parsing prose.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeToolCall {
  model: string;
  system: string;
  user: string;
  tool: ToolDef;
  maxTokens?: number;
}

// Calls Claude, forces the given tool, and returns the tool's input object.
export async function callClaudeTool<T>(opts: ClaudeToolCall): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; input?: unknown }>;
  };
  const block = data.content?.find((b) => b.type === 'tool_use');
  if (!block?.input) throw new Error('no tool_use block in Anthropic response');
  return block.input as T;
}
