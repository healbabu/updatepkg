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
            await new Promise((resolve, reject) => {
                const { exec } = require('child_process');
                const command = `dotnet add "${projectPath}" package ${packageName} --version ${version}`;
                exec(command, { cwd: path.dirname(projectPath) }, async (error, stdout, stderr) => {
                    if (error) {
                        this.logger.error('Package update failed', {
                            package: packageName,
                            version,
                            projectPath,
                            command,
                            stdout,
                            stderr,
                            error: error.message
                        });
                        // Parse error with basic classification
                        const basicError = this.parseUpdateError(stderr, stdout, error.message);
                        // ✅ ENHANCED: Get AI analysis for ANY package update error
                        const enhancedError = await this.enhanceErrorWithAI(basicError, {
                            command,
                            projectPath,
                            packageName,
                            version
                        });
                        const enhancedErrorObj = new Error(enhancedError.userFriendlyMessage);
                        enhancedErrorObj.details = enhancedError;
                        enhancedErrorObj.rawOutput = { stdout, stderr, command };
                        reject(enhancedErrorObj);
                    }
                    else {
                        this.logger.info('Package updated successfully', { package: packageName, version });
                        resolve();
                    }
                });
            });
        }
        catch (error) {
            this.logger.error('Failed to update package', { package: packageName, version, error });
            throw error;
        }
    }
    /**
     * Parse dotnet CLI error output to extract structured error information
     * @param stderr Standard error output
     * @param stdout Standard output
     * @param originalError Original error message
     * @returns Structured error information
     */
    async parseUpdateError(stderr, stdout, originalError) {
        const combined = `${stderr}\n${stdout}`;
        // Parse NU1107 Version Conflict with enhanced extraction
        if (combined.includes('NU1107')) {
            const conflictMatch = combined.match(/Version conflict detected for (.+?)\. Install\/reference (.+?) directly to project (.+?) to resolve/);
            // Extract all dependency chain lines
            const dependencyChains = [];
            const lines = combined.split('\n');
            for (const line of lines) {
                if (line.includes('->') && (line.includes('>=') || line.includes('<'))) {
                    dependencyChains.push(line.trim());
                }
            }
            const conflictingPackage = conflictMatch ? conflictMatch[1] : 'Unknown package';
            const recommendedVersion = conflictMatch ? conflictMatch[2] : '';
            const affectedProject = conflictMatch ? conflictMatch[3] : '';
            const conflictDetails = {
                conflictingPackage,
                requiredVersions: [recommendedVersion],
                dependencyChains: dependencyChains.length > 0 ? dependencyChains : [
                    `Multiple dependency paths require different versions of ${conflictingPackage}`
                ]
            };
            // Start with basic recommendations (will be replaced by AI if available)
            let recommendations = [
                `Add explicit reference: dotnet add "${affectedProject}" package ${conflictingPackage} --version ${recommendedVersion}`,
                'Update related packages to compatible versions',
                'Review project references and consolidate package versions'
            ];
            return {
                type: 'version_conflict',
                userFriendlyMessage: `Version conflict detected for ${conflictingPackage}`,
                technicalDetails: combined,
                conflictDetails,
                recommendations
            };
        }
        // Parse NU1102 Package Not Found
        if (combined.includes('NU1102')) {
            return {
                type: 'not_found',
                userFriendlyMessage: 'Package not found or network connectivity issue',
                technicalDetails: combined,
                recommendations: [
                    'Check internet connection',
                    'Verify package name and version',
                    'Check NuGet package sources configuration',
                    'Try: dotnet nuget list source'
                ]
            };
        }
        // Parse NU1605 Downgrade Error
        if (combined.includes('NU1605')) {
            return {
                type: 'downgrade',
                userFriendlyMessage: 'Package downgrade detected - higher version already installed',
                technicalDetails: combined,
                recommendations: [
                    'Remove existing package first: dotnet remove package <PackageName>',
                    'Then install desired version: dotnet add package <PackageName> --version <Version>',
                    'Check if newer version is required by other dependencies'
                ]
            };
        }
        // Parse Restore Failures
        if (combined.includes('restore') && combined.includes('failed')) {
            return {
                type: 'restore_failed',
                userFriendlyMessage: 'Package restore failed',
                technicalDetails: combined,
                recommendations: [
                    'Run: dotnet restore --verbosity diagnostic',
                    'Clear NuGet cache: dotnet nuget locals all --clear',
                    'Check package sources and authentication',
                    'Verify project file syntax'
                ]
            };
        }
        // Default case
        return {
            type: 'unknown',
            userFriendlyMessage: originalError,
            technicalDetails: combined,
            recommendations: [
                'Check the detailed error output above',
                'Run: dotnet restore --verbosity diagnostic',
                'Verify project file and package sources'
            ]
        };
    }
    // ============================================================================
    // 🚀 NEW ENHANCEMENT METHODS
    // ============================================================================
    /**
     * ✅ ENHANCED: Generic error enhancement for ANY error
     */
    async enhanceErrorWithAI(basicError, commandContext) {
        this.logger.info('🤖 Requesting AI analysis for dotnet error', {
            errorType: basicError.type,
            command: commandContext.command
        });
        try {
            const aiAnalysis = await this.copilotService.analyzeAnyDotnetError(basicError.technicalDetails, commandContext);
            // ✅ Enhanced error structure with AI insights
            return {
                ...basicError,
                aiAnalysis: {
                    errorType: aiAnalysis.errorType,
                    severity: aiAnalysis.severity,
                    summary: aiAnalysis.summary,
                    rootCause: aiAnalysis.rootCause,
                    quickFix: aiAnalysis.quickFix
                },
                recommendations: aiAnalysis.recommendations, // Replace with AI recommendations
                aiEnhanced: true
            };
        }
        catch (aiError) {
            this.logger.warn('AI analysis failed, using basic error', aiError);
            return basicError;
        }
    }
    /**
     * ✅ ENHANCED: Update validation to use generic AI analysis
     */
    async validateSolutionAfterUpdates(solutionPath) {
        try {
            this.logger.info('🔍 Validating solution after updates', { solutionPath });
            const result = await this.executeCommandWithOutput('dotnet restore', path.dirname(solutionPath));
            if (result.success) {
                this.logger.info('✅ Solution validation successful');
            }
            else {
                this.logger.warn('❌ Solution validation failed', { stderr: result.stderr, stdout: result.stdout });
                // Parse error with basic classification
                const basicError = this.parseUpdateError(result.stderr, result.stdout, 'Solution validation failed');
                // ✅ ENHANCED: Get AI analysis for ANY error type
                const enhancedError = await this.enhanceErrorWithAI(basicError, {
                    command: 'dotnet restore',
                    solutionPath: solutionPath
                });
                const error = new Error('Solution validation failed');
                error.details = enhancedError;
                throw error;
            }
        }
        catch (error) {
            this.logger.error('Solution validation error', error);
            throw error;
        }
    }
    /**
     * ✅ ENHANCEMENT 2: Enhanced version conflict analysis including transitive dependencies
     * @param updatesMap Map of project paths to their package updates
     * @returns Map of package names to their conflict analysis
     */
    async checkForTransitiveDependencyConflicts(updatesMap) {
        const conflicts = new Map();
        this.logger.info('🤖 AI Agent analyzing transitive dependency conflicts', {
            projectCount: updatesMap.size,
            totalUpdates: Array.from(updatesMap.values()).reduce((sum, updates) => sum + updates.length, 0)
        });
        // For each project being updated
        for (const [projectPath, updates] of updatesMap) {
            this.logger.info('🔍 Analyzing transitive dependencies for project', { projectPath, updateCount: updates.length });
            for (const update of updates) {
                try {
                    // Get transitive dependencies for this package
                    const transitiveDeps = await this.getTransitiveDependencies(update.packageName, update.recommendedVersion, projectPath);
                    // Get existing packages in this project
                    const existingDeps = await this.getPackageReferences(projectPath);
                    // Check for conflicts with existing packages
                    for (const [depName, depVersion] of transitiveDeps) {
                        const existing = existingDeps.find(d => d.name === depName);
                        if (existing && this.hasVersionConflict(existing.version, depVersion)) {
                            this.logger.info('🤖 AI Agent detected transitive dependency conflict', {
                                package: depName,
                                existingVersion: existing.version,
                                transitiveDependencyVersion: depVersion,
                                sourceUpdate: update.packageName
                            });
                            // Use AI to analyze this conflict
                            const analysis = await this.versionConflictAnalyzer.analyzeVersionConflict(depName, [
                                { path: projectPath, version: existing.version, dependencies: new Map() },
                                { path: `${update.packageName} (transitive)`, version: depVersion, dependencies: new Map() }
                            ]);
                            conflicts.set(depName, analysis);
                            this.logger.info('🤖 AI Agent conflict analysis completed', {
                                package: depName,
                                recommendedVersion: analysis.recommendedVersion,
                                reasoning: analysis.reasoning
                            });
                        }
                    }
                }
                catch (error) {
                    this.logger.warn('Failed to analyze transitive dependencies for package', {
                        package: update.packageName,
                        projectPath,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
        this.logger.info('🤖 AI Agent transitive dependency analysis completed', {
            conflictsFound: conflicts.size,
            conflictingPackages: Array.from(conflicts.keys())
        });
        return conflicts;
    }
    /**
     * ✅ ENHANCEMENT 3: Get transitive dependencies for a package using dotnet CLI
     * @param packageName Name of the package
     * @param version Version of the package
     * @param projectPath Path to the project (for context)
     * @returns Map of dependency names to their versions
     */
    async getTransitiveDependencies(packageName, version, projectPath) {
        try {
            this.logger.info('🔍 Getting transitive dependencies', { package: packageName, version, projectPath });
            // Create a temporary project to analyze dependencies
            const tempDir = path.join(path.dirname(projectPath), '.temp-dependency-analysis');
            const tempProject = path.join(tempDir, 'temp.csproj');
            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            // Create minimal project file
            const projectContent = `<Project Sdk="Microsoft.NET.Sdk">
                <PropertyGroup>
                    <TargetFramework>net8.0</TargetFramework>
                </PropertyGroup>
                <ItemGroup>
                    <PackageReference Include="${packageName}" Version="${version}" />
                </ItemGroup>
            </Project>`;
            fs.writeFileSync(tempProject, projectContent);
            // Run dotnet list package --include-transitive
            const result = await this.executeCommandWithOutput('dotnet list package --include-transitive', tempDir);
            const dependencies = new Map();
            if (result.success) {
                const lines = result.stdout.split('\n');
                let inTransitiveSection = false;
                for (const line of lines) {
                    if (line.includes('Transitive packages')) {
                        inTransitiveSection = true;
                        continue;
                    }
                    if (inTransitiveSection && line.trim().startsWith('>')) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 3) {
                            const depName = parts[1];
                            const depVersion = parts[2];
                            dependencies.set(depName, depVersion);
                        }
                    }
                }
            }
            // Cleanup temp directory
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            catch (cleanupError) {
                this.logger.warn('Failed to cleanup temp directory', { tempDir, error: cleanupError });
            }
            this.logger.info('🔍 Transitive dependencies retrieved', {
                package: packageName,
                dependencyCount: dependencies.size,
                dependencies: Array.from(dependencies.entries()).slice(0, 5) // Log first 5 for brevity
            });
            return dependencies;
        }
        catch (error) {
            this.logger.error('Failed to get transitive dependencies', { package: packageName, error });
            return new Map();
        }
    }
    /**
     * Check if two versions have a conflict (simplified semantic version comparison)
     * @param existingVersion Current version
     * @param newVersion New version being introduced
     * @returns True if there's a potential conflict
     */
    hasVersionConflict(existingVersion, newVersion) {
        try {
            // Simple major version conflict detection
            const existingMajor = parseInt(existingVersion.split('.')[0]);
            const newMajor = parseInt(newVersion.split('.')[0]);
            // Major version differences are likely to cause conflicts
            const hasMajorConflict = existingMajor !== newMajor;
            if (hasMajorConflict) {
                this.logger.info('Potential version conflict detected', {
                    existing: existingVersion,
                    new: newVersion,
                    existingMajor,
                    newMajor
                });
            }
            return hasMajorConflict;
        }
        catch (error) {
            this.logger.warn('Failed to parse versions for conflict detection', {
                existingVersion,
                newVersion,
                error
            });
            return false;
        }
    }
    /**
     * Execute a command and return detailed output
     * @param command Command to execute
     * @param workingDirectory Working directory
     * @returns Promise with success status and output
     */
    async executeCommandWithOutput(command, workingDirectory) {
        return new Promise((resolve) => {
            (0, child_process_1.exec)(command, { cwd: workingDirectory }, (error, stdout, stderr) => {
                resolve({
                    success: !error,
                    stdout: stdout || '',
                    stderr: stderr || ''
                });
            });
        });
    }
    /**
     * 🤖 AI-powered conflict detection - completely generic
     */
    async detectAdvancedConflicts(updatesMap) {
        this.logger.info('🤖 AI Agent analyzing advanced version conflicts...');
        const conflicts = new Map();
        try {
            const dependencyState = await this.buildSimpleDependencyState(updatesMap);
            const aiAnalysis = await this.copilotService.analyzeAdvancedConflicts(dependencyState, Array.from(updatesMap.values()).flat());
            // ✅ FIX: Use only valid VersionConflictAnalysis properties
            for (const analysis of aiAnalysis) {
                if (analysis.package) {
                    conflicts.set(analysis.package, {
                        packageName: analysis.package,
                        currentVersions: ['unknown'],
                        recommendedVersion: 'latest',
                        reasoning: analysis.conflict || 'Version conflict detected',
                        migrationSteps: ['Update package reference'],
                        breakingChanges: [],
                        compatibilityNotes: [],
                        testImpact: []
                    });
                }
            }
        }
        catch (error) {
            this.logger.error('Advanced conflict analysis failed', error);
        }
        return conflicts;
    }
    /**
     * 📊 Build comprehensive dependency state for AI analysis
     */
    async buildSimpleDependencyState(updatesMap) {
        const context = {
            projects: [],
            proposedUpdates: Array.from(updatesMap.values()).flat()
        };
        for (const [projectPath, updates] of updatesMap) {
            try {
                const directPackages = await this.getDirectPackageReferences(projectPath);
                context.projects.push({
                    path: projectPath,
                    directPackages: Array.from(directPackages.entries()),
                    proposedUpdates: updates
                });
            }
            catch (error) {
                this.logger.warn('Failed to analyze project dependencies', { projectPath, error });
            }
        }
        return context;
    }
    /**
     * 📦 Get current packages in project (generic implementation)
     */
    async getCurrentPackages(projectPath) {
        return new Promise((resolve) => {
            const packages = new Map();
            (0, child_process_1.exec)(`dotnet list "${projectPath}" package`, (error, stdout) => {
                if (error) {
                    this.logger.warn('Failed to get current packages', { projectPath, error });
                    resolve(packages);
                    return;
                }
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('>')) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 3) {
                            packages.set(parts[1], parts[2]);
                        }
                    }
                }
                resolve(packages);
            });
        });
    }
    /**
     * 🔗 Get direct package references (generic)
     */
    async getDirectPackageReferences(projectPath) {
        const packages = new Map();
        try {
            const fs = require('fs');
            const content = fs.readFileSync(projectPath, 'utf-8');
            const packageRefRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
            let match;
            while ((match = packageRefRegex.exec(content)) !== null) {
                packages.set(match[1], match[2]);
            }
        }
        catch (error) {
            this.logger.warn('Failed to read package references', { projectPath, error });
        }
        return packages;
    }
    // ✅ SIMPLE VERSION: Basic validation without complex types
    async validateUpdatePlan(strategy) {
        this.logger.info('Validating update plan', { phases: strategy.phases?.length || 0 });
        const issues = [];
        try {
            // Simple validation - check if packages exist
            for (const phase of strategy.phases || []) {
                for (const update of phase.packageUpdates || []) {
                    // Basic package name validation
                    if (!update.packageName || update.packageName.trim() === '') {
                        issues.push({
                            severity: 'critical',
                            message: 'Invalid package name found'
                        });
                    }
                }
            }
        }
        catch (error) {
            this.logger.warn('Validation failed', error);
        }
        return {
            canProceed: issues.filter(i => i.severity === 'critical').length === 0,
            warnings: issues.filter(i => i.severity === 'warning'),
            blockers: issues.filter(i => i.severity === 'critical'),
            recommendations: ['Run dotnet restore after updates', 'Test your solution thoroughly']
        };
    }
}
exports.PackageUpgrader = PackageUpgrader;
//# sourceMappingURL=packageUpgrader.js.map