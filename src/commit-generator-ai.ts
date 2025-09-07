// src/ai-commit-generator.ts
import OpenAI from 'openai';
import { AnalyzedChange } from './change-analyzer';
import { CommitGenerator } from './commit-generator';

interface AICommitGeneratorConfig {
    openaiApiKey?: string;
    model?: string;
    temperature?: number;
    style?: 'conventional' | 'semantic' | 'custom';
    maxLength?: number;
}

/**
 * AICommitGenerator tries OpenAI to generate a meaningful commit message.
 * If OpenAI fails, it falls back to CommitGenerator's original rule-based system.
 */
class AICommitGenerator extends CommitGenerator {
    private client: OpenAI | null;
    private model: string;
    private temperature: number;

    constructor(config: AICommitGeneratorConfig = {}) {
        super(config);

        this.client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

        this.model = config.model || 'gpt-4.1-mini';
        this.temperature = config.temperature ?? 0.2;
    }

    async generate(changes: AnalyzedChange[]): Promise<string> {
        if (!this.client) {
            // No API key available → fallback immediately
            return super.generate(changes);
        }

        try {
            const prompt = this.buildPrompt(changes);
            const response = await this.client.chat.completions.create({
                model: this.model,
                temperature: this.temperature,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an AI commit message generator. Generate clear, concise, conventional commit messages.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            });

            const aiMessage = response.choices[0]?.message?.content?.trim() || '';

            if (aiMessage.length === 0) {
                throw new Error('Empty AI response');
            }

            // Truncate if too long
            if (aiMessage.length > this['config'].maxLength) {
                return aiMessage.substring(0, this['config'].maxLength - 3) + '...';
            }

            return aiMessage;
        } catch (err) {
            console.warn('AI commit generation failed, falling back:', err);
            return super.generate(changes);
        }
    }

    private buildPrompt(changes: AnalyzedChange[]): string {
        const diffSummary = changes.map((c) => `File: ${c.filePath}\nChange type: ${c.changeType}\nSnippet:\n${c.diff.slice(0, 300)}`).join('\n\n');

        return `
Generate a commit message in the "${this['config'].style}" style.
Keep it concise, under ${this['config'].maxLength} characters.
Use imperative tone, and follow conventional commit best practices if applicable.

Changes:
${diffSummary}
`;
    }
}

export { AICommitGenerator };
