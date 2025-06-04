import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Logger } from '../utils/logger';
import { CopilotService } from './copilotService';

export interface SimplePackageUpdate {
    packageName: string;
    currentVersion: string;
    recommendedVersion: string;
    projectPath: string;
}

export interface SimpleUpgradeStrategy {
    name: string;
    description: string;
    packages: SimplePackageUpdate[];
    aiReasoning: string;
}

export interface UpgradeResult {
    package: string;
    success: boolean;
    error?: string;
    aiRecommendation?: string;
}

/**
 * Simplified Package Upgrader - Focus on outdated packages only
 */
export class SimplePackageUpgrader {
    private logger: Logger;
    private copilotService: CopilotService;
    private solutionDirectory: string = '';
    
    // Progress callback
    public onProgress?: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

    constructor(logger: Logger) {
        this.logger = logger;
        this.copilotService = new CopilotService(logger);
    }

    /**
     * Emit progress update
     */
    private emitProgress(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
        this.logger.info(message);
        if (this.onProgress) {
            this.onProgress(message, type);
        }
    }

    /**
     * 🎯 Enhanced upgrade flow with progress reporting
     */
    async upgradePackages(solutionPath: string): Promise<{
        results: UpgradeResult[];
        restoreErrors: string[];
        aiStrategy: SimpleUpgradeStrategy;
    }> {
        try {
            // Store solution directory for later use
            this.solutionDirectory = path.dirname(solutionPath);
            this.emitProgress(`📂 Working in: ${this.solutionDirectory}`);

            // Step 0: Ensure solution is restored first
            this.emitProgress('🔄 Ensuring solution is restored...');
            await this.ensureSolutionRestored(solutionPath);

            // Step 1: Diagnose the solution
            this.emitProgress('🔍 Analyzing solution structure...');
            const projects = await this.getSolutionProjects(solutionPath);
            
            if (projects.length === 0) {
                throw new Error('No projects found in solution');
            }
            
            this.emitProgress(`📂 Found ${projects.length} projects in solution`, 'success');

            // Step 2: Try multiple approaches to find packages
            this.emitProgress('📦 Scanning for outdated packages...');
            let outdatedPackages: SimplePackageUpdate[] = [];

            // Approach 1: Solution-level check
            this.emitProgress('📦 Trying solution-level package scan...');
            outdatedPackages = await this.tryGetOutdatedFromSolution(solutionPath);
            
            // Approach 2: Individual project checks
            if (outdatedPackages.length === 0) {
                this.emitProgress('📦 Scanning individual projects...', 'warning');
                outdatedPackages = await this.tryGetOutdatedFromProjectFiles(projects, this.solutionDirectory);
            }

            // Approach 3: Direct project file analysis
            if (outdatedPackages.length === 0) {
                this.emitProgress('📦 Analyzing project files directly...', 'warning');
                outdatedPackages = await this.analyzeProjectFilesDirectly(projects, this.solutionDirectory);
            }

            if (outdatedPackages.length === 0) {
                this.emitProgress('✅ All packages are up to date!', 'success');
                return { 
                    results: [], 
                    restoreErrors: [], 
                    aiStrategy: { 
                        name: 'No Updates Required', 
                        description: 'All packages are up to date or no packages found', 
                        packages: [], 
                        aiReasoning: 'No outdated packages detected after trying multiple approaches'
                    } 
                };
            }

            // Fix project paths to be full paths
            outdatedPackages = this.normalizeProjectPaths(outdatedPackages);

            this.emitProgress(`📦 Found ${outdatedPackages.length} packages that need updating`, 'success');
            
            // Step 3: Generate AI strategy
            this.emitProgress('🤖 Generating AI-powered upgrade strategy...');
            const aiStrategy = await this.getAIUpgradeStrategy(outdatedPackages);
            this.emitProgress(`🎯 Strategy: ${aiStrategy.name}`, 'success');

            // Step 4: Execute upgrades
            this.emitProgress(`⬆️ Starting upgrade of ${aiStrategy.packages.length} packages...`);
            const results: UpgradeResult[] = [];
            
            for (let i = 0; i < aiStrategy.packages.length; i++) {
                const update = aiStrategy.packages[i];
                const progress = `(${i + 1}/${aiStrategy.packages.length})`;
                
                try {
                    this.emitProgress(`⬆️ ${progress} Upgrading ${update.packageName} to ${update.recommendedVersion}...`);
                    await this.upgradePackage(update.packageName, update.recommendedVersion, update.projectPath);
                    results.push({ 
                        package: update.packageName, 
                        success: true
                    });
                    this.emitProgress(`✅ ${progress} Successfully upgraded ${update.packageName}`, 'success');
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    results.push({ 
                        package: update.packageName, 
                        success: false, 
                        error: errorMessage
                    });
                    this.emitProgress(`❌ ${progress} Failed to upgrade ${update.packageName}: ${errorMessage}`, 'error');
                }
            }

            // Step 5: Run restore
            this.emitProgress('🔄 Running dotnet restore...');
            const restoreErrors = await this.runRestoreAndCaptureErrors(solutionPath);
            
            if (restoreErrors.length === 0) {
                this.emitProgress('✅ dotnet restore completed successfully', 'success');
            } else {
                this.emitProgress(`⚠️ dotnet restore completed with ${restoreErrors.length} errors`, 'warning');
            }

            const successCount = results.filter(r => r.success).length;
            const failureCount = results.filter(r => !r.success).length;
            
            this.emitProgress(`🎉 Upgrade completed! ${successCount} successful, ${failureCount} failed`, 
                failureCount === 0 ? 'success' : 'warning');

            return { results, restoreErrors, aiStrategy };

        } catch (error) {
            this.emitProgress(`💥 Package upgrade failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
            this.logger.error('Package upgrade failed', error);
            throw error;
        }
    }

    /**
     * Normalize project paths to full paths
     */
    private normalizeProjectPaths(packages: SimplePackageUpdate[]): SimplePackageUpdate[] {
        return packages.map(pkg => {
            let normalizedPath = pkg.projectPath;
            
            // If it's just a project name or relative path, convert to full path
            if (!path.isAbsolute(normalizedPath)) {
                if (normalizedPath.endsWith('.csproj')) {
                    // It's already a relative .csproj path
                    normalizedPath = path.join(this.solutionDirectory, normalizedPath);
                } else {
                    // It's just a project name, construct the .csproj path
                    const projectName = path.basename(normalizedPath);
                    normalizedPath = path.join(this.solutionDirectory, normalizedPath, `${projectName}.csproj`);
                }
            }
            
            this.logger.info(`📂 Normalized path: "${pkg.projectPath}" -> "${normalizedPath}"`);
            
            return {
                ...pkg,
                projectPath: normalizedPath
            };
        });
    }

    /**
     * Ensure solution is restored before checking packages
     */
    private async ensureSolutionRestored(solutionPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const cmd = `dotnet restore "${solutionPath}"`;
            this.emitProgress(`🔄 Running: ${cmd}`);
            
            exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
                if (error) {
                    this.emitProgress(`⚠️ Solution restore had issues: ${error.message}`, 'warning');
                } else {
                    this.emitProgress('✅ Solution restored successfully', 'success');
                }
                resolve(); // Continue even if restore fails
            });
        });
    }

    /**
     * Get clean list of solution projects
     */
    private async getSolutionProjects(solutionPath: string): Promise<string[]> {
        return new Promise((resolve) => {
            const cmd = `dotnet sln "${solutionPath}" list`;
            this.logger.info(`🔍 Getting clean project list: ${cmd}`);
            
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    this.logger.warn('Failed to get project list', error);
                    resolve([]);
                    return;
                }

                const projects = stdout.split('\n')
                    .map(line => line.trim().replace('\r', ''))
                    .filter(line => 
                        line && 
                        !line.includes('Project(s)') && 
                        !line.includes('--------') &&
                        line.endsWith('.csproj')
                    );

                this.logger.info(`🔍 Clean project list (${projects.length} projects):`, projects);
                resolve(projects);
            });
        });
    }

    /**
     * Try to get outdated packages from individual project files
     */
    private async tryGetOutdatedFromProjectFiles(
        projects: string[], 
        solutionDir: string
    ): Promise<SimplePackageUpdate[]> {
        this.logger.info(`📦 Checking ${projects.length} individual projects for outdated packages`);
        
        const allUpdates: SimplePackageUpdate[] = [];
        
        for (const project of projects) {
            const fullProjectPath = path.join(solutionDir, project);
            this.logger.info(`📦 Checking project: ${fullProjectPath}`);
            
            const updates = await this.getOutdatedPackagesFromProject(fullProjectPath);
            if (updates.length > 0) {
                this.logger.info(`📦 Found ${updates.length} outdated packages in ${project}`);
                allUpdates.push(...updates);
            }
        }
        
        return allUpdates;
    }

    /**
     * Get outdated packages from a single project
     */
    private async getOutdatedPackagesFromProject(projectPath: string): Promise<SimplePackageUpdate[]> {
        return new Promise((resolve) => {
            const cmd = `dotnet list "${projectPath}" package --outdated`;
            
            exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
                this.logger.info(`📦 Project ${path.basename(projectPath)} outdated check:`, { 
                    error: error?.message, 
                    stderr: stderr?.substring(0, 200), 
                    stdout: stdout?.substring(0, 500)
                });
                
                if (error) {
                    resolve([]);
                    return;
                }

                const updates = this.parseOutdatedPackagesOutput(stdout, projectPath);
                resolve(updates);
            });
        });
    }

    /**
     * Analyze project files directly to find package references
     */
    private async analyzeProjectFilesDirectly(
        projects: string[], 
        solutionDir: string
    ): Promise<SimplePackageUpdate[]> {
        this.logger.info('📦 Analyzing project files directly for package references...');
        
        const allPackages: SimplePackageUpdate[] = [];
        
        for (const project of projects) {
            const fullProjectPath = path.join(solutionDir, project);
            
            try {
                const projectContent = await fs.promises.readFile(fullProjectPath, 'utf8');
                const packages = this.extractPackageReferencesFromProject(projectContent, fullProjectPath);
                
                if (packages.length > 0) {
                    this.logger.info(`📦 Found ${packages.length} package references in ${project}:`, 
                        packages.map(p => `${p.packageName}@${p.currentVersion}`));
                    
                    // For direct analysis, we'll mark them as potentially outdated
                    // This is a fallback approach when dotnet commands don't work
                    allPackages.push(...packages.map(pkg => ({
                        ...pkg,
                        recommendedVersion: 'latest' // We'll let the upgrade process figure out the latest
                    })));
                }
            } catch (error) {
                this.logger.warn(`Failed to read project file ${project}:`, error);
            }
        }
        
        return allPackages;
    }

    /**
     * Extract package references from project file content
     */
    private extractPackageReferencesFromProject(
        projectContent: string, 
        projectPath: string
    ): SimplePackageUpdate[] {
        const packages: SimplePackageUpdate[] = [];
        
        // Look for PackageReference elements
        const packageRefRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
        let match;
        
        while ((match = packageRefRegex.exec(projectContent)) !== null) {
            const packageName = match[1];
            const version = match[2];
            
            packages.push({
                packageName,
                currentVersion: version,
                recommendedVersion: 'latest', // Will be determined later
                projectPath
            });
        }
        
        return packages;
    }

    /**
     * Try to get outdated packages from solution file
     */
    private async tryGetOutdatedFromSolution(solutionPath: string): Promise<SimplePackageUpdate[]> {
        return new Promise((resolve) => {
            const cmd = `dotnet list "${solutionPath}" package --outdated`;
            this.logger.info(`📦 Trying solution-level outdated check: ${cmd}`);
            
            exec(cmd, { 
                cwd: path.dirname(solutionPath),
                timeout: 60000 
            }, (error, stdout, stderr) => {
                this.logger.info('📦 Solution outdated check result:', { 
                    error: error?.message, 
                    stderr: stderr?.substring(0, 500), 
                    stdout: stdout?.substring(0, 1000)
                });
                
                if (error || !stdout.trim()) {
                    this.logger.warn('Solution-level outdated check failed or returned no output');
                    resolve([]);
                    return;
                }

                const updates = this.parseOutdatedPackagesOutput(stdout);
                this.logger.info(`📦 Solution-level check found ${updates.length} outdated packages`);
                resolve(updates);
            });
        });
    }

    /**
     * Parse outdated packages output with proper project path handling
     */
    private parseOutdatedPackagesOutput(stdout: string, projectPath?: string): SimplePackageUpdate[] {
        const updates: SimplePackageUpdate[] = [];
        const lines = stdout.split('\n');
        let currentProject = projectPath || '';

        this.logger.info(`📦 Parsing output with ${lines.length} lines`);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line) continue;
            
            // Extract project name if not provided (but prefer the provided projectPath)
            if (!projectPath) {
                const projectMatch = line.match(/^Project [`'\"]?(.+?)[`'\"]?\s+has the following updates/) ||
                                   line.match(/Project\s+(.+?)\s+has\s+the\s+following\s+updates/);
                
                if (projectMatch) {
                    currentProject = projectMatch[1];
                    this.logger.info(`📦 Found project with updates: ${currentProject}`);
                    continue;
                }
            }

            // Parse package lines starting with '>' 
            if (line.startsWith('>')) {
                const parts = line.split(/\s+/);
                this.logger.info(`📦 Package line parts (${parts.length}):`, parts);
                
                if (parts.length >= 5) {
                    const packageName = parts[1];
                    const currentVersion = parts[3];
                    const recommendedVersion = parts[4];
                    
                    updates.push({
                        packageName,
                        currentVersion,
                        recommendedVersion,
                        projectPath: currentProject || 'Unknown Project'
                    });
                    
                    this.logger.info(`📦 Added package: ${packageName} ${currentVersion} -> ${recommendedVersion} (${currentProject})`);
                }
            }
        }

        this.logger.info(`📦 Total packages parsed: ${updates.length}`);
        return updates;
    }

    /**
     * Ask AI for intelligent upgrade strategy
     */
    private async getAIUpgradeStrategy(updates: SimplePackageUpdate[]): Promise<SimpleUpgradeStrategy> {
        try {
            const prompt = this.buildUpgradePrompt(updates);

            const aiResponse = await this.copilotService.generateUpgradeStrategy(
                { totalUpdates: updates.length, updates },
                { hasDependencyInfo: false }
            );

            // Parse AI response
            try {
                const strategy = JSON.parse(aiResponse);
                return {
                    name: strategy.name || 'AI Upgrade Strategy',
                    description: strategy.description || 'AI-generated upgrade plan',
                    packages: strategy.packages || updates,
                    aiReasoning: strategy.aiReasoning || 'AI recommendation'
                };
            } catch (parseError) {
                this.logger.warn('Failed to parse AI response, using simple strategy');
                return this.createFallbackStrategy(updates);
            }
        } catch (error) {
            this.logger.warn('AI strategy generation failed, using simple strategy', error);
            return this.createFallbackStrategy(updates);
        }
    }

    /**
     * Build prompt for AI strategy generation
     */
    private buildUpgradePrompt(updates: SimplePackageUpdate[]): string {
        return `You are a .NET package upgrade expert. Analyze these outdated packages and create an intelligent upgrade strategy.

OUTDATED PACKAGES:
${updates.map(u => `- ${u.packageName}: ${u.currentVersion} → ${u.recommendedVersion} (${u.projectPath})`).join('\n')}

STRATEGY REQUIREMENTS:
1. Upgrade Microsoft.* framework packages first
2. Group related packages together  
3. Upgrade dependencies before dependents
4. Consider breaking changes and compatibility
5. Provide clear reasoning for upgrade order

Respond with ONLY a JSON object:
{
  "name": "Strategy Name",
  "description": "Brief description",
  "packages": [
    {
      "packageName": "PackageName",
      "currentVersion": "1.0.0",
      "recommendedVersion": "2.0.0", 
      "projectPath": "Project.csproj"
    }
  ],
  "aiReasoning": "Detailed explanation of upgrade order and reasoning"
}`;
    }

    /**
     * Create fallback strategy when AI is unavailable
     */
    private createFallbackStrategy(updates: SimplePackageUpdate[]): SimpleUpgradeStrategy {
        // Sort: Microsoft packages first, then alphabetically
        const sortedUpdates = [...updates].sort((a, b) => {
            const aMicrosoft = a.packageName.startsWith('Microsoft.');
            const bMicrosoft = b.packageName.startsWith('Microsoft.');
            
            if (aMicrosoft && !bMicrosoft) return -1;
            if (!aMicrosoft && bMicrosoft) return 1;
            
            return a.packageName.localeCompare(b.packageName);
        });

        return {
            name: "Sequential Upgrade Strategy",
            description: `Upgrade ${updates.length} packages sequentially, starting with Microsoft packages`,
            packages: sortedUpdates,
            aiReasoning: "AI unavailable - using fallback strategy that prioritizes Microsoft packages first, then others alphabetically"
        };
    }

    /**
     * Upgrade a single package with proper path resolution
     */
    private async upgradePackage(packageName: string, version: string, projectPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const cmd = `dotnet add "${projectPath}" package ${packageName} --version ${version}`;
            this.logger.info(`⬆️ Upgrading package: ${cmd}`);
            
            // Verify the project file exists
            if (!require('fs').existsSync(projectPath)) {
                const error = `Project file does not exist: ${projectPath}`;
                this.logger.error(error);
                reject(new Error(error));
                return;
            }
            
            exec(cmd, { 
                timeout: 60000,
                cwd: this.solutionDirectory
            }, (error, stdout, stderr) => {
                if (error) {
                    this.logger.error(`Failed to upgrade ${packageName}:`, { 
                        error: error.message, 
                        stderr, 
                        stdout,
                        cmd,
                        projectPath
                    });
                    reject(new Error(`${error.message}\n${stderr}`));
                } else {
                    this.logger.info(`✅ Successfully upgraded ${packageName} in ${path.basename(projectPath)}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Run dotnet restore and capture any errors
     */
    private async runRestoreAndCaptureErrors(solutionPath: string): Promise<string[]> {
        return new Promise((resolve) => {
            const cmd = `dotnet restore "${solutionPath}"`;
            
            exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
                const errors: string[] = [];
                
                if (error) {
                    errors.push(`Restore failed: ${error.message}`);
                }
                
                if (stderr) {
                    const lines = stderr.split('\n');
                    for (const line of lines) {
                        if (line.includes('NU1107') || 
                            line.includes('NU1102') || 
                            line.includes('NU1605') || 
                            line.includes('error') ||
                            line.includes('ERROR')) {
                            errors.push(line.trim());
                        }
                    }
                }

                this.logger.info(`Restore completed with ${errors.length} errors`);
                resolve(errors);
            });
        });
    }
} 