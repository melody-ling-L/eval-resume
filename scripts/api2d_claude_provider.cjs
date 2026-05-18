class Api2dClaudeProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config || {};
    this.env = options.env || {};
  }

  id() {
    return this.options.id || 'claude-sonnet-4-6-via-api2d';
  }

  toString() {
    return this.options.label || '[Claude Sonnet 4.6 via API2D]';
  }

  async callApi(prompt, _context, callApiOptions) {
    const apiKeyEnvar = this.config.apiKeyEnvar || 'KEY_API2D';
    const apiKey = this.env[apiKeyEnvar] || process.env[apiKeyEnvar];
    if (!apiKey) {
      return { error: `Missing ${apiKeyEnvar}` };
    }

    const apiBaseUrl = (this.config.apiBaseUrl || 'https://openai.api2d.net/v1').replace(/\/$/, '');
    const model = this.config.model || 'claude-sonnet-4-6';
    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: this.config.max_tokens || 1100,
      ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
    };

    try {
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        ...(callApiOptions?.abortSignal ? { signal: callApiOptions.abortSignal } : {}),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        return { error: `API error: invalid JSON response: ${responseText.slice(0, 400)}` };
      }

      if (!response.ok) {
        return { error: `API error: ${response.status} ${response.statusText}: ${responseText.slice(0, 400)}` };
      }

      const anthropicText = Array.isArray(data.content)
        ? data.content
            .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
            .map((item) => item.text)
            .join('\n')
        : '';
      const openaiText = data.choices?.[0]?.message?.content;
      const output = anthropicText || openaiText;

      if (!output) {
        return { error: `API error: missing output text: ${responseText.slice(0, 400)}` };
      }

      const usage = data.usage || {};
      const promptTokens = usage.input_tokens ?? usage.prompt_tokens;
      const completionTokens = usage.output_tokens ?? usage.completion_tokens;

      return {
        output,
        ...(promptTokens !== undefined || completionTokens !== undefined
          ? {
              tokenUsage: {
                ...(promptTokens !== undefined ? { prompt: promptTokens } : {}),
                ...(completionTokens !== undefined ? { completion: completionTokens } : {}),
                ...((promptTokens !== undefined || completionTokens !== undefined)
                  ? {
                      total: (promptTokens || 0) + (completionTokens || 0),
                    }
                  : {}),
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      return { error: `API error: ${String(error)}` };
    }
  }
}

module.exports = Api2dClaudeProvider;