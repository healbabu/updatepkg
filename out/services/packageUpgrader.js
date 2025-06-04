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
const upgradeStrategist_1 = require("./upgradeStrategist");
/**
 * Simple Package Upgrader - Clean and straightforward approach
 */
class PackageUpgrader {
    constructor(logger) {
        this.solutionDirectory = '';
        this.logger = logger;
        this.upgradeStrategist = new upgradeStrategist_1.UpgradeStrategist(logger);
    }
    emitProgress(message, type = 'info') {
        this.logger.info(message);
        if (this.onProgress) {
            this.onProgress(message, type);
        }
    }
    /**
     * Simple upgrade flow: discover → upgrade → restore
     */
    async upgradePackages(solutionPath) {
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
            const strategy = await this.upgradeStrategist.generateUpgradeStrategy(outdatedPackages, 'simple');
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
        }
        catch (error) {
            const errorMsg = `Upgrade failed: ${error instanceof Error ? error.message : String(error)}`;
            this.emitProgress(`💥 ${errorMsg}`, 'error');
            throw error;
        }
    }
    /**
     * Discover outdated packages using dotnet CLI
     */
    async discoverOutdatedPackages(solutionPath) {
        return new Promise((resolve) => {
            const cmd = `dotnet list "${solutionPath}" package --outdated`;
            (0, child_process_1.exec)(cmd, {
                timeout: 60000,
                cwd: this.solutionDirectory
            }, (error, stdout, stderr) => {
                if (error) {
                    this.logger.warn('Failed to get outdated packages', error);
                    resolve([]);
                }
                else {
                    const packages = this.parseOutdatedOutput(stdout);
                    resolve(packages);
                }
            });
        });
    }
    /**
     * Parse dotnet list output to extract package information
     */
    parseOutdatedOutput(stdout) {
        const packages = [];
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
    async upgradePackages_Execute(strategy) {
        const results = [];
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
            }
            catch (error) {
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
    async upgradePackage(pkg) {
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
            (0, child_process_1.exec)(cmd, {
                timeout: 60000,
                cwd: this.solutionDirectory
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}\n${stderr}`));
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Run dotnet restore
     */
    async runRestore(solutionPath) {
        return new Promise((resolve) => {
            const cmd = `dotnet restore "${solutionPath}"`;
            (0, child_process_1.exec)(cmd, {
                timeout: 120000,
                cwd: this.solutionDirectory
            }, (error, stdout, stderr) => {
                const errors = [];
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
    generateSummary(results, restoreErrors) {
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
    createSuccessResults(results, restoreErrors, message) {
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
exports.PackageUpgrader = PackageUpgrader;
//# sourceMappingURL=packageUpgrader.js.map