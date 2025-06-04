"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotService = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Simplified Copilot Service - Focus on outdated package strategies
 */
class CopilotService {
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Generate AI upgrade strategy for outdated packages
     */
    async generateUpgradeStrategy(updateSummary, dependencyInfo) {
        try {
            const prompt = this.buildUpgradeStrategyPrompt(updateSummary, dependencyInfo);
            // Try to use VS Code's language model API
            const aiResponse = await this.tryLanguageModelAnalysis(prompt);
            if (aiResponse) {
                return aiResponse;
            }
            // Fallback to simple strategy
            return this.generateFallbackUpgradeStrategy(updateSummary);
        }
        catch (error) {
            this.logger.warn('AI upgrade strategy generation failed, using fallback', error);
            return this.generateFallbackUpgradeStrategy(updateSummary);
        }
    }
    /**
     * Try to use VS Code's language model API
     */
    async tryLanguageModelAnalysis(prompt) {
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
        }
        catch (error) {
            this.logger.warn('Language model analysis failed', error);
            return null;
        }
    }
    /**
     * Build prompt for upgrade strategy
     */
    buildUpgradeStrategyPrompt(updateSummary, dependencyInfo) {
        const updates = updateSummary.updates || [];
        return `You are a .NET package upgrade expert. Create an intelligent upgrade strategy for these outdated packages.

OUTDATED PACKAGES:
${updates.map((u) => `- ${u.packageName}: ${u.currentVersion} → ${u.recommendedVersion} (${u.projectPath})`).join('\n')}

UPGRADE PRINCIPLES:
1. 📦 Microsoft.* framework packages = Upgrade FIRST (highest priority)
2. 🔗 Related package families = Group together (e.g., all Entity Framework packages)
3. 📈 Dependencies = Upgrade before dependents  
4. 🧪 Breaking changes = Minimize impact where possible
5. 📊 Version jumps = Prefer incremental updates over major version leaps

Please respond with ONLY a JSON object in this exact format:
{
  "name": "Upgrade Strategy Name",
  "description": "Brief strategy description",
  "packages": [
    {
      "packageName": "ExactPackageName",
      "currentVersion": "CurrentVersion",
      "recommendedVersion": "TargetVersion",
      "projectPath": "ProjectPath"
    }
  ],
  "aiReasoning": "Detailed explanation of the upgrade order and reasoning"
}

CRITICAL: Return ONLY the JSON object, no markdown formatting or additional text.`;
    }
    /**
     * Generate fallback strategy when AI is unavailable
     */
    generateFallbackUpgradeStrategy(updateSummary) {
        const updates = updateSummary.updates || [];
        // Simple strategy: Microsoft packages first, then others alphabetically
        const microsoftPackages = updates.filter((u) => u.packageName.startsWith('Microsoft.'));
        const otherPackages = updates.filter((u) => !u.packageName.startsWith('Microsoft.'));
        const orderedPackages = [...microsoftPackages, ...otherPackages];
        return JSON.stringify({
            name: "Microsoft-First Sequential Strategy",
            description: `Upgrade ${microsoftPackages.length} Microsoft packages first, then ${otherPackages.length} other packages`,
            packages: orderedPackages,
            aiReasoning: "AI unavailable - using fallback strategy that prioritizes Microsoft framework packages first to ensure compatibility, followed by other packages alphabetically"
        }, null, 2);
    }
    /**
     * Diagnose Copilot availability for logging
     */
    async diagnoseCopilotAvailability() {
        try {
            const languageModelAvailable = !!vscode.lm;
            let availableModels = [];
            let recommendations = [];
            if (languageModelAvailable) {
                try {
                    availableModels = await vscode.lm.selectChatModels({
                        vendor: 'copilot'
                    });
                }
                catch (error) {
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
        }
        catch (error) {
            this.logger.error('Copilot availability diagnosis failed', error);
            return {
                languageModelAvailable: false,
                availableModels: [],
                recommendations: ['Install GitHub Copilot extension']
            };
        }
    }
}
exports.CopilotService = CopilotService;
//# sourceMappingURL=copilotService.js.map