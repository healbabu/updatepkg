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
exports.PackageUpgrader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const copilotService_1 = require("./copilotService");
const configurationManager_1 = require("./configurationManager");
const breakingChangeHandler_1 = require("./breakingChangeHandler");
const versionConflictAnalyzer_1 = require("./versionConflictAnalyzer");
/**
 * Service for managing package upgrades
 */
class PackageUpgrader {
    constructor(logger, suggestionMode = 'standard') {
        this.logger = logger;
        this.copilotService = new copilotService_1.CopilotService(logger);
        this.configManager = new configurationManager_1.ConfigurationManager();
        this.breakingChangeHandler = new breakingChangeHandler_1.BreakingChangeHandler(logger);
        this.versionConflictAnalyzer = new versionConflictAnalyzer_1.VersionConflictAnalyzer(logger, this.copilotService);
        this.suggestionMode = suggestionMode;
    }
    /**
     * Check for available package updates
     * @param projectPath Path to the project directory or .csproj file
     * @returns Array of package updates
     */
    async checkForUpdates(projectPath) {
        try {
            this.logger.info('Checking for package updates', { projectPath, mode: this.suggestionMode });
            if (this.suggestionMode === 'standard') {
                this.logger.info('Using standard mode: dotnet CLI for outdated packages', { projectPath });
                return await this.getOutdatedPackagesStandard(projectPath);
            }
            else {
                this.logger.info('Using enterprise mode: AI agent/enterprise service for suggestions', { projectPath });
                return await this.getOutdatedPackagesEnterprise(projectPath);
            }
        }
        catch (error) {
            this.logger.error('Failed to check for updates', error);
            throw error;
        }
    }
    /**
     * Get outdated packages using dotnet CLI (standard mode)
     */
    async getOutdatedPackagesStandard(projectPath) {
        this.logger.info('Invoking dotnet CLI to list outdated packages', { projectPath });
        return new Promise((resolve) => {
            const projectFile = this.resolveProjectFile(projectPath);
            const isSolution = projectFile.endsWith('.sln');
            const cmd = isSolution
                ? `dotnet list "${projectFile}" package --outdated`
                : `dotnet list "${projectFile}" package --outdated`;
            this.logger.info('Running command', { cmd });
            (0, child_process_1.exec)(cmd, (error, stdout) => {
                if (error) {
                    this.logger.warn('Failed to get outdated packages', { error });
                    resolve([]);
                    return;
                }
                this.logger.info('Parsing dotnet CLI output for outdated packages');
                const updates = [];
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
    async getOutdatedPackagesEnterprise(projectPath) {
        this.logger.info('Invoking enterprise/AI agent for package suggestions', { projectPath });
        // TODO: Implement enterprise service logic here
        return [];
    }
    /**
     * Apply package updates
     * @param updates Array of package updates to apply
     * @param projectPath Path to the project directory
     */
    async applyUpdates(updates, projectPath) {
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
                await this.updatePackage(update.packageName, update.recommendedVersion, projectPath);
                if (update.hasBreakingChanges && this.configManager.copilotAgentConfig.enabled) {
                    this.logger.info('Invoking AI agent to handle breaking changes', { package: update.packageName, version: update.recommendedVersion });
                    await this.breakingChangeHandler.handleBreakingChanges(update.packageName, update.recommendedVersion, projectPath);
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
                    }
                    else {
                        this.logger.info('All tests passed after update', { package: update.packageName, version: update.recommendedVersion });
                    }
                }
            }
            this.logger.info('Package updates applied successfully', { projectPath });
        }
        catch (error) {
            this.logger.error('Failed to apply updates', error);
            throw error;
        }
    }
    /**
     * Resolve the project file path from a directory or .csproj file
     * @param projectPath Path to the project directory or .csproj file
     * @returns The .csproj file path
     */
    resolveProjectFile(projectPath) {
        if (fs.existsSync(projectPath)) {
            const stat = fs.statSync(projectPath);
            if (stat.isDirectory()) {
                const files = fs.readdirSync(projectPath).filter((file) => file.endsWith('.csproj'));
                if (files.length === 0) {
                    throw new Error('No project file found');
                }
                return path.join(projectPath, files[0]);
            }
            else if (projectPath.endsWith('.csproj')) {
                return projectPath;
            }
        }
        throw new Error('Invalid project path');
    }
    /**
     * Get project information
     * @param projectPath Path to the project directory or .csproj file
     */
    async getProjectInfo(projectPath) {
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
    async getPackageReferences(projectPath) {
        const projectFile = this.resolveProjectFile(projectPath);
        const content = fs.readFileSync(projectFile, 'utf8');
        const packageRefs = [];
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
    async updatePackage(packageName, version, projectPath) {
        try {
            this.logger.info('Updating package', { package: packageName, version });
            // Update package using dotnet CLI
            await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(`dotnet add ${projectPath} package ${packageName} --version ${version}`, (error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve();
                    }
                });
            });
            this.logger.info('Package updated successfully', { package: packageName, version });
        }
        catch (error) {
            this.logger.error('Failed to update package', { package: packageName, version, error });
            throw error;
        }
    }
    /**
     * Get all projects in a solution
     * @param solutionPath Path to the solution file
     * @returns Array of project paths
     */
    async getSolutionProjects(solutionPath) {
        try {
            this.logger.info('Getting projects from solution', { solutionPath });
            // Read solution file
            const content = fs.readFileSync(solutionPath, 'utf8');
            const projectRegex = /Project\("([^"]+)"\)\s*=\s*"([^"]+)",\s*"([^"]+)"/g;
            const projects = [];
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
        }
        catch (error) {
            this.logger.error('Failed to get solution projects', { solutionPath, error });
            return [];
        }
    }
    /**
     * Check for updates across all projects in a solution
     * @param solutionPath Path to the solution file
     * @returns Map of project paths to their updates
     */
    async checkForUpdatesInSolution(solutionPath) {
        try {
            this.logger.info('Checking for updates in solution', { solutionPath });
            const projects = await this.getSolutionProjects(solutionPath);
            const updatesMap = new Map();
            for (const projectPath of projects) {
                const updates = await this.checkForUpdates(projectPath);
                if (updates.length > 0) {
                    updatesMap.set(projectPath, updates);
                }
            }
            return updatesMap;
        }
        catch (error) {
            this.logger.error('Failed to check for updates in solution', { solutionPath, error });
            throw error;
        }
    }
    /**
     * Check for version conflicts across projects
     * @param updatesMap Map of project paths to their package updates
     * @returns Map of package names to their conflict analysis
     */
    async checkForVersionConflicts(updatesMap) {
        const conflicts = new Map();
        const packageVersions = new Map();
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
                const analysis = await this.versionConflictAnalyzer.analyzeVersionConflict(packageName, versions);
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
    async applyUpdatesInSolution(updatesMap, solutionPath) {
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
        }
        catch (error) {
            this.logger.error('Failed to apply solution updates', error);
            throw error;
        }
    }
    /**
     * Rebuild the solution after updates
     * @param solutionPath Path to the solution file
     */
    async rebuildSolution(solutionPath) {
        try {
            this.logger.info('Rebuilding solution', { solutionPath });
            await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(`dotnet build "${solutionPath}"`, (error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve();
                    }
                });
            });
            this.logger.info('Solution rebuilt successfully');
        }
        catch (error) {
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
    async updatePackageWithDetails(packageName, version, projectPath) {
        try {
            this.logger.info('Updating package with detailed monitoring', { package: packageName, version, projectPath });
            // Update package using dotnet CLI with more detailed output
            await new Promise((resolve, reject) => {
                const { exec } = require('child_process');
                const command = `dotnet add "${projectPath}" package ${packageName} --version ${version}`;
                exec(command, { cwd: path.dirname(projectPath) }, (error, stdout, stderr) => {
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
                    }
                    else {
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
        }
        catch (error) {
            this.logger.error('Failed to update package', { package: packageName, version, error });
            throw error;
        }
    }
}
exports.PackageUpgrader = PackageUpgrader;
//# sourceMappingURL=packageUpgrader.js.map