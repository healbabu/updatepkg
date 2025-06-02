import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Logger } from '../utils/logger';
import { CopilotService } from './copilotService';
import { PackageFamilyDetector, PackageFamily, FamilyDetectionConfig } from './packageFamilyDetector';

/**
 * Represents a package in the dependency graph
 */
export interface PackageNode {
    name: string;
    currentVersion: string;
    latestVersion: string;
    directDependencies: Map<string, string>; // package -> version constraint
    transitiveDependencies: Map<string, string>;
    dependents: string[]; // packages that depend on this
    packageFamily?: string; // e.g., "AWSSDK", "Microsoft.Extensions"
    isDirectReference: boolean;
    projects: string[]; // which projects reference this
}

/**
 * Represents a dependency graph for the entire solution
 */
export interface DependencyGraph {
    packages: Map<string, PackageNode>;
    packageFamilies: Map<string, string[]>; // family -> package names
    conflicts: VersionConflict[];
    criticalPaths: string[][]; // dependency chains that could cause issues
}

/**
 * Represents a version conflict in the dependency graph
 */
export interface VersionConflict {
    packageName: string;
    conflictingVersions: {
        version: string;
        requiredBy: string[];
        constraint: string;
    }[];
    severity: 'critical' | 'major' | 'minor';
    affectedProjects: string[];
}

/**
 * Service for analyzing complete dependency graphs
 */
export class DependencyGraphAnalyzer {
    private logger: Logger;
    private copilotService: CopilotService;
    private familyDetectionConfig: FamilyDetectionConfig;

    constructor(logger: Logger, copilotService: CopilotService, config?: Partial<FamilyDetectionConfig>) {
        this.logger = logger;
        this.copilotService = copilotService;
        this.familyDetectionConfig = {
            enablePatternDetection: true,
            enableDependencyAnalysis: true,
            enableAIGrouping: true,
            enableMetadataAnalysis: true,
            minFamilySize: 2,
            minConfidence: 0.6,
            ...config
        };
    }

    /**
     * 🔍 Analyze the complete dependency graph for a solution
     */
    public async analyzeSolutionDependencies(solutionPath: string): Promise<DependencyGraph> {
        this.logger.info('🧠 Starting comprehensive dependency graph analysis', { solutionPath });

        const graph: DependencyGraph = {
            packages: new Map(),
            packageFamilies: new Map(),
            conflicts: [],
            criticalPaths: []
        };

        // 1. Get all projects
        const projects = await this.getSolutionProjects(solutionPath);

        // 2. Build complete dependency graph
        for (const projectPath of projects) {
            await this.analyzeProjectDependencies(projectPath, graph);
        }

        // 3. Identify package families intelligently
        await this.identifyPackageFamilies(graph);

        // 4. Detect existing conflicts
        graph.conflicts = await this.detectVersionConflicts(graph);

        // 5. Identify critical dependency paths
        graph.criticalPaths = this.findCriticalDependencyPaths(graph);

        this.logger.info('🧠 Dependency graph analysis completed', {
            totalPackages: graph.packages.size,
            packageFamilies: graph.packageFamilies.size,
            conflicts: graph.conflicts.length,
            criticalPaths: graph.criticalPaths.length
        });

        return graph;
    }

    /**
     * 📊 Analyze individual project dependencies
     */
    private async analyzeProjectDependencies(
        projectPath: string, 
        graph: DependencyGraph
    ): Promise<void> {
        try {
            // Get direct package references
            const directPackages = await this.getDirectPackageReferences(projectPath);
            
            // Get all packages (including transitive)
            const allPackages = await this.getAllPackageDependencies(projectPath);

            for (const [packageName, version] of directPackages) {
                this.addOrUpdatePackageNode(graph, packageName, version, projectPath, true);
            }

            for (const [packageName, version] of allPackages) {
                if (!directPackages.has(packageName)) {
                    this.addOrUpdatePackageNode(graph, packageName, version, projectPath, false);
                }
            }
        } catch (error) {
            this.logger.warn('Failed to analyze project dependencies', { projectPath, error });
        }
    }

    /**
     * 🏷️ Intelligent package family identification
     */
    private async identifyPackageFamilies(graph: DependencyGraph): Promise<void> {
        this.logger.info('🔍 Starting intelligent package family detection');
        
        const familyDetector = new PackageFamilyDetector(
            this.logger, 
            this.copilotService,
            this.familyDetectionConfig
        );
        
        // Get NuGet metadata if needed
        const metadata = await this.fetchPackageMetadata(graph.packages);
        
        // Detect families using all available strategies
        const detectedFamilies = await familyDetector.detectPackageFamilies(
            graph.packages,
            metadata
        );
        
        // Update graph with detected families
        for (const family of detectedFamilies) {
            graph.packageFamilies.set(family.name, family.packages);
            
            // Update individual package nodes
            for (const packageName of family.packages) {
                const packageNode = graph.packages.get(packageName);
                if (packageNode) {
                    packageNode.packageFamily = family.name;
                }
            }
        }
        
        this.logger.info('✅ Package family detection completed', {
            familiesDetected: detectedFamilies.length,
            detectionMethods: detectedFamilies.map(f => f.detectionMethod),
            averageConfidence: detectedFamilies.reduce((sum, f) => sum + f.confidence, 0) / detectedFamilies.length
        });
    }

    /**
     * Get solution projects
     */
    private async getSolutionProjects(solutionPath: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const content = fs.readFileSync(solutionPath, 'utf-8');
            const projects: string[] = [];
            const projectRegex = /Project\("\{[^}]+\}"\)\s*=\s*"[^"]+",\s*"([^"]+)",/g;
            let match;

            while ((match = projectRegex.exec(content)) !== null) {
                const projectPath = path.resolve(path.dirname(solutionPath), match[1]);
                if (projectPath.endsWith('.csproj')) {
                    projects.push(projectPath);
                }
            }

            resolve(projects);
        });
    }

    /**
     * Get direct package references from project file
     */
    private async getDirectPackageReferences(projectPath: string): Promise<Map<string, string>> {
        const packages = new Map<string, string>();
        
        try {
            const content = fs.readFileSync(projectPath, 'utf-8');
            const packageRefRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
            let match;

            while ((match = packageRefRegex.exec(content)) !== null) {
                packages.set(match[1], match[2]);
            }
        } catch (error) {
            this.logger.warn('Failed to read direct package references', { projectPath, error });
        }

        return packages;
    }

    /**
     * Get all package dependencies (including transitive)
     */
    private async getAllPackageDependencies(projectPath: string): Promise<Map<string, string>> {
        return new Promise((resolve) => {
            const packages = new Map<string, string>();
            
            exec(
                `dotnet list "${projectPath}" package --include-transitive`,
                (error, stdout) => {
                    if (error) {
                        this.logger.warn('Failed to get transitive dependencies', { projectPath, error });
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
                }
            );
        });
    }

    /**
     * Add or update package node in graph
     */
    private addOrUpdatePackageNode(
        graph: DependencyGraph,
        packageName: string,
        version: string,
        projectPath: string,
        isDirect: boolean
    ): void {
        let packageNode = graph.packages.get(packageName);
        
        if (!packageNode) {
            packageNode = {
                name: packageName,
                currentVersion: version,
                latestVersion: version, // Will be updated later
                directDependencies: new Map(),
                transitiveDependencies: new Map(),
                dependents: [],
                isDirectReference: isDirect,
                projects: [projectPath]
            };
            graph.packages.set(packageName, packageNode);
        } else {
            // Update existing node
            if (!packageNode.projects.includes(projectPath)) {
                packageNode.projects.push(projectPath);
            }
            if (isDirect) {
                packageNode.isDirectReference = true;
            }
        }
    }

    /**
     * Fetch package metadata from NuGet (placeholder)
     */
    private async fetchPackageMetadata(packages: Map<string, PackageNode>): Promise<Map<string, any>> {
        // For now, return empty metadata
        // In a full implementation, this would call NuGet API
        this.logger.info('📦 Package metadata fetching not implemented yet');
        return new Map();
    }

    /**
     * Detect version conflicts in the dependency graph
     */
    private async detectVersionConflicts(graph: DependencyGraph): Promise<VersionConflict[]> {
        const conflicts: VersionConflict[] = [];
        
        // For now, return empty conflicts
        // This would be implemented to detect actual version conflicts
        this.logger.info('🔍 Version conflict detection not fully implemented yet');
        
        return conflicts;
    }

    /**
     * Find critical dependency paths
     */
    private findCriticalDependencyPaths(graph: DependencyGraph): string[][] {
        const paths: string[][] = [];
        
        // For now, return empty paths
        // This would be implemented to find critical dependency chains
        this.logger.info('🛤️ Critical path analysis not fully implemented yet');
        
        return paths;
    }
} 