import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Logger } from '../utils/logger';
import { CopilotService, PackageUpdateSuggestion } from './copilotService';
import { ConfigurationManager } from './configurationManager';
import { BreakingChangeHandler } from './breakingChangeHandler';
import { VersionConflictAnalyzer, VersionConflictAnalysis, ProjectVersionInfo } from './versionConflictAnalyzer';

/**
 * Interface for package update information
 */
export interface PackageUpdate {
    packageName: string;
    currentVersion: string;
    recommendedVersion: string;
    hasBreakingChanges: boolean;
    securityImplications?: string[];
    migrationComplexity?: 'low' | 'medium' | 'high';
    testImpact?: string[];
}

export interface PackageUpdateWithProject extends PackageUpdate {
    projectName?: string;
}

export type SuggestionMode = 'enterprise' | 'standard';

/**
 * Service for managing package upgrades
 */
export class PackageUpgrader {
    private logger: Logger;
    private copilotService: CopilotService;
    private configManager: ConfigurationManager;
    private breakingChangeHandler: BreakingChangeHandler;
    private versionConflictAnalyzer: VersionConflictAnalyzer;
    private suggestionMode: SuggestionMode;

    constructor(logger: Logger, suggestionMode: SuggestionMode = 'standard') {
        this.logger = logger;
        this.copilotService = new CopilotService(logger);
        this.configManager = new ConfigurationManager();
        this.breakingChangeHandler = new BreakingChangeHandler(logger);
        this.versionConflictAnalyzer = new VersionConflictAnalyzer(logger, this.copilotService);
        this.suggestionMode = suggestionMode;
    }

    /**
     * Check for available package updates
     * @param projectPath Path to the project directory or .csproj file
     * @returns Array of package updates
     */
    async checkForUpdates(projectPath: string): Promise<PackageUpdate[]> {
        try {
            this.logger.info('Checking for package updates', { projectPath, mode: this.suggestionMode });
            if (this.suggestionMode === 'standard') {
                this.logger.info('Using standard mode: dotnet CLI for outdated packages', { projectPath });
                return await this.getOutdatedPackagesStandard(projectPath);
            } else {
                this.logger.info('Using enterprise mode: AI agent/enterprise service for suggestions', { projectPath });
                return await this.getOutdatedPackagesEnterprise(projectPath);
            }
        } catch (error) {
            this.logger.error('Failed to check for updates', error);
            throw error;
        }
    }

    /**
     * Get outdated packages using dotnet CLI (standard mode)
     */
    private async getOutdatedPackagesStandard(projectPath: string): Promise<PackageUpdateWithProject[]> {
        this.logger.info('Invoking dotnet CLI to list outdated packages', { projectPath });
        return new Promise((resolve) => {
            const projectFile = this.resolveProjectFile(projectPath);
            const isSolution = projectFile.endsWith('.sln');
            const cmd = isSolution
                ? `dotnet list "${projectFile}" package --outdated`
                : `dotnet list "${projectFile}" package --outdated`;
            this.logger.info('Running command', { cmd });
            exec(cmd, (error, stdout) => {
                if (error) {
                    this.logger.warn('Failed to get outdated packages', { error });
                    resolve([]);
                    return;
                }
                this.logger.info('Parsing dotnet CLI output for outdated packages');
                const updates: PackageUpdateWithProject[] = [];
                const lines = stdout.split('\n');
                let projectName = '';
                for (const line of lines) {
                    // Extract project name
                    const projectMatch = line.match(/^Project [`'\"]?(.+?)[`'\"]? has the following updates/);
                    if (projectMatch) {
                        projectName = projectMatch[1];
                        continue;
                    }
                    // Only parse lines starting with '>'
                    if (line.trim().startsWith('>')) {
                        const parts = line.trim().split(/\s+/);
                        // parts[0] is '>', parts[1] is package name, then requested, resolved, latest
                        if (parts.length >= 5) {
                            updates.push({
                                packageName: parts[1],
                                currentVersion: parts[3], // Resolved
                                recommendedVersion: parts[4], // Latest
                                hasBreakingChanges: false,
                                projectName
                            });
                        }
                    }
                }
                this.logger.info('Completed parsing CLI output', { updateCount: updates.length, projectName });
                resolve(updates);
            });
        });
    }

    /**
     * Placeholder for enterprise service logic
     */
    private async getOutdatedPackagesEnterprise(projectPath: string): Promise<PackageUpdate[]> {
        this.logger.info('Invoking enterprise/AI agent for package suggestions', { projectPath });
        // TODO: Implement enterprise service logic here
        return [];
    }

    /**
     * Apply package updates
     * @param updates Array of package updates to apply
     * @param projectPath Path to the project directory
     */
    async applyUpdates(updates: PackageUpdate[], projectPath: string): Promise<void> {
        try {
            this.logger.info('Applying package updates', { count: updates.length, projectPath });
            for (const update of updates) {
                this.logger.info('Preparing to update package', { package: update.packageName, version: update.recommendedVersion });
                if (update.hasBreakingChanges && !this.configManager.allowBreakingChanges) {
                    this.logger.info('Skipping update with breaking changes', {
                        package: update.packageName,
                        version: update.recommendedVersion
                    });
                    continue;
                }
                await this.updatePackage(
                    update.packageName,
                    update.recommendedVersion,
                    projectPath
                );
                if (update.hasBreakingChanges && this.configManager.copilotAgentConfig.enabled) {
                    this.logger.info('Invoking AI agent to handle breaking changes', { package: update.packageName, version: update.recommendedVersion });
                    await this.breakingChangeHandler.handleBreakingChanges(
                        update.packageName,
                        update.recommendedVersion,
                        projectPath
                    );
                }
                if (this.configManager.copilotAgentConfig.testAnalysis) {
                    this.logger.info('Running tests after update', { projectPath });
                    const testResults = await this.breakingChangeHandler.verifyTests(projectPath);
                    if (!testResults.success) {
                        this.logger.warn('Tests failed after update', {
                            package: update.packageName,
                            version: update.recommendedVersion,
                            failures: testResults.failures
                        });
                    } else {
                        this.logger.info('All tests passed after update', { package: update.packageName, version: update.recommendedVersion });
                    }
                }
            }
            this.logger.info('Package updates applied successfully', { projectPath });
        } catch (error) {
            this.logger.error('Failed to apply updates', error);
            throw error;
        }
    }

    /**
     * Resolve the project file path from a directory or .csproj file
     * @param projectPath Path to the project directory or .csproj file
     * @returns The .csproj file path
     */
    private resolveProjectFile(projectPath: string): string {
        if (fs.existsSync(projectPath)) {
            const stat = fs.statSync(projectPath);
            if (stat.isDirectory()) {
                const files = fs.readdirSync(projectPath).filter((file: string) => file.endsWith('.csproj'));
                if (files.length === 0) {
                    throw new Error('No project file found');
                }
                return path.join(projectPath, files[0]);
            } else if (projectPath.endsWith('.csproj')) {
                return projectPath;
            }
        }
        throw new Error('Invalid project path');
    }

    /**
     * Get project information
     * @param projectPath Path to the project directory or .csproj file
     */
    private async getProjectInfo(projectPath: string): Promise<{ projectType: string; targetFramework: string }> {
        const projectFile = this.resolveProjectFile(projectPath);
        const content = fs.readFileSync(projectFile, 'utf8');
        // Extract project type and target framework
        const targetFrameworkMatch = content.match(/<TargetFramework>(.*?)<\/TargetFramework>/);
        const targetFramework = targetFrameworkMatch ? targetFrameworkMatch[1] : 'net6.0';
        return {
            projectType: 'web', // Default to web, could be enhanced to detect actual type
            targetFramework
        };
    }

    /**
     * Get package references from project file
     * @param projectPath Path to the project directory or .csproj file
     */
    private async getPackageReferences(projectPath: string): Promise<Array<{ name: string; version: string }>> {
        const projectFile = this.resolveProjectFile(projectPath);
        const content = fs.readFileSync(projectFile, 'utf8');
        const packageRefs: Array<{ name: string; version: string }> = [];
        const packageRefRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>/g;
        let match;
        while ((match = packageRefRegex.exec(content)) !== null) {
            packageRefs.push({
                name: match[1],
                version: match[2]
            });
        }
        return packageRefs;
    }

    /**
     * Update a specific package
     * @param packageName Name of the package
     * @param version Version to update to
     * @param projectPath Path to the project directory
     */
    public async updatePackage(packageName: string, version: string, projectPath: string): Promise<void> {
        try {
            this.logger.info('Updating package', { package: packageName, version });
            
            // Update package using dotnet CLI
            await new Promise<void>((resolve, reject) => {
                exec(
                    `dotnet add ${projectPath} package ${packageName} --version ${version}`,
                    (error: Error | null) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            });

            this.logger.info('Package updated successfully', { package: packageName, version });
        } catch (error) {
            this.logger.error('Failed to update package', { package: packageName, version, error });
            throw error;
        }
    }

    /**
     * Get all projects in a solution
     * @param solutionPath Path to the solution file
     * @returns Array of project paths
     */
    async getSolutionProjects(solutionPath: string): Promise<string[]> {
        try {
            this.logger.info('Getting projects from solution', { solutionPath });
            
            // Read solution file
            const content = fs.readFileSync(solutionPath, 'utf8');
            const projectRegex = /Project\("([^"]+)"\)\s*=\s*"([^"]+)",\s*"([^"]+)"/g;
            const projects: string[] = [];
            let match;

            while ((match = projectRegex.exec(content)) !== null) {
                const projectPath = path.join(path.dirname(solutionPath), match[3]);
                if (fs.existsSync(projectPath)) {
                    projects.push(projectPath);
                }
            }

            this.logger.info('Found projects in solution', { 
                solution: solutionPath, 
                count: projects.length 
            });
            return projects;
        } catch (error) {
            this.logger.error('Failed to get solution projects', { solutionPath, error });
            return [];
        }
    }

    /**
     * Check for updates across all projects in a solution
     * @param solutionPath Path to the solution file
     * @returns Map of project paths to their updates
     */
    async checkForUpdatesInSolution(solutionPath: string): Promise<Map<string, PackageUpdate[]>> {
        try {
            this.logger.info('Checking for updates in solution', { solutionPath });
            
            const projects = await this.getSolutionProjects(solutionPath);
            const updatesMap = new Map<string, PackageUpdate[]>();

            for (const projectPath of projects) {
                const updates = await this.checkForUpdates(projectPath);
                if (updates.length > 0) {
                    updatesMap.set(projectPath, updates);
                }
            }

            return updatesMap;
        } catch (error) {
            this.logger.error('Failed to check for updates in solution', { solutionPath, error });
            throw error;
        }
    }

    /**
     * Check for version conflicts across projects
     * @param updatesMap Map of project paths to their package updates
     * @returns Map of package names to their conflict analysis
     */
    public async checkForVersionConflicts(
        updatesMap: Map<string, PackageUpdate[]>
    ): Promise<Map<string, VersionConflictAnalysis>> {
        const conflicts = new Map<string, VersionConflictAnalysis>();
        const packageVersions = new Map<string, ProjectVersionInfo[]>();

        // Group updates by package name
        for (const [projectPath, updates] of updatesMap) {
            for (const update of updates) {
                if (!packageVersions.has(update.packageName)) {
                    packageVersions.set(update.packageName, []);
                }
                packageVersions.get(update.packageName)?.push({
                    path: projectPath,
                    version: update.currentVersion,
                    dependencies: new Map() // Will be populated with actual dependencies
                });
            }
        }

        // Analyze conflicts for each package
        for (const [packageName, versions] of packageVersions) {
            if (versions.length > 1) {
                // Get dependencies for each project
                for (const version of versions) {
                    const deps = await this.getPackageReferences(version.path);
                    version.dependencies = new Map(deps.map(d => [d.name, d.version]));
                }

                // Analyze the conflict
                const analysis = await this.versionConflictAnalyzer.analyzeVersionConflict(
                    packageName,
                    versions
                );
                conflicts.set(packageName, analysis);
            }
        }

        return conflicts;
    }

    /**
     * Apply updates with conflict resolution
     * @param updatesMap Map of project paths to their package updates
     * @param solutionPath Path to the solution file
     */
    async applyUpdatesInSolution(
        updatesMap: Map<string, PackageUpdate[]>,
        solutionPath: string
    ): Promise<void> {
        try {
            this.logger.info('Applying updates in solution', { solutionPath });

            // Check for version conflicts
            const conflicts = await this.checkForVersionConflicts(updatesMap);
            if (conflicts.size > 0) {
                this.logger.info('Version conflicts detected', {
                    conflicts: Array.from(conflicts.keys())
                });

                // Resolve conflicts first
                for (const [packageName, analysis] of conflicts) {
                    this.logger.info('Resolving version conflict', {
                        package: packageName,
                        recommendedVersion: analysis.recommendedVersion
                    });

                    // Update all projects to use the recommended version
                    for (const [projectPath, updates] of updatesMap) {
                        const packageUpdate = updates.find(u => u.packageName === packageName);
                        if (packageUpdate) {
                            packageUpdate.recommendedVersion = analysis.recommendedVersion;
                        }
                    }
                }
            }

            // Apply updates for each project
            for (const [projectPath, updates] of updatesMap) {
                await this.applyUpdates(updates, projectPath);
            }

            // Rebuild solution
            await this.rebuildSolution(solutionPath);

            this.logger.info('Solution updates completed successfully', { solutionPath });
        } catch (error) {
            this.logger.error('Failed to apply solution updates', error);
            throw error;
        }
    }

    /**
     * Rebuild the solution after updates
     * @param solutionPath Path to the solution file
     */
    private async rebuildSolution(solutionPath: string): Promise<void> {
        try {
            this.logger.info('Rebuilding solution', { solutionPath });
            
            await new Promise<void>((resolve, reject) => {
                exec(
                    `dotnet build "${solutionPath}"`,
                    (error: Error | null) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            });

            this.logger.info('Solution rebuilt successfully');
        } catch (error) {
            this.logger.error('Failed to rebuild solution', { solutionPath, error });
            throw error;
        }
    }

    /**
     * Update a specific package with detailed error reporting
     * @param packageName Name of the package
     * @param version Version to update to
     * @param projectPath Path to the project directory
     */
    public async updatePackageWithDetails(packageName: string, version: string, projectPath: string): Promise<void> {
        try {
            this.logger.info('Updating package with detailed monitoring', { package: packageName, version, projectPath });
            
            // Update package using dotnet CLI with more detailed output
            await new Promise<void>((resolve, reject) => {
                const { exec } = require('child_process');
                const command = `dotnet add "${projectPath}" package ${packageName} --version ${version}`;
                
                exec(command, { cwd: path.dirname(projectPath) }, (error: Error | null, stdout: string, stderr: string) => {
                    if (error) {
                        this.logger.error('Package update failed with detailed info', {
                            package: packageName,
                            version,
                            projectPath,
                            command,
                            stdout,
                            stderr,
                            error: error.message
                        });
                        
                        // Create enhanced error with more context
                        const enhancedError = new Error(`${error.message}\nCommand: ${command}\nStdout: ${stdout}\nStderr: ${stderr}`);
                        reject(enhancedError);
                    } else {
                        this.logger.info('Package updated successfully with details', { 
                            package: packageName, 
                            version,
                            stdout: stdout.trim(),
                            stderr: stderr.trim() 
                        });
                        resolve();
                    }
                });
            });

            this.logger.info('Package updated successfully', { package: packageName, version });
        } catch (error) {
            this.logger.error('Failed to update package', { package: packageName, version, error });
            throw error;
        }
    }
} 