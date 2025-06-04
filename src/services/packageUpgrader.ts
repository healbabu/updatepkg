import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Logger } from '../utils/logger';
import { UpgradeStrategist, PackageUpdate, UpgradeStrategy } from './upgradeStrategist';

export interface UpgradeResult {
    package: string;
    success: boolean;
    error?: string;
    projectPath?: string;
}

export interface UpgradeResults {
    results: UpgradeResult[];
    restoreErrors: string[];
    strategy: UpgradeStrategy;
    summary: string;
}

/**
 * Simple Package Upgrader - Clean and straightforward approach
 */
export class PackageUpgrader {
    private logger: Logger;
    private upgradeStrategist: UpgradeStrategist;
    private solutionDirectory: string = '';
    
    public onProgress?: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

    constructor(logger: Logger) {
        this.logger = logger;
        this.upgradeStrategist = new UpgradeStrategist(logger);
    }

    private emitProgress(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
        this.logger.info(message);
        if (this.onProgress) {
            this.onProgress(message, type);
        }
    }

    /**
     * Simple upgrade flow: discover → upgrade → restore
     */
    async upgradePackages(solutionPath: string): Promise<UpgradeResults> {
        try {
            this.solutionDirectory = path.dirname(solutionPath);
            this.emitProgress(`📂 Working on: ${path.basename(solutionPath)}`);

            // Step 1: Find outdated packages
            this.emitProgress('🔍 Discovering outdated packages...');
            const outdatedPackages = await this.discoverOutdatedPackages(solutionPath);
            
            if (outdatedPackages.length === 0) {
                const message = 'All packages are up to date!';
                this.emitProgress(`✅ ${message}`, 'success');
                return this.createSuccessResults([], [], message);
            }

            this.emitProgress(`📦 Found ${outdatedPackages.length} packages to upgrade`);

            // Step 2: Generate simple strategy (Microsoft first, then others)
            this.emitProgress('🎯 Generating upgrade strategy...');
            const strategy = await this.upgradeStrategist.generateUpgradeStrategy(
                outdatedPackages, 'simple'
            );
            
            this.emitProgress(`📋 Strategy: ${strategy.name}`);

            // Step 3: Upgrade packages
            this.emitProgress('⬆️ Starting package upgrades...');
            const results = await this.upgradePackages_Execute(strategy);

            // Step 4: Restore packages
            this.emitProgress('🔄 Running package restore...');
            const restoreErrors = await this.runRestore(solutionPath);

            const summary = this.generateSummary(results, restoreErrors);
            this.emitProgress(`🎉 ${summary}`, restoreErrors.length === 0 ? 'success' : 'warning');
            
            return { results, restoreErrors, strategy, summary };

        } catch (error) {
            const errorMsg = `Upgrade failed: ${error instanceof Error ? error.message : String(error)}`;
            this.emitProgress(`💥 ${errorMsg}`, 'error');
            throw error;
        }
    }

    /**
     * Discover outdated packages using dotnet CLI
     */
    private async discoverOutdatedPackages(solutionPath: string): Promise<PackageUpdate[]> {
        return new Promise((resolve) => {
            const cmd = `dotnet list "${solutionPath}" package --outdated`;

            exec(cmd, { 
                timeout: 60000, 
                cwd: this.solutionDirectory 
            }, (error, stdout, stderr) => {
                if (error) {
                    this.logger.warn('Failed to get outdated packages', error);
                    resolve([]);
                } else {
                    const packages = this.parseOutdatedOutput(stdout);
                    resolve(packages);
                }
            });
        });
    }

    /**
     * Parse dotnet list output to extract package information
     */
    private parseOutdatedOutput(stdout: string): PackageUpdate[] {
        const packages: PackageUpdate[] = [];
        const lines = stdout.split('\n');
        let currentProject = '';

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Extract project name
            const projectMatch = trimmed.match(/Project [`'\"]?(.+?)[`'\"]?\s+has the following updates/);
            if (projectMatch) {
                currentProject = projectMatch[1];
                continue;
            }

            // Parse package lines (start with '>')
            if (trimmed.startsWith('>')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 5) {
                    packages.push({
                        packageName: parts[1],
                        currentVersion: parts[3],
                        recommendedVersion: parts[4],
                        projectPath: currentProject || 'Unknown Project'
                    });
                }
            }
        }

        return packages;
    }

    /**
     * Execute package upgrades
     */
    private async upgradePackages_Execute(strategy: UpgradeStrategy): Promise<UpgradeResult[]> {
        const results: UpgradeResult[] = [];
        
        // Process all packages from all phases
        const allPackages = strategy.phases.flatMap(phase => phase.packages);
        
        for (let i = 0; i < allPackages.length; i++) {
            const pkg = allPackages[i];
            const progress = `(${i + 1}/${allPackages.length})`;
            
            try {
                this.emitProgress(`⬆️ ${progress} Upgrading ${pkg.packageName} to ${pkg.recommendedVersion}...`);
                
                await this.upgradePackage(pkg);
                
                results.push({
                    package: pkg.packageName,
                    success: true,
                    projectPath: pkg.projectPath
                });
                
                this.emitProgress(`✅ ${progress} ${pkg.packageName} upgraded successfully`);
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                results.push({
                    package: pkg.packageName,
                    success: false,
                    error: errorMessage,
                    projectPath: pkg.projectPath
                });
                
                this.emitProgress(`❌ ${progress} Failed to upgrade ${pkg.packageName}: ${errorMessage}`, 'error');
            }
        }

        return results;
    }

    /**
     * Upgrade a single package
     */
    private async upgradePackage(pkg: PackageUpdate): Promise<void> {
        return new Promise((resolve, reject) => {
            // Build the project path
            let projectPath = pkg.projectPath;
            if (!projectPath.endsWith('.csproj')) {
                projectPath = path.join(this.solutionDirectory, projectPath, `${path.basename(projectPath)}.csproj`);
            }

            // Verify project exists
            if (!fs.existsSync(projectPath)) {
                reject(new Error(`Project file not found: ${projectPath}`));
                return;
            }

            const cmd = `dotnet add "${projectPath}" package ${pkg.packageName} --version ${pkg.recommendedVersion}`;
            
            exec(cmd, { 
                timeout: 60000, 
                cwd: this.solutionDirectory 
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}\n${stderr}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Run dotnet restore
     */
    private async runRestore(solutionPath: string): Promise<string[]> {
        return new Promise((resolve) => {
            const cmd = `dotnet restore "${solutionPath}"`;
            
            exec(cmd, { 
                timeout: 120000, 
                cwd: this.solutionDirectory 
            }, (error, stdout, stderr) => {
                const errors: string[] = [];

                if (error) {
                    errors.push(`Restore failed: ${error.message}`);
                }

                if (stderr) {
                    // Extract real errors (ignore warnings)
                    const lines = stderr.split('\n');
                    for (const line of lines) {
                        if (line.includes('error') || line.includes('ERROR') || line.includes('NU1')) {
                            errors.push(line.trim());
                        }
                    }
                }

                resolve(errors);
            });
        });
    }

    /**
     * Generate summary message
     */
    private generateSummary(results: UpgradeResult[], restoreErrors: string[]): string {
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        let summary = `${successful} packages upgraded successfully`;
        if (failed > 0) {
            summary += `, ${failed} failed`;
        }
        if (restoreErrors.length > 0) {
            summary += `, ${restoreErrors.length} restore errors`;
        }
        
        return summary;
    }

    /**
     * Create success results for no updates case
     */
    private createSuccessResults(results: UpgradeResult[], restoreErrors: string[], message: string): UpgradeResults {
        return {
            results,
            restoreErrors,
            strategy: {
                name: 'No Updates Required',
                description: message,
                phases: [],
                aiReasoning: message
            },
            summary: message
        };
    }
} 