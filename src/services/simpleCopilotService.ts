import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Simplified Copilot Service - only what's needed for simple package upgrader
 */
export class CopilotService {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Generate AI upgrade strategy for simple package updates
     */
    async generateUpgradeStrategy(
        updateSummary: any,
        dependencyInfo?: any
    ): Promise<string> {
        try {
            const prompt = this.buildUpgradeStrategyPrompt(updateSummary, dependencyInfo);
            
            // Try to use VS Code's language model API
            const aiResponse = await this.tryLanguageModelAnalysis(prompt);
            if (aiResponse) {
                return aiResponse;
            }

            // Fallback to simple strategy
            return this.generateFallbackUpgradeStrategy(updateSummary);
            
        } catch (error) {
            this.logger.warn('AI upgrade strategy generation failed, using fallback', error);
            return this.generateFallbackUpgradeStrategy(updateSummary);
        }
    }

    /**
     * Try to use VS Code's language model API
     */
    private async tryLanguageModelAnalysis(prompt: string): Promise<string | null> {
        try {
            if (!vscode.lm) {
                this.logger.info('Language Model API not available');
                return null;
            }

            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
            });

            if (models.length === 0) {
                this.logger.info('No Copilot language models available');
                return null;
            }

            const model = models[0];
            this.logger.info('Using Copilot model for upgrade strategy', { 
                modelId: model.id
            });

            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await model.sendRequest(messages, {
                justification: 'Generating .NET package upgrade strategy'
            });

            let result = '';
            for await (const fragment of response.text) {
                result += fragment;
            }

            return result;

        } catch (error) {
            this.logger.warn('Language model analysis failed', error);
            return null;
        }
    }

    /**
     * Build prompt for upgrade strategy
     */
    private buildUpgradeStrategyPrompt(updateSummary: any, dependencyInfo?: any): string {
        const updates = updateSummary.updates || [];
        
        return `You are a .NET package upgrade expert. Analyze these available package updates and provide an upgrade strategy.

Available Package Updates:
${updates.map((u: any) => `- ${u.packageName}: ${u.currentVersion} → ${u.recommendedVersion} (Project: ${u.projectPath})`).join('\n')}

Please provide a JSON response with this structure:
{
  "name": "Strategy Name",
  "description": "Brief strategy description",
  "packages": [
    {
      "packageName": "PackageName",
      "currentVersion": "1.0.0", 
      "recommendedVersion": "2.0.0",
      "projectPath": "Project.csproj"
    }
  ],
  "aiReasoning": "Explanation of the upgrade order and reasoning"
}

Consider:
1. Upgrade framework packages first (Microsoft.*)
2. Group related packages together
3. Upgrade dependencies before dependents
4. Avoid breaking changes where possible
5. Prioritize security updates

Respond with ONLY the JSON object, no additional text.`;
    }

    /**
     * Generate fallback strategy when AI is unavailable
     */
    private generateFallbackUpgradeStrategy(updateSummary: any): string {
        const updates = updateSummary.updates || [];
        
        // Simple strategy: prioritize Microsoft packages first, then others
        const microsoftPackages = updates.filter((u: any) => u.packageName.startsWith('Microsoft.'));
        const otherPackages = updates.filter((u: any) => !u.packageName.startsWith('Microsoft.'));
        
        const orderedPackages = [...microsoftPackages, ...otherPackages];

        return JSON.stringify({
            name: "Sequential Upgrade Strategy",
            description: "Upgrade packages sequentially, starting with Microsoft packages",
            packages: orderedPackages,
            aiReasoning: "AI unavailable - using fallback strategy that prioritizes Microsoft packages first, then others alphabetically"
        }, null, 2);
    }

    /**
     * Diagnose Copilot availability for logging
     */
    async diagnoseCopilotAvailability(): Promise<{
        languageModelAvailable: boolean;
        availableModels: any[];
        recommendations: string[];
    }> {
        try {
            const languageModelAvailable = !!vscode.lm;
            let availableModels: any[] = [];
            let recommendations: string[] = [];

            if (languageModelAvailable) {
                try {
                    availableModels = await vscode.lm.selectChatModels({
                        vendor: 'copilot'
                    });
                } catch (error) {
                    this.logger.warn('Failed to get available models', error);
                }
            }

            if (availableModels.length === 0) {
                recommendations.push('Install GitHub Copilot extension');
                recommendations.push('Sign in to GitHub Copilot');
                recommendations.push('Ensure Copilot subscription is active');
            }

            return {
                languageModelAvailable,
                availableModels,
                recommendations
            };

        } catch (error) {
            this.logger.error('Copilot availability diagnosis failed', error);
            return {
                languageModelAvailable: false,
                availableModels: [],
                recommendations: ['Install GitHub Copilot extension']
            };
        }
    }
} 