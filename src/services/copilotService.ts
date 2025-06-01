import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Interface for package update suggestions from Copilot
 */
export interface PackageUpdateSuggestion {
    packageName: string;
    currentVersion: string;
    suggestedVersion: string;
    breakingChanges: boolean;
    confidence: number;
    securityAnalysis?: string[];
    migrationComplexity?: 'low' | 'medium' | 'high';
    testImpact?: string[];
}

/**
 * Interface for Copilot agent context
 */
interface CopilotAgentContext {
    projectPath: string;
    projectType: string;
    targetFramework: string;
    customRules: string[];
    securityRequirements: string[];
}

/**
 * Service for interacting with GitHub Copilot in Agent mode
 */
export class CopilotService {
    private logger: Logger;
    private agentContext?: CopilotAgentContext;
    private chatParticipant?: vscode.ChatParticipant;

    constructor(logger: Logger) {
        this.logger = logger;
        this.initializeCopilotAgent();
    }

    /**
     * Initialize Copilot agent and register chat participant
     */
    private initializeCopilotAgent(): void {
        try {
            // Register as a Copilot chat participant
            this.chatParticipant = vscode.chat.createChatParticipant(
                'dotnet-package-upgrader',
                this.handleChatRequest.bind(this)
            );

            this.chatParticipant.iconPath = vscode.Uri.file('icon.png');
            this.chatParticipant.followupProvider = {
                provideFollowups: this.provideFollowups.bind(this)
            };

            this.logger.info('Copilot agent initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Copilot agent', error);
        }
    }

    /**
     * Handle chat requests from Copilot
     */
    private async handleChatRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        try {
            stream.progress('Analyzing package dependencies...');
            
            const prompt = request.prompt;
            const analysis = await this.analyzeWithLanguageModel(prompt, token);
            
            stream.markdown(analysis);
            
            return { metadata: { command: 'packageUpgrade' } };
        } catch (error) {
            this.logger.error('Chat request failed', error);
            stream.markdown('I encountered an error while analyzing the packages. Please try again.');
            return { metadata: { command: '', error: error } };
        }
    }

    /**
     * Use VS Code's language model API to get Copilot responses with fallback
     */
    private async analyzeWithLanguageModel(
        prompt: string, 
        token: vscode.CancellationToken
    ): Promise<string> {
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
        } catch (error) {
            this.logger.error('Language model request failed', error);
            
            // **FALLBACK: Return a structured fallback response**
            return this.generateFallbackResponse(prompt);
        }
    }

    /**
     * Generate a fallback response when Copilot is not available
     */
    private generateFallbackResponse(prompt: string): string {
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
    private selectHighestVersion(versions: string[]): string {
        if (versions.length === 0) return 'latest';
        if (versions.length === 1) return versions[0];
        
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
    async analyzeVersionConflict(
        packageName: string,
        currentVersions: string[],
        projectPaths: string[],
        dependencies: Map<string, string>[]
    ): Promise<any> {
        try {
            const prompt = this.buildVersionConflictPrompt(
                packageName, 
                currentVersions, 
                projectPaths, 
                dependencies
            );

            const token = new vscode.CancellationTokenSource().token;
            const analysis = await this.analyzeWithLanguageModel(prompt, token);
            
            return this.parseVersionConflictResponse(analysis);
        } catch (error) {
            this.logger.error('Version conflict analysis failed', error);
            throw error;
        }
    }

    /**
     * Build a comprehensive prompt for version conflict analysis
     */
    private buildVersionConflictPrompt(
        packageName: string,
        currentVersions: string[],
        projectPaths: string[],
        dependencies: Map<string, string>[]
    ): string {
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
    private parseVersionConflictResponse(response: string): any {
        try {
            // Extract JSON from response (in case it's wrapped in markdown)
            const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : response;
            
            return JSON.parse(jsonString);
        } catch (error) {
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
    async getPackageUpdateSuggestions(
        packageName: string,
        currentVersion: string
    ): Promise<PackageUpdateSuggestion[]> {
        try {
            this.logger.info('Requesting package update suggestions from Copilot', {
                packageName,
                currentVersion
            });

            const prompt = this.generateUpdateSuggestionsPrompt(packageName, currentVersion);
            const token = new vscode.CancellationTokenSource().token;
            const response = await this.analyzeWithLanguageModel(prompt, token);
            
            return this.parseUpdateSuggestions(response);
        } catch (error) {
            this.logger.error('Failed to get package update suggestions', error);
            throw error;
        }
    }

    /**
     * Generate prompt for package update suggestions
     */
    private generateUpdateSuggestionsPrompt(packageName: string, currentVersion: string): string {
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
    private parseUpdateSuggestions(response: string): PackageUpdateSuggestion[] {
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
        } catch (error) {
            this.logger.error('Failed to parse update suggestions', error);
            return [];
        }
    }

    /**
     * Provide follow-up suggestions
     */
    private async provideFollowups(
        result: vscode.ChatResult,
        context: vscode.ChatContext,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatFollowup[]> {
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
    async setAgentContext(context: CopilotAgentContext): Promise<void> {
        this.agentContext = context;
        this.logger.info('Set Copilot agent context', { context });
    }

    /**
     * Dispose of the chat participant
     */
    dispose(): void {
        this.chatParticipant?.dispose();
    }
} 