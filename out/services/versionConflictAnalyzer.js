"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionConflictAnalyzer = void 0;
/**
 * Service for analyzing and resolving version conflicts
 */
class VersionConflictAnalyzer {
    constructor(logger, copilotService) {
        this.logger = logger;
        this.copilotService = copilotService;
    }
    /**
     * Analyze version conflicts across multiple projects
     * @param packageName The name of the package with conflicts
     * @param projectVersions Array of project paths and their current versions
     * @returns Detailed analysis of the version conflict
     */
    async analyzeVersionConflict(packageName, projectVersions) {
        try {
            this.logger.info('Analyzing version conflict', {
                package: packageName,
                projectCount: projectVersions.length
            });
            // Generate a comprehensive prompt for Copilot
            const prompt = this.generateConflictAnalysisPrompt(packageName, projectVersions);
            // Get analysis from Copilot
            const analysis = await this.getCopilotAnalysis(prompt);
            // Validate and enhance the analysis
            const enhancedAnalysis = await this.enhanceAnalysis(analysis, projectVersions);
            this.logger.info('Version conflict analysis completed', {
                package: packageName,
                recommendedVersion: enhancedAnalysis.recommendedVersion
            });
            return enhancedAnalysis;
        }
        catch (error) {
            this.logger.error('Failed to analyze version conflict', error);
            throw error;
        }
    }
    /**
     * Generate a prompt for Copilot to analyze version conflicts
     */
    generateConflictAnalysisPrompt(packageName, projectVersions) {
        const projectDetails = projectVersions.map(pv => `
Project: ${pv.path}
Version: ${pv.version}
Dependencies:
${Array.from(pv.dependencies.entries())
            .map(([dep, ver]) => `  - ${dep}: ${ver}`)
            .join('\n')}`).join('\n');
        return `Please analyze the following version conflict and provide a detailed resolution:

Package: ${packageName}
${projectDetails}

Please provide:
1. Recommended version to resolve conflicts
2. Reasoning for the recommendation
3. Required migration steps
4. Potential breaking changes
5. Compatibility notes
6. Test impact assessment
7. Dependency graph analysis

Format the response as a JSON object with the following structure:
{
    "recommendedVersion": "string",
    "reasoning": "string",
    "migrationSteps": ["string"],
    "breakingChanges": ["string"],
    "compatibilityNotes": ["string"],
    "testImpact": ["string"],
    "dependencyGraph": [
        {
            "package": "string",
            "version": "string",
            "dependencies": [
                {
                    "package": "string",
                    "version": "string",
                    "isDirect": boolean
                }
            ]
        }
    ]
}`;
    }
    /**
     * Get analysis from Copilot
     */
    async getCopilotAnalysis(prompt) {
        // Use the real Copilot service instead of mock
        const analysis = await this.copilotService.analyzeVersionConflict(this.extractPackageNameFromPrompt(prompt), this.extractVersionsFromPrompt(prompt), this.extractProjectPathsFromPrompt(prompt), []);
        return {
            packageName: analysis.packageName || "Unknown",
            currentVersions: analysis.currentVersions || [],
            recommendedVersion: analysis.recommendedVersion,
            reasoning: analysis.reasoning,
            migrationSteps: analysis.migrationSteps || [],
            breakingChanges: analysis.breakingChanges || [],
            compatibilityNotes: analysis.compatibilityNotes || [],
            testImpact: analysis.testImpact || [],
            dependencyGraph: analysis.dependencyGraph || []
        };
    }
    /**
     * Enhance the analysis with additional context and validation
     */
    async enhanceAnalysis(analysis, projectVersions) {
        // Add semantic versioning validation
        const validatedVersion = this.validateSemanticVersion(analysis.recommendedVersion);
        // Add dependency compatibility checks
        const compatibilityChecks = await this.checkDependencyCompatibility(analysis.recommendedVersion, projectVersions);
        // Enhance migration steps with project-specific details
        const enhancedMigrationSteps = this.enhanceMigrationSteps(analysis.migrationSteps, projectVersions);
        return {
            ...analysis,
            recommendedVersion: validatedVersion,
            migrationSteps: enhancedMigrationSteps,
            compatibilityNotes: [
                ...analysis.compatibilityNotes,
                ...compatibilityChecks
            ]
        };
    }
    /**
     * Validate semantic versioning
     */
    validateSemanticVersion(version) {
        // Basic semantic version validation
        const semverRegex = /^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$/;
        if (!semverRegex.test(version)) {
            throw new Error(`Invalid semantic version: ${version}`);
        }
        return version;
    }
    /**
     * Check dependency compatibility
     */
    async checkDependencyCompatibility(version, projectVersions) {
        const compatibilityNotes = [];
        // Check each project's dependencies
        for (const project of projectVersions) {
            for (const [dep, depVersion] of project.dependencies) {
                // Add compatibility checks based on known version constraints
                if (this.hasKnownVersionConstraint(dep, depVersion)) {
                    compatibilityNotes.push(`Project ${project.path}: ${dep} ${depVersion} may require updates for compatibility`);
                }
            }
        }
        return compatibilityNotes;
    }
    /**
     * Check if a package has known version constraints
     */
    hasKnownVersionConstraint(packageName, version) {
        // Add known version constraints for common packages
        const knownConstraints = new Map([
            ['AWSSDK.Core', ['4.0.0.0', '4.0.0.5']],
            ['Microsoft.Extensions.DependencyInjection', ['6.0.0', '7.0.0']],
            // Add more known constraints as needed
        ]);
        const constraints = knownConstraints.get(packageName);
        return constraints ? constraints.includes(version) : false;
    }
    /**
     * Enhance migration steps with project-specific details
     */
    enhanceMigrationSteps(steps, projectVersions) {
        return steps.map(step => {
            // Add project-specific context to each step
            const projectContext = projectVersions
                .map(pv => `\\n  - ${pv.path} (${pv.version})`)
                .join('');
            return `${step}${projectContext}`;
        });
    }
    extractPackageNameFromPrompt(prompt) {
        // Implementation of extractPackageNameFromPrompt method
        // This is a placeholder and should be implemented based on your prompt parsing logic
        return "Unknown";
    }
    extractVersionsFromPrompt(prompt) {
        // Implementation of extractVersionsFromPrompt method
        // This is a placeholder and should be implemented based on your prompt parsing logic
        return [];
    }
    extractProjectPathsFromPrompt(prompt) {
        // Implementation of extractProjectPathsFromPrompt method
        // This is a placeholder and should be implemented based on your prompt parsing logic
        return [];
    }
}
exports.VersionConflictAnalyzer = VersionConflictAnalyzer;
//# sourceMappingURL=versionConflictAnalyzer.js.map