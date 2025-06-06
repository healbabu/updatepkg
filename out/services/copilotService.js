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
            this.logger.info('🎯 Starting AI upgrade strategy generation...');
            const updates = updateSummary.updates || [];
            this.logger.info(`📦 Processing ${updates.length} packages for upgrade strategy`, {
                packages: updates.map((u) => `${u.packageName} (${u.currentVersion} → ${u.recommendedVersion})`),
                hasDependencyInfo: !!dependencyInfo
            });
            const prompt = this.buildUpgradeStrategyPrompt(updateSummary, dependencyInfo);
            // Try to use VS Code's language model API
            const aiResponse = await this.tryLanguageModelAnalysis(prompt, 'Package Upgrade Strategy');
            if (aiResponse) {
                this.logger.info('✅ AI upgrade strategy generated successfully');
                return aiResponse;
            }
            // Fallback to simple strategy
            this.logger.warn('⚠️ AI unavailable, using fallback upgrade strategy');
            return this.generateFallbackUpgradeStrategy(updateSummary);
        }
        catch (error) {
            this.logger.error('❌ AI upgrade strategy generation failed, using fallback', error);
            return this.generateFallbackUpgradeStrategy(updateSummary);
        }
    }
    /**
     * Try to use VS Code's language model API with enhanced logging
     */
    async tryLanguageModelAnalysis(prompt, context) {
        const startTime = Date.now();
        const contextLabel = context || 'AI Analysis';
        try {
            this.logger.info(`🤖 Starting ${contextLabel}...`);
            if (!vscode.lm) {
                this.logger.warn('❌ Language Model API not available - vscode.lm is undefined');
                this.logger.info('💡 Recommendation: Ensure VS Code version supports Language Model API (1.85+)');
                return null;
            }
            this.logger.info('🔍 Querying available Copilot models...');
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
            });
            this.logger.info(`📋 Found ${models.length} available Copilot model(s)`, {
                modelCount: models.length,
                modelIds: models.map(m => m.id)
            });
            if (models.length === 0) {
                this.logger.warn('❌ No Copilot language models available');
                this.logger.info('💡 Recommendations:');
                this.logger.info('   - Install GitHub Copilot extension');
                this.logger.info('   - Sign in to GitHub Copilot');
                this.logger.info('   - Ensure Copilot subscription is active');
                return null;
            }
            // Select best model (for now, use first available)
            const model = models[0];
            const modelInfo = {
                id: model.id,
                vendor: model.vendor,
                family: model.family,
                version: model.version,
                maxInputTokens: model.maxInputTokens,
                countTokens: !!model.countTokens
            };
            this.logger.info(`🚀 Selected Copilot model: ${model.id}`, modelInfo);
            this.logger.info(`📏 Model capabilities: Max input tokens: ${model.maxInputTokens}, Token counting: ${!!model.countTokens}`);
            // Log prompt details
            const promptLength = prompt.length;
            const promptLines = prompt.split('\n').length;
            this.logger.info(`📝 Sending prompt to AI model:`, {
                promptLength,
                promptLines,
                context: contextLabel
            });
            // Log the actual prompt (truncated if too long)
            if (promptLength <= 1000) {
                this.logger.info(`📋 Full prompt:\n${prompt}`);
            }
            else {
                this.logger.info(`📋 Prompt preview (first 500 chars):\n${prompt.substring(0, 500)}...`);
                this.logger.info(`📋 Prompt preview (last 500 chars):\n...${prompt.substring(promptLength - 500)}`);
            }
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            this.logger.info(`⏳ Sending request to model ${model.id}...`);
            const response = await model.sendRequest(messages, {
                justification: `Generating .NET package upgrade strategy - ${contextLabel}`
            });
            this.logger.info('📥 Receiving response from AI model...');
            let result = '';
            let fragmentCount = 0;
            for await (const fragment of response.text) {
                result += fragment;
                fragmentCount++;
            }
            const endTime = Date.now();
            const duration = endTime - startTime;
            this.logger.info(`✅ AI analysis completed successfully`, {
                context: contextLabel,
                modelId: model.id,
                duration: `${duration}ms`,
                responseLength: result.length,
                fragmentCount,
                responsePreview: result.length > 200 ? `${result.substring(0, 200)}...` : result
            });
            // Log the full response if it's reasonably sized
            if (result.length <= 2000) {
                this.logger.info(`📋 Full AI response:\n${result}`);
            }
            else {
                this.logger.info(`📋 AI response preview (first 1000 chars):\n${result.substring(0, 1000)}...`);
                this.logger.info(`📋 AI response preview (last 500 chars):\n...${result.substring(result.length - 500)}`);
            }
            return result;
        }
        catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            this.logger.error(`❌ Language model analysis failed for ${contextLabel}`, {
                duration: `${duration}ms`,
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
            if (error instanceof Error) {
                if (error.message.includes('quota')) {
                    this.logger.warn('💰 Possible quota/rate limit issue detected');
                }
                else if (error.message.includes('authentication')) {
                    this.logger.warn('🔐 Authentication issue detected - check Copilot login');
                }
                else if (error.message.includes('network')) {
                    this.logger.warn('🌐 Network connectivity issue detected');
                }
            }
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
        this.logger.info('🔄 Generating fallback upgrade strategy...');
        const updates = updateSummary.updates || [];
        // Simple strategy: Microsoft packages first, then others alphabetically
        const microsoftPackages = updates.filter((u) => u.packageName.startsWith('Microsoft.'));
        const otherPackages = updates.filter((u) => !u.packageName.startsWith('Microsoft.'));
        const orderedPackages = [...microsoftPackages, ...otherPackages];
        this.logger.info('📊 Fallback strategy analysis', {
            totalPackages: updates.length,
            microsoftPackages: microsoftPackages.length,
            otherPackages: otherPackages.length,
            strategy: 'Microsoft-First Sequential'
        });
        const strategy = JSON.stringify({
            name: "Microsoft-First Sequential Strategy",
            description: `Upgrade ${microsoftPackages.length} Microsoft packages first, then ${otherPackages.length} other packages`,
            packages: orderedPackages,
            aiReasoning: "AI unavailable - using fallback strategy that prioritizes Microsoft framework packages first to ensure compatibility, followed by other packages alphabetically"
        }, null, 2);
        this.logger.info('✅ Fallback upgrade strategy generated successfully');
        return strategy;
    }
    /**
     * Diagnose Copilot availability for logging
     */
    async diagnoseCopilotAvailability() {
        try {
            this.logger.info('🔍 Diagnosing Copilot availability...');
            const languageModelAvailable = !!vscode.lm;
            this.logger.info(`📊 Language Model API Available: ${languageModelAvailable}`);
            let availableModels = [];
            let recommendations = [];
            if (languageModelAvailable) {
                try {
                    this.logger.info('🔍 Querying available Copilot models...');
                    availableModels = await vscode.lm.selectChatModels({
                        vendor: 'copilot'
                    });
                    this.logger.info(`📋 Found ${availableModels.length} available models`, {
                        models: availableModels.map(m => ({
                            id: m.id,
                            vendor: m.vendor,
                            family: m.family,
                            version: m.version,
                            maxInputTokens: m.maxInputTokens
                        }))
                    });
                }
                catch (error) {
                    this.logger.error('❌ Failed to get available models', {
                        error: error instanceof Error ? {
                            name: error.name,
                            message: error.message
                        } : error
                    });
                }
            }
            else {
                this.logger.warn('⚠️ Language Model API not available - vscode.lm is undefined');
            }
            if (availableModels.length === 0) {
                this.logger.warn('⚠️ No Copilot models available, generating recommendations...');
                recommendations.push('Install GitHub Copilot extension');
                recommendations.push('Sign in to GitHub Copilot');
                recommendations.push('Ensure Copilot subscription is active');
                recommendations.push('Restart VS Code after installing Copilot');
                recommendations.push('Check internet connectivity');
            }
            else {
                this.logger.info('✅ Copilot is properly configured and available');
            }
            const result = {
                languageModelAvailable,
                availableModels,
                recommendations
            };
            this.logger.info('🏁 Copilot diagnosis completed', {
                available: languageModelAvailable,
                modelCount: availableModels.length,
                hasRecommendations: recommendations.length > 0
            });
            return result;
        }
        catch (error) {
            this.logger.error('❌ Copilot availability diagnosis failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
            return {
                languageModelAvailable: false,
                availableModels: [],
                recommendations: ['Install GitHub Copilot extension', 'Check VS Code version compatibility']
            };
        }
    }
    /**
     * Analyze restore errors and provide AI recommendations
     */
    async analyzeRestoreErrors(errors, fullOutput) {
        try {
            this.logger.info('🔧 Starting AI restore error analysis...');
            this.logger.info(`📊 Analyzing ${errors.length} restore errors`, {
                errorCodes: errors.map((e) => e.code).filter(Boolean),
                projects: [...new Set(errors.map((e) => e.projectPath).filter(Boolean))],
                outputLength: fullOutput.length
            });
            const prompt = this.buildRestoreErrorAnalysisPrompt(errors, fullOutput);
            // Try to use VS Code's language model API
            const aiResponse = await this.tryLanguageModelAnalysis(prompt, 'Restore Error Analysis');
            if (aiResponse) {
                this.logger.info('✅ AI restore error analysis completed successfully');
                return this.parseRestoreErrorAnalysis(aiResponse);
            }
            // Fallback to simple analysis
            this.logger.warn('⚠️ AI unavailable, using fallback error analysis');
            return this.generateFallbackRestoreErrorAnalysis(errors);
        }
        catch (error) {
            this.logger.error('❌ AI restore error analysis failed, using fallback', error);
            return this.generateFallbackRestoreErrorAnalysis(errors);
        }
    }
    /**
     * Build prompt for restore error analysis
     */
    buildRestoreErrorAnalysisPrompt(errors, fullOutput) {
        return `You are a .NET package restore expert. Analyze these restore errors and provide actionable recommendations.

RESTORE ERRORS:
${errors.map((e) => `- ${e.code}: ${e.message} (${e.projectPath || 'Unknown Project'})`).join('\n')}

FULL RESTORE OUTPUT:
${fullOutput.length > 2000 ? fullOutput.substring(0, 2000) + '...' : fullOutput}

Please analyze these errors and provide:
1. Severity assessment (low, medium, high, critical)
2. AI recommendations for resolving the issues
3. Specific action items for developers
4. Whether the project can proceed despite these issues

Respond with ONLY a JSON object in this exact format:
{
  "severity": "low|medium|high|critical",
  "canProceed": true|false,
  "aiRecommendations": [
    "AI-powered recommendation 1",
    "AI-powered recommendation 2"
  ],
  "actionItems": [
    "Specific action item 1",
    "Specific action item 2"
  ]
}

CRITICAL: Return ONLY the JSON object, no markdown formatting or additional text.`;
    }
    /**
     * Parse AI response for restore error analysis
     */
    parseRestoreErrorAnalysis(aiResponse) {
        try {
            this.logger.info('🔍 Parsing AI restore error analysis response...');
            const parsed = JSON.parse(aiResponse);
            const result = {
                severity: parsed.severity || 'medium',
                canProceed: parsed.canProceed !== false,
                aiRecommendations: parsed.aiRecommendations || [],
                actionItems: parsed.actionItems || []
            };
            this.logger.info('✅ Successfully parsed AI response', {
                severity: result.severity,
                canProceed: result.canProceed,
                recommendationCount: result.aiRecommendations.length,
                actionItemCount: result.actionItems.length,
                recommendations: result.aiRecommendations,
                actionItems: result.actionItems
            });
            return result;
        }
        catch (error) {
            this.logger.error('❌ Failed to parse AI restore error analysis response', {
                error: error instanceof Error ? error.message : String(error),
                responseLength: aiResponse.length,
                responsePreview: aiResponse.substring(0, 500)
            });
            this.logger.warn('⚠️ Using fallback analysis due to parsing failure');
            return this.generateFallbackRestoreErrorAnalysis([]);
        }
    }
    /**
     * Generate fallback restore error analysis when AI is unavailable
     */
    generateFallbackRestoreErrorAnalysis(errors) {
        const errorCount = errors.filter((e) => e.type === 'error').length;
        const versionConflicts = errors.filter((e) => e.code === 'NU1107').length;
        const constraintViolations = errors.filter((e) => e.code === 'NU1608').length;
        let severity = 'low';
        let canProceed = true;
        const actionItems = [];
        const aiRecommendations = [];
        // Determine severity
        if (errorCount > 0) {
            severity = errorCount > 3 ? 'critical' : 'high';
            canProceed = false;
        }
        else if (versionConflicts > 0 || constraintViolations > 0) {
            severity = (versionConflicts + constraintViolations) > 5 ? 'high' : 'medium';
        }
        // Generate recommendations based on error types
        if (versionConflicts > 0) {
            actionItems.push('Resolve version conflicts by adding explicit package references');
            actionItems.push('Use package consolidation to align dependency versions');
            aiRecommendations.push('Consider upgrading to compatible versions of conflicting packages');
            aiRecommendations.push('Review your dependency graph to identify the source of conflicts');
        }
        if (constraintViolations > 0) {
            actionItems.push('Review package dependency constraints and update accordingly');
            aiRecommendations.push('Check if packages need to be upgraded together as a group');
            aiRecommendations.push('Consider using package version ranges to allow more flexibility');
        }
        if (errorCount > 0) {
            actionItems.push('Address critical restore errors before proceeding');
            aiRecommendations.push('Check project file syntax and package reference formatting');
        }
        // Default recommendations
        if (actionItems.length === 0) {
            actionItems.push('Monitor restore output for any performance impacts');
            aiRecommendations.push('All restore issues appear to be non-critical warnings');
        }
        return { aiRecommendations, actionItems, severity, canProceed };
    }
    /**
     * Generate detailed structured restore error summary
     * Provides project-specific analysis with error types and recommendations
     */
    async generateDetailedRestoreErrorSummary(errors, fullOutput) {
        try {
            this.logger.info('📋 Starting detailed restore error summary generation...');
            // Group errors by project for logging
            const errorsByProject = new Map();
            for (const error of errors) {
                const projectKey = error.projectPath || 'Unknown Project';
                if (!errorsByProject.has(projectKey)) {
                    errorsByProject.set(projectKey, []);
                }
                errorsByProject.get(projectKey).push(error);
            }
            this.logger.info(`🔍 Generating detailed analysis for ${errorsByProject.size} project(s)`, {
                projects: Array.from(errorsByProject.keys()),
                totalErrors: errors.length,
                errorBreakdown: Array.from(errorsByProject.entries()).map(([project, errs]) => ({
                    project,
                    errorCount: errs.length,
                    errorCodes: errs.map(e => e.code).filter(Boolean)
                }))
            });
            const prompt = this.buildDetailedRestoreErrorPrompt(errors, fullOutput);
            // Try to use VS Code's language model API
            const aiResponse = await this.tryLanguageModelAnalysis(prompt, 'Detailed Restore Error Summary');
            if (aiResponse) {
                this.logger.info('✅ Detailed restore error summary generated successfully');
                return this.parseDetailedRestoreErrorSummary(aiResponse);
            }
            // Fallback to simple structured analysis
            this.logger.warn('⚠️ AI unavailable, using fallback detailed summary');
            return this.generateFallbackDetailedSummary(errors);
        }
        catch (error) {
            this.logger.error('❌ AI detailed restore error analysis failed, using fallback', error);
            return this.generateFallbackDetailedSummary(errors);
        }
    }
    /**
     * Build detailed prompt for structured restore error analysis
     */
    buildDetailedRestoreErrorPrompt(errors, fullOutput) {
        return `You are a .NET package restore expert. Analyze these restore errors and provide a structured, project-specific analysis.

RESTORE ERRORS:
${errors.map((e) => `- ${e.code}: ${e.message} (${e.projectPath || 'Unknown Project'})`).join('\n')}

FULL RESTORE OUTPUT:
${fullOutput.length > 3000 ? fullOutput.substring(0, 3000) + '...' : fullOutput}

Please provide a detailed analysis showing:
1. Each project with restore errors
2. Error types for each project (version-conflict, dependency-constraint, missing-package, other)
3. Main causes and version conflict details
4. Overall recommendations

Respond with ONLY a JSON object in this exact format:
{
  "projectSummaries": [
    {
      "projectName": "ProjectName.csproj",
      "projectPath": "/path/to/project.csproj",
      "errorTypes": [
        {
          "type": "version-conflict",
          "description": "Brief description of the conflict",
          "affectedPackages": ["Package1", "Package2"]
        }
      ],
      "mainCauses": [
        "Primary cause description",
        "Secondary cause description"
      ],
      "versionConflictDetails": {
        "conflictedPackage": "PackageName",
        "requiredVersions": ["4.x", "3.x"],
        "description": "some dependencies require 4.x, others require 3.x"
      }
    }
  ],
  "overallRecommendations": [
    "Recommendation 1",
    "Recommendation 2"
  ],
  "severity": "high",
  "canProceed": false
}

CRITICAL: Return ONLY the JSON object, no markdown formatting or additional text.`;
    }
    /**
     * Parse AI response for detailed restore error summary
     */
    parseDetailedRestoreErrorSummary(aiResponse) {
        try {
            this.logger.info('🔍 Parsing AI detailed restore error summary response...');
            const parsed = JSON.parse(aiResponse);
            const result = {
                projectSummaries: parsed.projectSummaries || [],
                overallRecommendations: parsed.overallRecommendations || [],
                severity: parsed.severity || 'medium',
                canProceed: parsed.canProceed !== false
            };
            this.logger.info('✅ Successfully parsed detailed AI response', {
                projectCount: result.projectSummaries.length,
                overallRecommendationCount: result.overallRecommendations.length,
                severity: result.severity,
                canProceed: result.canProceed,
                projectDetails: result.projectSummaries.map((p) => ({
                    project: p.projectName,
                    errorTypeCount: p.errorTypes.length,
                    mainCauseCount: p.mainCauses.length,
                    hasVersionConflictDetails: !!p.versionConflictDetails
                })),
                overallRecommendations: result.overallRecommendations
            });
            return result;
        }
        catch (error) {
            this.logger.error('❌ Failed to parse AI detailed restore error summary response', {
                error: error instanceof Error ? error.message : String(error),
                responseLength: aiResponse.length,
                responsePreview: aiResponse.substring(0, 500)
            });
            this.logger.warn('⚠️ Using fallback detailed summary due to parsing failure');
            return this.generateFallbackDetailedSummary([]);
        }
    }
    /**
     * Generate fallback detailed summary when AI is unavailable
     */
    generateFallbackDetailedSummary(errors) {
        // Group errors by project
        const errorsByProject = new Map();
        for (const error of errors) {
            const projectKey = error.projectPath || 'Unknown Project';
            if (!errorsByProject.has(projectKey)) {
                errorsByProject.set(projectKey, []);
            }
            errorsByProject.get(projectKey).push(error);
        }
        const projectSummaries = Array.from(errorsByProject.entries()).map(([projectPath, projectErrors]) => {
            const projectName = projectPath.includes('/') || projectPath.includes('\\')
                ? projectPath.split(/[/\\]/).pop() || 'Unknown'
                : projectPath;
            const errorTypes = [];
            const mainCauses = [];
            let versionConflictDetails;
            // Analyze error types
            const versionConflicts = projectErrors.filter(e => e.code === 'NU1107');
            const dependencyConstraints = projectErrors.filter(e => e.code === 'NU1608');
            const missingPackages = projectErrors.filter(e => e.code === 'NU1101');
            const otherErrors = projectErrors.filter(e => !['NU1107', 'NU1608', 'NU1101'].includes(e.code));
            if (versionConflicts.length > 0) {
                const conflictedPackages = versionConflicts.map(e => {
                    const match = e.message.match(/Version conflict detected for (\S+)/);
                    return match ? match[1] : 'Unknown Package';
                });
                errorTypes.push({
                    type: 'version-conflict',
                    description: `Version conflicts detected for ${conflictedPackages.length} package(s)`,
                    affectedPackages: conflictedPackages
                });
                mainCauses.push('Multiple dependencies require different versions of the same package');
                // Create version conflict details for the first conflict
                if (conflictedPackages.length > 0) {
                    versionConflictDetails = {
                        conflictedPackage: conflictedPackages[0],
                        requiredVersions: ['various versions'],
                        description: 'some dependencies require different versions'
                    };
                }
            }
            if (dependencyConstraints.length > 0) {
                errorTypes.push({
                    type: 'dependency-constraint',
                    description: `Dependency constraint violations for ${dependencyConstraints.length} package(s)`,
                    affectedPackages: dependencyConstraints.map(e => e.message.split(' ')[0] || 'Unknown')
                });
                mainCauses.push('Package version constraints are violated');
            }
            if (missingPackages.length > 0) {
                errorTypes.push({
                    type: 'missing-package',
                    description: `Missing packages: ${missingPackages.length} package(s) not found`,
                    affectedPackages: missingPackages.map(e => e.message.split(' ')[0] || 'Unknown')
                });
                mainCauses.push('Referenced packages are not available in configured sources');
            }
            if (otherErrors.length > 0) {
                errorTypes.push({
                    type: 'other',
                    description: `Other restore issues: ${otherErrors.length} error(s)`,
                    affectedPackages: []
                });
                mainCauses.push('Various other restore issues detected');
            }
            return {
                projectName,
                projectPath,
                errorTypes,
                mainCauses,
                versionConflictDetails
            };
        });
        // Generate overall recommendations
        const overallRecommendations = [];
        const hasVersionConflicts = errors.some(e => e.code === 'NU1107');
        const hasDependencyConstraints = errors.some(e => e.code === 'NU1608');
        const hasMissingPackages = errors.some(e => e.code === 'NU1101');
        if (hasVersionConflicts) {
            overallRecommendations.push('Align all package versions by adding explicit package references');
            overallRecommendations.push('Use package consolidation to resolve version conflicts');
        }
        if (hasDependencyConstraints) {
            overallRecommendations.push('Review and update package dependency constraints');
            overallRecommendations.push('Consider upgrading packages as groups to maintain compatibility');
        }
        if (hasMissingPackages) {
            overallRecommendations.push('Verify package sources and availability');
            overallRecommendations.push('Check for typos in package names and versions');
        }
        if (overallRecommendations.length === 0) {
            overallRecommendations.push('Monitor restore process for any performance impacts');
        }
        // Determine severity
        const errorCount = errors.filter(e => e.type === 'error').length;
        let severity = 'low';
        let canProceed = true;
        if (errorCount > 0) {
            severity = errorCount > 3 ? 'critical' : 'high';
            canProceed = false;
        }
        else if (hasVersionConflicts || hasDependencyConstraints) {
            severity = (hasVersionConflicts && hasDependencyConstraints) ? 'high' : 'medium';
        }
        return {
            projectSummaries,
            overallRecommendations,
            severity,
            canProceed
        };
    }
}
exports.CopilotService = CopilotService;
//# sourceMappingURL=copilotService.js.map