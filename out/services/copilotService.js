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
 * Service for interacting with GitHub Copilot in Agent mode
 */
class CopilotService {
    constructor(logger) {
        this.logger = logger;
        this.initializeCopilotAgent();
    }
    /**
     * Initialize Copilot agent and register chat participant
     */
    initializeCopilotAgent() {
        try {
            // Register as a Copilot chat participant
            this.chatParticipant = vscode.chat.createChatParticipant('dotnet-package-upgrader', this.handleChatRequest.bind(this));
            this.chatParticipant.iconPath = vscode.Uri.file('icon.png');
            this.chatParticipant.followupProvider = {
                provideFollowups: this.provideFollowups.bind(this)
            };
            this.logger.info('Copilot agent initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize Copilot agent', error);
        }
    }
    /**
     * Handle chat requests from Copilot
     */
    async handleChatRequest(request, context, stream, token) {
        try {
            stream.progress('Analyzing package dependencies...');
            const prompt = request.prompt;
            const analysis = await this.analyzeWithLanguageModel(prompt, token);
            stream.markdown(analysis);
            return { metadata: { command: 'packageUpgrade' } };
        }
        catch (error) {
            this.logger.error('Chat request failed', error);
            stream.markdown('I encountered an error while analyzing the packages. Please try again.');
            return { metadata: { command: '', error: error } };
        }
    }
    /**
     * Use VS Code's language model API to get Copilot responses with fallback
     */
    async analyzeWithLanguageModel(prompt, token) {
        try {
            // Check if language model API is available
            if (!vscode.lm) {
                throw new Error('Language Model API not available');
            }
            // Get available language models
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4'
            });
            if (models.length === 0) {
                throw new Error('No Copilot language models available');
            }
            const model = models[0];
            this.logger.info('Using Copilot model', {
                modelId: model.id,
                vendor: model.vendor,
                family: model.family
            });
            // Create chat messages
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];
            // Send request to Copilot
            const response = await model.sendRequest(messages, {}, token);
            // Collect response
            let result = '';
            for await (const fragment of response.text) {
                result += fragment;
            }
            return result;
        }
        catch (error) {
            this.logger.error('Language model request failed', error);
            // **FALLBACK: Return a structured fallback response**
            return this.generateFallbackResponse(prompt);
        }
    }
    /**
     * Generate a fallback response when Copilot is not available
     */
    generateFallbackResponse(prompt) {
        this.logger.info('Using fallback analysis instead of Copilot');
        // Extract package name from prompt
        const packageMatch = prompt.match(/Package:\s*([^\n]+)/);
        const packageName = packageMatch ? packageMatch[1].trim() : 'Unknown Package';
        // Extract versions from prompt
        const versionMatch = prompt.match(/versions:\s*([^\n]+)/);
        const versions = versionMatch ? versionMatch[1].split(',').map(v => v.trim()) : ['latest'];
        // Determine highest version (simple semantic versioning)
        const recommendedVersion = this.selectHighestVersion(versions);
        return JSON.stringify({
            recommendedVersion: recommendedVersion,
            reasoning: `Fallback analysis: Selected highest version ${recommendedVersion} due to Copilot unavailability. Manual review recommended.`,
            migrationSteps: [
                `Update ${packageName} to version ${recommendedVersion}`,
                "Run tests to verify compatibility",
                "Review breaking changes documentation manually"
            ],
            breakingChanges: [
                "Manual review required - Copilot analysis unavailable"
            ],
            compatibilityNotes: [
                "Compatibility analysis requires manual verification",
                "Check package documentation for breaking changes"
            ],
            testImpact: [
                "Run full test suite after update",
                "Manual testing recommended for critical functionality"
            ],
            dependencyUpdates: []
        });
    }
    /**
     * Simple version selection fallback
     */
    selectHighestVersion(versions) {
        if (versions.length === 0)
            return 'latest';
        if (versions.length === 1)
            return versions[0];
        // Simple sorting - in production you'd want proper semantic version comparison
        return versions.sort((a, b) => {
            // Remove non-numeric characters for basic comparison
            const aNum = a.replace(/[^\d.]/g, '');
            const bNum = b.replace(/[^\d.]/g, '');
            return bNum.localeCompare(aNum, undefined, { numeric: true });
        })[0];
    }
    /**
     * Analyze version conflicts using Copilot agent
     */
    async analyzeVersionConflict(packageName, currentVersions, projectPaths, dependencies) {
        try {
            const prompt = this.buildVersionConflictPrompt(packageName, currentVersions, projectPaths, dependencies);
            const token = new vscode.CancellationTokenSource().token;
            const analysis = await this.analyzeWithLanguageModel(prompt, token);
            return this.parseVersionConflictResponse(analysis);
        }
        catch (error) {
            this.logger.error('Version conflict analysis failed', error);
            throw error;
        }
    }
    /**
     * Build a comprehensive prompt for version conflict analysis
     */
    buildVersionConflictPrompt(packageName, currentVersions, projectPaths, dependencies) {
        const projectDetails = projectPaths.map((path, index) => {
            const deps = dependencies[index];
            const depList = Array.from(deps.entries())
                .map(([name, version]) => `    - ${name}: ${version}`)
                .join('\n');
            return `Project: ${path}
  Current ${packageName} version: ${currentVersions[index]}
  Dependencies:
${depList}`;
        }).join('\n\n');
        return `You are a .NET package management expert. Analyze this version conflict and provide a detailed resolution strategy.

PACKAGE CONFLICT ANALYSIS:
Package: ${packageName}
Conflicting versions: ${currentVersions.join(', ')}

PROJECT DETAILS:
${projectDetails}

Please provide a JSON response with the following structure:
{
  "recommendedVersion": "string - the version that resolves all conflicts",
  "reasoning": "string - detailed explanation of why this version was chosen",
  "migrationSteps": ["array of specific steps to migrate"],
  "breakingChanges": ["array of potential breaking changes"],
  "compatibilityNotes": ["array of compatibility considerations"],
  "testImpact": ["array of testing recommendations"],
  "dependencyUpdates": [
    {
      "package": "string - related package that needs updating",
      "currentVersion": "string",
      "recommendedVersion": "string",
      "reason": "string"
    }
  ]
}

Focus on:
1. Semantic versioning compatibility
2. Transitive dependency resolution
3. .NET framework compatibility
4. Security implications
5. Migration complexity`;
    }
    /**
     * Parse Copilot's response for version conflict analysis
     */
    parseVersionConflictResponse(response) {
        try {
            // Extract JSON from response (in case it's wrapped in markdown)
            const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : response;
            return JSON.parse(jsonString);
        }
        catch (error) {
            this.logger.error('Failed to parse Copilot response', { response, error });
            // Return a fallback response
            return {
                recommendedVersion: "latest",
                reasoning: "Could not parse Copilot response, falling back to latest version",
                migrationSteps: ["Update to latest version", "Run tests to verify compatibility"],
                breakingChanges: ["Unknown - manual review required"],
                compatibilityNotes: ["Manual compatibility check required"],
                testImpact: ["Run full test suite"],
                dependencyUpdates: []
            };
        }
    }
    /**
     * Get package update suggestions from Copilot
     */
    async getPackageUpdateSuggestions(packageName, currentVersion) {
        try {
            this.logger.info('Requesting package update suggestions from Copilot', {
                packageName,
                currentVersion
            });
            const prompt = this.generateUpdateSuggestionsPrompt(packageName, currentVersion);
            const token = new vscode.CancellationTokenSource().token;
            const response = await this.analyzeWithLanguageModel(prompt, token);
            return this.parseUpdateSuggestions(response);
        }
        catch (error) {
            this.logger.error('Failed to get package update suggestions', error);
            throw error;
        }
    }
    /**
     * Generate prompt for package update suggestions
     */
    generateUpdateSuggestionsPrompt(packageName, currentVersion) {
        const context = this.agentContext ? `
Project Context:
- Type: ${this.agentContext.projectType}
- Target Framework: ${this.agentContext.targetFramework}
- Custom Rules: ${this.agentContext.customRules.join(', ')}
- Security Requirements: ${this.agentContext.securityRequirements.join(', ')}
` : '';
        return `You are a .NET package management expert. Analyze the following package and suggest appropriate updates.

Package: ${packageName}
Current Version: ${currentVersion}
${context}

Provide a JSON response with this structure:
[
  {
    "packageName": "${packageName}",
    "currentVersion": "${currentVersion}",
    "suggestedVersion": "string",
    "breakingChanges": boolean,
    "confidence": number (0-1),
    "securityAnalysis": ["array of security considerations"],
    "migrationComplexity": "low|medium|high",
    "testImpact": ["array of testing considerations"]
  }
]

Consider:
1. Latest stable version
2. Security vulnerabilities
3. Breaking changes
4. .NET compatibility
5. Dependencies`;
    }
    /**
     * Parse update suggestions from Copilot response
     */
    parseUpdateSuggestions(response) {
        try {
            const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : response;
            const parsed = JSON.parse(jsonString);
            if (!Array.isArray(parsed)) {
                throw new Error('Expected array response');
            }
            return parsed.map(suggestion => ({
                packageName: suggestion.packageName,
                currentVersion: suggestion.currentVersion,
                suggestedVersion: suggestion.suggestedVersion,
                breakingChanges: suggestion.breakingChanges || false,
                confidence: suggestion.confidence || 0.5,
                securityAnalysis: suggestion.securityAnalysis || [],
                migrationComplexity: suggestion.migrationComplexity || 'medium',
                testImpact: suggestion.testImpact || []
            }));
        }
        catch (error) {
            this.logger.error('Failed to parse update suggestions', error);
            return [];
        }
    }
    /**
     * Provide follow-up suggestions
     */
    async provideFollowups(result, context, token) {
        return [
            {
                prompt: 'Analyze breaking changes for this update',
                label: 'Check Breaking Changes'
            },
            {
                prompt: 'Show migration steps',
                label: 'Migration Guide'
            },
            {
                prompt: 'Security impact analysis',
                label: 'Security Analysis'
            }
        ];
    }
    /**
     * Set the context for the Copilot agent
     */
    async setAgentContext(context) {
        this.agentContext = context;
        this.logger.info('Set Copilot agent context', { context });
    }
    /**
     * Dispose of the chat participant
     */
    dispose() {
        this.chatParticipant?.dispose();
    }
}
exports.CopilotService = CopilotService;
//# sourceMappingURL=copilotService.js.map