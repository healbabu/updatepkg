import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { PackageUpdate } from './packageUpgrader';
import { VersionConflictAnalysis } from './versionConflictAnalyzer';

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

            // Get available language models - DON'T restrict by family
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
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

            // Send request to Copilot with justification
            const response = await model.sendRequest(messages, {
                justification: 'Analyzing .NET package dependencies and version conflicts'
            }, token);

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

    /**
     * 🤖 AI-powered version conflict analysis (completely generic)
     */
    public async analyzeAdvancedConflicts(
        dependencyContext: any,
        proposedUpdates: PackageUpdate[]
    ): Promise<any[]> {
        try {
            this.logger.info('🤖 AI analyzing advanced version conflicts');
            
            const prompt = this.buildAdvancedConflictPrompt(dependencyContext, proposedUpdates);
            
            const response = await this.analyzeWithLanguageModel(
                prompt, 
                new vscode.CancellationTokenSource().token
            );
            
            return this.parseSimpleConflictResponse(response);
            
        } catch (error) {
            this.logger.error('Advanced conflict analysis failed', error);
            return [];
        }
    }

    private buildAdvancedConflictPrompt(context: any, updates: PackageUpdate[]): string {
        return `You are a .NET package dependency expert. Analyze these updates for conflicts:

Projects: ${context.projects?.length || 0}
Updates: ${updates.map(u => `${u.packageName}: ${u.currentVersion} → ${u.recommendedVersion}`).join(', ')}

Identify critical version conflicts and return as simple JSON array:
[{"package": "name", "conflict": "description", "solution": "fix"}]`;
    }

    private parseSimpleConflictResponse(response: string): any[] {
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            this.logger.warn('Failed to parse conflict response', error);
        }
        return [];
    }

    // ✅ ADD: AI-powered conflict resolution recommendations
    public async generateConflictResolution(
        conflictDetails: any,
        projectContext: any
    ): Promise<string[]> {
        try {
            this.logger.info('🤖 AI generating conflict resolution recommendations');
            
            const prompt = this.buildConflictResolutionPrompt(conflictDetails, projectContext);
            
            const response = await this.analyzeWithLanguageModel(
                prompt, 
                new vscode.CancellationTokenSource().token
            );
            
            const recommendations = this.parseAIRecommendations(response);
            
            this.logger.info('🤖 AI conflict resolution completed', { 
                recommendationCount: recommendations.length 
            });
            
            return recommendations;
            
        } catch (error) {
            this.logger.error('AI conflict resolution failed', error);
            // Fallback to basic recommendations
            return [
                'Review dependency conflicts manually',
                'Consider updating package versions to resolve conflicts',
                'Run dotnet restore --verbosity detailed for more information'
            ];
        }
    }

    /**
     * 📝 Build intelligent prompt for conflict resolution
     */
    private buildConflictResolutionPrompt(conflictDetails: any, projectContext: any): string {
        return `You are an expert .NET package dependency resolver. Analyze this version conflict and provide specific, actionable solutions.

## CONFLICT DETAILS:
**Conflicting Package:** ${conflictDetails.conflictingPackage}
**Required Versions:** ${conflictDetails.requiredVersions?.join(', ') || 'Multiple versions'}

## DEPENDENCY CHAINS:
${conflictDetails.dependencyChains?.map((chain: string) => `- ${chain}`).join('\n') || 'No chains provided'}

## PROJECT CONTEXT:
**Solution Path:** ${projectContext.solutionPath || 'Unknown'}
**Target Framework:** ${projectContext.targetFramework || 'Unknown'}
**Package Count:** ${projectContext.packageCount || 'Unknown'}

## ANALYSIS REQUIRED:
1. **Root Cause**: Why is this conflict occurring?
2. **Impact Assessment**: Which projects/packages are affected?
3. **Resolution Strategy**: What's the best approach to fix this?
4. **Risk Analysis**: What are the potential side effects?

## PROVIDE SOLUTIONS:
Generate 3-5 specific, actionable recommendations ordered by preference:
1. **Immediate Fix**: Quick resolution with minimal impact
2. **Comprehensive Fix**: Best long-term solution
3. **Alternative Approaches**: If primary solutions don't work

For each recommendation:
- Provide exact commands to run
- Explain why this approach works
- Mention any potential risks or side effects
- Include verification steps

Return as JSON array:
\`\`\`json
[
  {
    "priority": 1,
    "type": "immediate",
    "title": "Add Explicit Package Reference",
    "description": "Clear explanation of why this works",
    "commands": ["dotnet add package X --version Y"],
    "reasoning": "Why this is the best approach",
    "risks": ["potential side effects"],
    "verification": ["how to verify it worked"]
  }
]
\`\`\`

Focus on the specific packages mentioned and provide commands that will actually work for this exact scenario.`;
    }

    /**
     * 🔍 Parse AI recommendations from response
     */
    private parseAIRecommendations(response: string): string[] {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
            if (!jsonMatch) {
                // Fallback: extract bullet points or numbered lists
                const lines = response.split('\n').filter(line => 
                    line.trim().match(/^[-*]\s+/) || line.trim().match(/^\d+\.\s+/)
                );
                return lines.map(line => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
            }

            const recommendations = JSON.parse(jsonMatch[1]);
            
            // Convert structured recommendations to display format
            return recommendations.map((rec: any, index: number) => {
                let formatted = `${rec.title || `Solution ${index + 1}`}`;
                
                if (rec.commands && rec.commands.length > 0) {
                    formatted += `\n   Command: ${rec.commands[0]}`;
                }
                
                if (rec.reasoning) {
                    formatted += `\n   Why: ${rec.reasoning}`;
                }
                
                if (rec.risks && rec.risks.length > 0) {
                    formatted += `\n   ⚠️ Note: ${rec.risks[0]}`;
                }
                
                return formatted;
            });
            
        } catch (error) {
            this.logger.warn('Failed to parse AI recommendations', error);
            
            // Simple fallback parsing
            const sentences = response.split('.').filter(s => s.trim().length > 10);
            return sentences.slice(0, 3).map(s => s.trim());
        }
    }

    // ✅ ENHANCED: Generic AI error analysis for ANY dotnet error
    public async analyzeAnyDotnetError(
        errorOutput: string,
        commandContext: {
            command: string;
            projectPath?: string;
            solutionPath?: string;
            packageName?: string;
            version?: string;
        }
    ): Promise<{
        errorType: string;
        severity: 'critical' | 'warning' | 'info';
        summary: string;
        rootCause: string;
        recommendations: string[];
        quickFix?: string;
    }> {
        try {
            this.logger.info('🤖 AI analyzing dotnet error');
            
            const prompt = this.buildGenericErrorAnalysisPrompt(errorOutput, commandContext);
            
            const response = await this.analyzeWithLanguageModel(
                prompt, 
                new vscode.CancellationTokenSource().token
            );
            
            const analysis = this.parseGenericErrorAnalysis(response);
            
            this.logger.info('🤖 AI error analysis completed', { 
                errorType: analysis.errorType,
                severity: analysis.severity,
                recommendationCount: analysis.recommendations.length 
            });
            
            return analysis;
            
        } catch (error) {
            this.logger.error('AI error analysis failed', error);
            return this.getFallbackErrorAnalysis(errorOutput);
        }
    }

    /**
     * 📝 Build comprehensive error analysis prompt
     */
    private buildGenericErrorAnalysisPrompt(errorOutput: string, context: any): string {
        return `You are an expert .NET developer and troubleshooter. Analyze this dotnet command error and provide comprehensive guidance.

## COMMAND CONTEXT:
**Command:** ${context.command}
**Project:** ${context.projectPath || 'Not specified'}
**Solution:** ${context.solutionPath || 'Not specified'}
**Package:** ${context.packageName || 'Not specified'}
**Version:** ${context.version || 'Not specified'}

## ERROR OUTPUT:
\`\`\`
${errorOutput}
\`\`\`

## ANALYSIS REQUIRED:
1. **Error Classification**: What type of error is this? (version conflict, network, authentication, build, restore, etc.)
2. **Severity Assessment**: How critical is this error?
3. **Root Cause Analysis**: Why did this error occur?
4. **Impact Assessment**: What does this mean for the project/solution?
5. **Solution Strategy**: How can this be resolved?

## PROVIDE COMPREHENSIVE ANALYSIS:
- **Error Type**: Classify the error (e.g., "Package Version Conflict", "Network Connectivity", "Build Failure", etc.)
- **Severity**: critical/warning/info
- **Summary**: Brief explanation of what went wrong
- **Root Cause**: Why this happened
- **Recommendations**: 3-5 specific, actionable solutions ordered by effectiveness
- **Quick Fix**: One-liner command/action if applicable

Focus on:
- Exact commands to run
- Configuration changes needed
- Alternative approaches
- Prevention strategies
- Verification steps

Return as JSON:
\`\`\`json
{
  "errorType": "specific error classification",
  "severity": "critical|warning|info",
  "summary": "brief explanation",
  "rootCause": "why this happened",
  "recommendations": [
    "specific actionable solution 1",
    "specific actionable solution 2",
    "specific actionable solution 3"
  ],
  "quickFix": "one-liner solution if applicable"
}
\`\`\`

Analyze ALL error codes (NU1107, NU1102, NU1605, NU1608, MSB errors, etc.) and provide solutions specific to the exact error shown.`;
    }

    /**
     * 🔍 Parse generic AI error analysis
     */
    private parseGenericErrorAnalysis(response: string): any {
        try {
            const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
            if (!jsonMatch) {
                return this.parseUnstructuredErrorResponse(response);
            }

            const analysis = JSON.parse(jsonMatch[1]);
            
            // Validate required fields
            return {
                errorType: analysis.errorType || 'Unknown Error',
                severity: analysis.severity || 'warning',
                summary: analysis.summary || 'Error occurred during dotnet operation',
                rootCause: analysis.rootCause || 'Unable to determine root cause',
                recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
                quickFix: analysis.quickFix || undefined
            };
            
        } catch (error) {
            this.logger.warn('Failed to parse AI error analysis', error);
            return this.parseUnstructuredErrorResponse(response);
        }
    }

    /**
     * 📄 Parse unstructured AI response
     */
    private parseUnstructuredErrorResponse(response: string): any {
        // Extract key information from unstructured text
        const lines = response.split('\n').filter(line => line.trim().length > 0);
        
        let errorType = 'Unknown Error';
        let summary = 'Error occurred during dotnet operation';
        let recommendations: string[] = [];
        
        // Look for error type indicators
        if (response.toLowerCase().includes('version conflict')) {
            errorType = 'Package Version Conflict';
        } else if (response.toLowerCase().includes('network') || response.toLowerCase().includes('connectivity')) {
            errorType = 'Network Connectivity Issue';
        } else if (response.toLowerCase().includes('not found') || response.toLowerCase().includes('nu1102')) {
            errorType = 'Package Not Found';
        } else if (response.toLowerCase().includes('build') || response.toLowerCase().includes('compilation')) {
            errorType = 'Build Failure';
        } else if (response.toLowerCase().includes('restore')) {
            errorType = 'Package Restore Failure';
        }
        
        // Extract recommendations from bullet points or numbered lists
        const recommendationLines = lines.filter(line => 
            line.match(/^[-*]\s+/) || 
            line.match(/^\d+\.\s+/) ||
            line.toLowerCase().includes('recommend') ||
            line.toLowerCase().includes('solution') ||
            line.toLowerCase().includes('try')
        );
        
        recommendations = recommendationLines
            .map(line => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
            .filter(line => line.length > 10)
            .slice(0, 5);
        
        return {
            errorType,
            severity: 'warning',
            summary,
            rootCause: 'AI analysis could not be parsed properly',
            recommendations: recommendations.length > 0 ? recommendations : [
                'Review the error output carefully',
                'Try running the command with --verbosity detailed',
                'Check your internet connection and package sources'
            ]
        };
    }

    /**
     * 🔄 Fallback error analysis when AI fails
     */
    private getFallbackErrorAnalysis(errorOutput: string): any {
        // Basic pattern matching for common errors
        const output = errorOutput.toLowerCase();
        
        if (output.includes('nu1107')) {
            return {
                errorType: 'Package Version Conflict',
                severity: 'critical',
                summary: 'Version conflict between package dependencies',
                rootCause: 'Multiple packages require different versions of the same dependency',
                recommendations: [
                    'Add explicit package reference to resolve conflict',
                    'Update related packages to compatible versions',
                    'Review project dependencies for version alignment'
                ]
            };
        } else if (output.includes('nu1102')) {
            return {
                errorType: 'Package Not Found',
                severity: 'critical',
                summary: 'Package could not be found in configured sources',
                rootCause: 'Package name/version incorrect or network/authentication issue',
                recommendations: [
                    'Verify package name and version are correct',
                    'Check internet connectivity',
                    'Review NuGet package sources configuration'
                ]
            };
        } else if (output.includes('nu1605')) {
            return {
                errorType: 'Package Downgrade Detected',
                severity: 'warning',
                summary: 'Attempting to downgrade to a lower package version',
                rootCause: 'Higher version of package already referenced',
                recommendations: [
                    'Remove existing package reference first',
                    'Install desired version explicitly',
                    'Check if higher version is required by other dependencies'
                ]
            };
        } else {
            return {
                errorType: 'Unknown Error',
                severity: 'warning',
                summary: 'Dotnet operation failed',
                rootCause: 'Unable to classify error automatically',
                recommendations: [
                    'Review error output carefully',
                    'Run command with --verbosity detailed for more information',
                    'Check project file syntax and package sources'
                ]
            };
        }
    }

    /**
     * 🤖 AI-powered package family analysis using Language Model Tools
     */
    public async analyzePackageFamilies(
        packageNames: string[]
    ): Promise<string> {
        try {
            this.logger.info('🤖 Starting AI package family analysis', {
                packageCount: packageNames.length
            });

            // Try Language Model API with proper error handling
            const result = await this.tryLanguageModelAnalysis(packageNames);
            if (result) {
                this.logger.info('🤖 Package family analysis completed successfully via Language Model');
                return result;
            }

            // Try Chat Participant approach
            const chatResult = await this.tryChatParticipantAnalysis(packageNames);
            if (chatResult) {
                this.logger.info('🤖 Package family analysis completed successfully via Chat Participant');
                return chatResult;
            }

            // Fallback to pattern-based analysis
            this.logger.warn('🤖 All AI methods failed, using pattern-based fallback');
            return this.generateFallbackPackageFamilyResponse(packageNames);
            
        } catch (error) {
            this.logger.error('🤖 Package family analysis failed completely', error);
            return this.generateFallbackPackageFamilyResponse(packageNames);
        }
    }

    /**
     * 🎯 Try Language Model API approach
     */
    private async tryLanguageModelAnalysis(packageNames: string[]): Promise<string | null> {
        try {
            // Check if language model API is available
            if (!vscode.lm) {
                this.logger.info('Language Model API not available');
                return null;
            }

            // Get available language models with more flexible selection
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
            });

            if (models.length === 0) {
                this.logger.info('No Copilot language models available');
                return null;
            }

            const model = models[0];
            this.logger.info('🤖 Using Copilot model', { 
                modelId: model.id, 
                vendor: model.vendor,
                family: model.family,
                maxInputTokens: model.maxInputTokens
            });

            const prompt = this.buildPackageFamilyAnalysisPrompt(packageNames);
            const token = new vscode.CancellationTokenSource().token;

            // Create chat messages
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            // Send request with proper options
            const response = await model.sendRequest(messages, {
                justification: 'Analyzing .NET package dependencies for intelligent family grouping'
            }, token);

            // Collect response
            let result = '';
            for await (const fragment of response.text) {
                result += fragment;
            }

            return result;

        } catch (error) {
            this.logger.warn('Language Model API failed', error);
            return null;
        }
    }

    /**
     * 💬 Try Chat Participant approach as fallback
     */
    private async tryChatParticipantAnalysis(packageNames: string[]): Promise<string | null> {
        try {
            if (!this.chatParticipant) {
                this.logger.info('Chat participant not available');
                return null;
            }

            // Use chat participant for analysis
            // This is a simplified approach - in practice you'd integrate with chat context
            const prompt = `Analyze these .NET packages for family grouping: ${packageNames.join(', ')}`;
            
            // Note: This is a simplified implementation
            // In practice, you'd need to integrate with the chat system more carefully
            this.logger.info('Chat participant analysis would be implemented here');
            
            return null; // For now, return null to fall back to pattern analysis

        } catch (error) {
            this.logger.warn('Chat participant analysis failed', error);
            return null;
        }
    }

    /**
     * 📝 Build specialized prompt for package family analysis
     */
    private buildPackageFamilyAnalysisPrompt(packageNames: string[]): string {
        return `You are an expert .NET package dependency analyzer. Group these ${packageNames.length} packages into logical families that should be updated together.

## PACKAGE LIST:
${packageNames.map(name => `- ${name}`).join('\n')}

## ANALYSIS CRITERIA:
1. **Technical Relationship**: Same vendor, shared dependencies, or architectural patterns
2. **Compatibility Risk**: Packages that have version interdependencies
3. **Functional Grouping**: Similar functionality or domain (testing, logging, web, data, etc.)
4. **Update Safety**: Packages that are safer to update as a group

## FAMILY DETECTION RULES:
- **Minimum Size**: At least 2 packages per family
- **Logical Coherence**: Clear reason why packages belong together
- **Update Strategy**: Consider compatibility when updated together
- **Vendor Grouping**: Same company/organization packages often work better together

## EXAMPLES OF GOOD FAMILIES:
- "Microsoft.Extensions.*" → Microsoft Extensions Family
- "AWSSDK.*" → AWS SDK Family  
- "NUnit*", "coverlet*" → Testing Framework Family
- "Serilog*" → Logging Family
- "Swashbuckle*" → API Documentation Family

## OUTPUT FORMAT:
Return ONLY a JSON array with this exact structure:

\`\`\`json
[
  {
    "name": "AWS SDK Family",
    "packages": ["AWSSDK.Core", "AWSSDK.S3", "AWSSDK.DynamoDBv2"],
    "reasoning": "All AWS SDK packages share core dependencies and should maintain version compatibility",
    "confidence": 0.9,
    "updateStrategy": "together",
    "characteristics": {
      "vendor": "Amazon",
      "category": "cloud-services",
      "sharedCore": "AWSSDK.Core"
    }
  },
  {
    "name": "Microsoft Extensions Family", 
    "packages": ["Microsoft.Extensions.Configuration", "Microsoft.Extensions.Logging"],
    "reasoning": "Core Microsoft extension packages designed to work together",
    "confidence": 0.85,
    "updateStrategy": "together",
    "characteristics": {
      "vendor": "Microsoft",
      "category": "framework-extensions"
    }
  }
]
\`\`\`

## IMPORTANT:
- Only return the JSON array, no other text
- Each family must have at least 2 packages
- Focus on meaningful relationships, not just naming patterns
- Confidence should be 0.0-1.0 based on strength of relationship
- Provide clear reasoning for each grouping`;
    }

    /**
     * 🔄 Generate fallback response for package family analysis when AI is unavailable
     */
    private generateFallbackPackageFamilyResponse(packageNames: string[]): string {
        this.logger.info('🔄 Using fallback package family analysis');
        
        // Basic pattern-based grouping as fallback
        const families: any[] = [];
        const processed = new Set<string>();

        // Simple prefix-based grouping
        const prefixGroups = new Map<string, string[]>();
        
        for (const packageName of packageNames) {
            if (processed.has(packageName)) continue;
            
            const parts = packageName.split('.');
            if (parts.length >= 2) {
                const prefix = parts.slice(0, 2).join('.');
                
                if (!prefixGroups.has(prefix)) {
                    prefixGroups.set(prefix, []);
                }
                prefixGroups.get(prefix)!.push(packageName);
            }
        }

        // Convert to families format
        for (const [prefix, packages] of prefixGroups) {
            if (packages.length >= 2) {
                families.push({
                    name: `${prefix} Family`,
                    packages: packages,
                    reasoning: `Basic fallback grouping based on common prefix: ${prefix}`,
                    confidence: 0.6,
                    updateStrategy: "together",
                    characteristics: {
                        vendor: "Unknown",
                        category: "prefix-based",
                        prefix: prefix
                    }
                });
                
                packages.forEach(pkg => processed.add(pkg));
            }
        }

        return JSON.stringify(families);
    }

    /**
     * 🔍 Diagnose Copilot availability and configuration
     */
    public async diagnoseCopilotAvailability(): Promise<{
        languageModelAvailable: boolean;
        chatParticipantAvailable: boolean;
        availableModels: any[];
        recommendations: string[];
        debugInfo: any;
    }> {
        const diagnosis = {
            languageModelAvailable: false,
            chatParticipantAvailable: false,
            availableModels: [] as any[],
            recommendations: [] as string[],
            debugInfo: {}
        };

        try {
            this.logger.info('🔍 Starting Copilot diagnosis...');

            // Check Language Model API
            if (vscode.lm) {
                diagnosis.languageModelAvailable = true;
                this.logger.info('✅ Language Model API is available');
                
                try {
                    // 1. Check ALL available models first
                    const allModels = await vscode.lm.selectChatModels();
                    this.logger.info(`🔍 Total models found: ${allModels.length}`);
                    
                    (diagnosis.debugInfo as any)['allModels'] = allModels.map(m => ({
                        id: m.id,
                        vendor: m.vendor,
                        family: m.family
                    }));

                    // 2. Log each model for debugging
                    for (const model of allModels) {
                        this.logger.info(`📋 Available: ${model.vendor}/${model.family} (${model.id})`);
                    }

                    // 3. Check specifically for Copilot models
                    const copilotModels = await vscode.lm.selectChatModels({
                        vendor: 'copilot'
                    });
                    
                    this.logger.info(`🤖 Copilot models found: ${copilotModels.length}`);
                    
                    diagnosis.availableModels = copilotModels.map(m => ({
                        id: m.id,
                        vendor: m.vendor,
                        family: m.family,
                        maxInputTokens: m.maxInputTokens
                    }));

                    if (copilotModels.length === 0) {
                        if (allModels.length === 0) {
                            diagnosis.recommendations.push('❌ No language models available at all');
                            diagnosis.recommendations.push('  → Check VSCode version (need 1.90+)');
                        } else {
                            diagnosis.recommendations.push('❌ No Copilot models found, but other models available:');
                            for (const model of allModels) {
                                diagnosis.recommendations.push(`  → ${model.vendor}/${model.family}`);
                            }
                            diagnosis.recommendations.push('  → Ensure GitHub Copilot is signed in and active');
                        }
                    } else {
                        this.logger.info('✅ Copilot models available!');
                        for (const model of copilotModels) {
                            this.logger.info(`✅ Ready: ${model.family} (${model.id})`);
                        }
                    }
                    
                } catch (error) {
                    diagnosis.recommendations.push(`Model selection failed: ${error instanceof Error ? error.message : String(error)}`);
                    this.logger.error('Model selection error details', error);
                }
            } else {
                diagnosis.recommendations.push('❌ Language Model API not available');
                diagnosis.recommendations.push('  → Update VSCode to 1.90+');
            }

            // Check Chat Participant
            if (this.chatParticipant) {
                diagnosis.chatParticipantAvailable = true;
                this.logger.info('✅ Chat participant is available');
            } else {
                diagnosis.recommendations.push('⚠️ Chat participant not initialized');
            }

        } catch (error) {
            diagnosis.recommendations.push(`Diagnosis failed: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.error('Copilot diagnosis error', error);
        }

        this.logger.info('🔍 Copilot diagnosis completed', {
            languageModelAvailable: diagnosis.languageModelAvailable,
            modelsFound: diagnosis.availableModels.length,
            recommendations: diagnosis.recommendations.length
        });

        return diagnosis;
    }
} 