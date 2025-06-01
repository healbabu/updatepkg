import * as vscode from 'vscode';
import { exec } from 'child_process';
import { Logger } from '../utils/logger';
import { CopilotService } from './copilotService';

/**
 * Interface for breaking change fix
 */
interface BreakingChangeFix {
    filePath: string;
    changes: string;
    description: string;
}

/**
 * Interface for test verification result
 */
interface TestVerification {
    success: boolean;
    failures: string[];
    duration: number;
}

/**
 * Service for handling breaking changes and test verification
 */
export class BreakingChangeHandler {
    private logger: Logger;
    private copilotService: CopilotService;

    constructor(logger: Logger) {
        this.logger = logger;
        this.copilotService = new CopilotService(logger);
    }

    /**
     * Handle breaking changes for a package update
     * @param packageName Name of the package
     * @param newVersion New version of the package
     * @param projectPath Path to the project directory
     */
    async handleBreakingChanges(
        packageName: string,
        newVersion: string,
        projectPath: string
    ): Promise<void> {
        try {
            this.logger.info('Handling breaking changes', {
                package: packageName,
                version: newVersion
            });

            // Get breaking changes documentation
            const breakingChanges = await this.getBreakingChangesDocumentation(packageName, newVersion);
            if (!breakingChanges) {
                this.logger.warn('No breaking changes documentation found', {
                    package: packageName,
                    version: newVersion
                });
                return;
            }

            // Find affected files
            const affectedFiles = await this.findAffectedFiles(projectPath, breakingChanges);
            if (affectedFiles.length === 0) {
                this.logger.info('No affected files found', {
                    package: packageName,
                    version: newVersion
                });
                return;
            }

            // Fix breaking changes
            for (const file of affectedFiles) {
                const fixes = await this.fixBreakingChanges(file, breakingChanges);
                await this.applyFixes(fixes);
            }

            this.logger.info('Breaking changes handled successfully', {
                package: packageName,
                version: newVersion,
                filesFixed: affectedFiles.length
            });
        } catch (error) {
            this.logger.error('Failed to handle breaking changes', {
                package: packageName,
                version: newVersion,
                error
            });
            throw error;
        }
    }

    /**
     * Verify tests after package update
     * @param projectPath Path to the project directory
     * @returns Test verification result
     */
    async verifyTests(projectPath: string): Promise<TestVerification> {
        try {
            this.logger.info('Running tests', { projectPath });

            const startTime = Date.now();
            const result = await new Promise<string>((resolve, reject) => {
                exec(
                    `dotnet test ${projectPath} --no-build`,
                    (error: Error | null, stdout: string, stderr: string) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(stdout);
                        }
                    }
                );
            });

            const duration = Date.now() - startTime;
            const failures = this.parseTestFailures(result);

            const verification: TestVerification = {
                success: failures.length === 0,
                failures,
                duration
            };

            this.logger.info('Tests completed', {
                success: verification.success,
                failures: verification.failures.length,
                duration: verification.duration
            });

            return verification;
        } catch (error) {
            this.logger.error('Failed to run tests', { projectPath, error });
            throw error;
        }
    }

    /**
     * Get breaking changes documentation
     * @param packageName Name of the package
     * @param newVersion New version of the package
     * @returns Breaking changes documentation
     */
    private async getBreakingChangesDocumentation(
        packageName: string,
        newVersion: string
    ): Promise<string | null> {
        try {
            // This would be implemented to fetch breaking changes from package documentation
            // For now, return null to indicate no documentation found
            return null;
        } catch (error) {
            this.logger.error('Failed to get breaking changes documentation', {
                package: packageName,
                version: newVersion,
                error
            });
            return null;
        }
    }

    /**
     * Find files affected by breaking changes
     * @param projectPath Path to the project directory
     * @param breakingChanges Breaking changes documentation
     * @returns Array of affected file paths
     */
    private async findAffectedFiles(
        projectPath: string,
        breakingChanges: string
    ): Promise<string[]> {
        try {
            // This would be implemented to analyze project files for breaking changes
            // For now, return an empty array
            return [];
        } catch (error) {
            this.logger.error('Failed to find affected files', { projectPath, error });
            return [];
        }
    }

    /**
     * Fix breaking changes in a file
     * @param filePath Path to the file
     * @param breakingChanges Breaking changes documentation
     * @returns Array of fixes to apply
     */
    private async fixBreakingChanges(
        filePath: string,
        breakingChanges: string
    ): Promise<BreakingChangeFix[]> {
        try {
            // This would be implemented to generate fixes using Copilot
            // For now, return an empty array
            return [];
        } catch (error) {
            this.logger.error('Failed to fix breaking changes', { filePath, error });
            return [];
        }
    }

    /**
     * Apply fixes to a file
     * @param fixes Array of fixes to apply
     */
    private async applyFixes(fixes: BreakingChangeFix[]): Promise<void> {
        try {
            for (const fix of fixes) {
                // This would be implemented to apply the fixes
                this.logger.info('Applying fix', {
                    file: fix.filePath,
                    description: fix.description
                });
            }
        } catch (error) {
            this.logger.error('Failed to apply fixes', { error });
            throw error;
        }
    }

    /**
     * Parse test failures from test output
     * @param output Test output
     * @returns Array of test failure messages
     */
    private parseTestFailures(output: string): string[] {
        const failures: string[] = [];
        const failureRegex = /Failed\s+([^\n]+)/g;
        let match;

        while ((match = failureRegex.exec(output)) !== null) {
            failures.push(match[1].trim());
        }

        return failures;
    }

    /**
     * Analyze the project for potential breaking changes using Copilot agent.
     * @param projectPath Path to the project directory
     * @returns Array of suggested breaking change fixes or warnings
     */
    async analyzeProjectForBreakingChanges(projectPath: string): Promise<BreakingChangeFix[]> {
        this.logger.info('Agent analyzing project for breaking changes', { projectPath });

        // Gather all package references
        const packageReferences = await this.getPackageReferences(projectPath);

        // Generate a Copilot prompt with all dependencies
        const prompt = `\nAnalyze this .NET project for potential breaking changes or migration issues.\nDependencies:\n${packageReferences.map(pkg => `${pkg.name}: ${pkg.version}`).join('\n')}\nProject path: ${projectPath}\n`;

        // Use Copilot to get suggestions
        const suggestions = await this.getCopilotSuggestionsFromPrompt(prompt);

        // Parse and return as BreakingChangeFix[]
        return this.parseAgentBreakingChangeSuggestions(suggestions);
    }

    // Helper to get all package references from the project file
    private async getPackageReferences(projectPath: string): Promise<Array<{ name: string; version: string }>> {
        try {
            const fs = require('fs');
            const path = require('path');
            let projectFiles: string[] = [];
            if (fs.existsSync(projectPath)) {
                const stat = fs.statSync(projectPath);
                if (stat.isDirectory()) {
                    projectFiles = fs.readdirSync(projectPath)
                        .filter((file: string) => file.endsWith('.csproj'))
                        .map((file: string) => path.join(projectPath, file));
                } else if (projectPath.endsWith('.csproj')) {
                    projectFiles = [projectPath];
                }
            }
            if (projectFiles.length === 0) {
                this.logger.warn('No project files found', { projectPath });
                return [];
            }
            const packageRefs: Array<{ name: string; version: string }> = [];
            for (const projectFile of projectFiles) {
                const content = fs.readFileSync(projectFile, 'utf8');
                const packageRefRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>/g;
                let match;
                while ((match = packageRefRegex.exec(content)) !== null) {
                    packageRefs.push({
                        name: match[1],
                        version: match[2]
                    });
                }
            }
            this.logger.info('Found package references', { count: packageRefs.length });
            return packageRefs;
        } catch (error) {
            this.logger.error('Failed to get package references', { projectPath, error });
            return [];
        }
    }

    // Helper to get Copilot suggestions from a prompt
    private async getCopilotSuggestionsFromPrompt(prompt: string): Promise<string> {
        try {
            // Create a temporary document for Copilot to analyze
            const tempDoc = await vscode.workspace.openTextDocument({
                content: prompt,
                language: 'markdown'
            });

            // Get Copilot suggestions with enhanced context
            const enhancedPrompt = `
Project Analysis Request:
${prompt}

Please analyze the above .NET project and provide:
1. Potential breaking changes in current package versions
2. Migration steps needed
3. Security implications
4. Test impact assessment

Format the response as JSON with the following structure:
{
    "breakingChanges": [
        {
            "packageName": "string",
            "currentVersion": "string",
            "issues": ["string"],
            "migrationSteps": ["string"],
            "securityImplications": ["string"],
            "testImpact": ["string"]
        }
    ]
}`;

            // Use Copilot service to get suggestions
            const suggestions = await this.copilotService.getPackageUpdateSuggestions(
                'project-analysis',
                'current'
            );

            return JSON.stringify(suggestions);
        } catch (error) {
            this.logger.error('Failed to get Copilot suggestions', { error });
            return '[]';
        }
    }

    // Helper to parse Copilot agent suggestions into BreakingChangeFix[]
    private parseAgentBreakingChangeSuggestions(suggestions: string): BreakingChangeFix[] {
        try {
            const parsed = JSON.parse(suggestions);
            const fixes: BreakingChangeFix[] = [];

            if (Array.isArray(parsed)) {
                for (const suggestion of parsed) {
                    if (suggestion.breakingChanges) {
                        fixes.push({
                            filePath: 'project-wide',
                            changes: suggestion.migrationSteps?.join('\n') || '',
                            description: `Package: ${suggestion.packageName}\n` +
                                `Issues: ${suggestion.issues?.join(', ')}\n` +
                                `Security: ${suggestion.securityImplications?.join(', ')}\n` +
                                `Test Impact: ${suggestion.testImpact?.join(', ')}`
                        });
                    }
                }
            }

            this.logger.info('Parsed breaking change suggestions', { count: fixes.length });
            return fixes;
        } catch (error) {
            this.logger.error('Failed to parse agent suggestions', { error });
            return [];
        }
    }
} 