/**
 * Call Kiro's AI service to generate commit message
 */
export async function callKiroAI(prompt: string): Promise<string> {
    try {
        // Use Kiro's AI service through VS Code API
        // This integrates with whatever AI model is currently selected in Kiro IDE
        const vscode = await import('vscode');

        // Check if Kiro AI service is available
        if (!vscode.lm) {
            throw new Error('Kiro AI service not available');
        }

        // Get available language models
        const models = await vscode.lm.selectChatModels();
        if (models.length === 0) {
            throw new Error('No AI models available in Kiro IDE');
        }

        // Use the first available model (or could be made configurable)
        const model = models[0];

        // Create chat request
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        // Send request to AI model
        const request = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        // Collect the response
        let response = '';
        for await (const fragment of request.text) {
            response += fragment;
        }

        if (!response.trim()) {
            throw new Error('AI service returned empty response');
        }

        return response.trim();
    } catch (error) {
        // If Kiro AI is not available, fall back to mock for development
        console.warn('Kiro AI service not available, using fallback:', error);
        throw 'Kiro AI service not available, using fallback';
    }
}
