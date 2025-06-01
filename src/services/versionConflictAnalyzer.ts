import { Logger } from '../utils/logger';
import { CopilotService } from './copilotService';

/**
 * Interface for version conflict analysis
 */
export interface VersionConflictAnalysis {
    packageName: string;
    currentVersions: string[];
    recommendedVersion: string;
    reasoning: string;
    migrationSteps: string[];
    breakingChanges: string[];
    compatibilityNotes: string[];
    testImpact: string[];
    dependencyGraph?: {
        package: string;
        version: string;
        dependencies: Array<{
            package: string;
            version: string;
            isDirect: boolean;
        }>;
    }[];
}

/**
 * Interface for project version information
 */
export interface ProjectVersionInfo {
    path: string;
    version: string;
    dependencies: Map<string, string>;
}

/**
 * Service for analyzing and resolving version conflicts
 */
export class VersionConflictAnalyzer {
    private logger: Logger;
    private copilotService: CopilotService;

    constructor(logger: Logger, copilotService: CopilotService) {
        this.logger = logger;
        this.copilotService = copilotService;
    }

    /**
     * Analyze version conflicts across multiple projects
     * @param packageName The name of the package with conflicts
     * @param projectVersions Array of project paths and their current versions
     * @returns Detailed analysis of the version conflict
     */
    async analyzeVersionConflict(
        packageName: string,
        projectVersions: ProjectVersionInfo[]
    ): Promise<VersionConflictAnalysis> {
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
        } catch (error) {
            this.logger.error('Failed to analyze version conflict', error);
            throw error;
        }
    }

    /**
     * Generate a prompt for Copilot to analyze version conflicts
     */
    private generateConflictAnalysisPrompt(
        packageName: string,
        projectVersions: ProjectVersionInfo[]
    ): string {
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
    private async getCopilotAnalysis(prompt: string): Promise<VersionConflictAnalysis> {
        // Use the real Copilot service instead of mock
        const analysis = await this.copilotService.analyzeVersionConflict(
            this.extractPackageNameFromPrompt(prompt),
            this.extractVersionsFromPrompt(prompt),
            this.extractProjectPathsFromPrompt(prompt),
            []
        );
        
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
    private async enhanceAnalysis(
        analysis: VersionConflictAnalysis,
        projectVersions: ProjectVersionInfo[]
    ): Promise<VersionConflictAnalysis> {
        // Add semantic versioning validation
        const validatedVersion = this.validateSemanticVersion(analysis.recommendedVersion);

        // Add dependency compatibility checks
        const compatibilityChecks = await this.checkDependencyCompatibility(
            analysis.recommendedVersion,
            projectVersions
        );

        // Enhance migration steps with project-specific details
        const enhancedMigrationSteps = this.enhanceMigrationSteps(
            analysis.migrationSteps,
            projectVersions
        );

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
    private validateSemanticVersion(version: string): string {
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
    private async checkDependencyCompatibility(
        version: string,
        projectVersions: ProjectVersionInfo[]
    ): Promise<string[]> {
        const compatibilityNotes: string[] = [];

        // Check each project's dependencies
        for (const project of projectVersions) {
            for (const [dep, depVersion] of project.dependencies) {
                // Add compatibility checks based on known version constraints
                if (this.hasKnownVersionConstraint(dep, depVersion)) {
                    compatibilityNotes.push(
                        `Project ${project.path}: ${dep} ${depVersion} may require updates for compatibility`
                    );
                }
            }
        }

        return compatibilityNotes;
    }

    /**
     * Check if a package has known version constraints
     */
    private hasKnownVersionConstraint(packageName: string, version: string): boolean {
        // Add known version constraints for common packages
        const knownConstraints = new Map<string, string[]>([
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
    private enhanceMigrationSteps(
        steps: string[],
        projectVersions: ProjectVersionInfo[]
    ): string[] {
        return steps.map(step => {
            // Add project-specific context to each step
            const projectContext = projectVersions
                .map(pv => `\\n  - ${pv.path} (${pv.version})`)
                .join('');
            return `${step}${projectContext}`;
        });
    }

    private extractPackageNameFromPrompt(prompt: string): string {
        // Implementation of extractPackageNameFromPrompt method
        // This is a placeholder and should be implemented based on your prompt parsing logic
        return "Unknown";
    }

    private extractVersionsFromPrompt(prompt: string): string[] {
        // Implementation of extractVersionsFromPrompt method
        // This is a placeholder and should be implemented based on your prompt parsing logic
        return [];
    }

    private extractProjectPathsFromPrompt(prompt: string): string[] {
        // Implementation of extractProjectPathsFromPrompt method
        // This is a placeholder and should be implemented based on your prompt parsing logic
        return [];
    }
} 