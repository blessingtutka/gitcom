import OpenAI from 'openai';
import * as vscode from 'vscode';

interface OpenAIConfig {
    model?: string;
    temperature?: number;
    maxLength?: number;
    apiKey?: string;
}

export const getApiKey = (): string | undefined => {
    const config = vscode.workspace.getConfiguration('gitcom');
    return config.get<string>('openaiApiKey');
};

const openAIClient = (config: OpenAIConfig = {}) => {
    const apiKey = config.apiKey || getApiKey();

    if (!apiKey) {
        throw new Error('OpenAI API key is required');
    }

    return new OpenAI({
        apiKey: apiKey,
    });
};

// Usage:
// const openai = createOpenAIClient();
// const response = await openai.chat.completions.create({
//     model: 'gpt-3.5-turbo',
//     messages: [{ role: 'user', content: 'Hello!' }],
//     temperature: 0.7,
//     max_tokens: 1000
// });

export { openAIClient };
export type { OpenAIConfig };
