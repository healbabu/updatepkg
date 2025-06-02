import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { CopilotService } from './copilotService';

/**
 * Represents a detected package family
 */
export interface PackageFamily {
    id: string;
    name: string;
    packages: string[];
    detectionMethod: 'pattern' | 'dependency' | 'ai' | 'metadata' | 'manual';
    confidence: number; // 0-1
    characteristics: {
        commonPrefix?: string;
        commonSuffix?: string;
        sharedDependencies?: string[];
        author?: string;
        description?: string;
        tags?: string[];
        detectionMethods?: string[];
    };
    updateStrategy?: 'together' | 'sequential' | 'independent';
}

/**
 * Configuration for family detection
 */
export interface FamilyDetectionConfig {
    enablePatternDetection: boolean;
    enableDependencyAnalysis: boolean;
    enableAIGrouping: boolean;
    enableMetadataAnalysis: boolean;
    minFamilySize: number;
    minConfidence: number;
    customPatterns?: { pattern: RegExp; name: string }[];
    manualOverrides?: { [packageName: string]: string };
}

/**
 * Intelligent package family detector
 */
export class PackageFamilyDetector {
    private logger: Logger;
    private copilotService: CopilotService;
    private config: FamilyDetectionConfig;

    constructor(logger: Logger, copilotService: CopilotService, config?: Partial<FamilyDetectionConfig>) {
        this.logger = logger;
        this.copilotService = copilotService;
        this.config = {
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
     * 🔍 Detect package families using multiple strategies
     */
    public async detectPackageFamilies(
        packages: Map<string, any>, // PackageNode from dependency graph
        packageMetadata?: Map<string, any> // NuGet metadata if available
    ): Promise<PackageFamily[]> {
        
        this.logger.info('🔍 Starting intelligent package family detection', { 
            packageCount: packages.size,
            enabledMethods: this.getEnabledMethods()
        });

        const allFamilies: PackageFamily[] = [];

        // 1. Pattern-based detection
        if (this.config.enablePatternDetection) {
            const patternFamilies = await this.detectByPatterns(packages);
            allFamilies.push(...patternFamilies);
            this.logger.info('📝 Pattern-based detection completed', { familiesFound: patternFamilies.length });
        }

        // 2. Dependency relationship analysis
        if (this.config.enableDependencyAnalysis) {
            const dependencyFamilies = await this.detectByDependencies(packages);
            allFamilies.push(...dependencyFamilies);
            this.logger.info('🕸️ Dependency-based detection completed', { familiesFound: dependencyFamilies.length });
        }

        // 3. NuGet metadata analysis
        if (this.config.enableMetadataAnalysis && packageMetadata) {
            const metadataFamilies = await this.detectByMetadata(packages, packageMetadata);
            allFamilies.push(...metadataFamilies);
            this.logger.info('📦 Metadata-based detection completed', { familiesFound: metadataFamilies.length });
        }

        // 4. AI-powered semantic grouping
        if (this.config.enableAIGrouping) {
            try {
                const aiFamilies = await this.detectByAI(packages);
                allFamilies.push(...aiFamilies);
                this.logger.info('🤖 AI-based detection completed', { familiesFound: aiFamilies.length });
            } catch (error) {
                this.logger.warn('AI-based detection failed', error);
            }
        }

        // 5. Merge and deduplicate families
        const mergedFamilies = this.mergeSimilarFamilies(allFamilies);

        // 6. Apply manual overrides
        const finalFamilies = this.applyManualOverrides(mergedFamilies);

        this.logger.info('✅ Package family detection completed', { 
            totalFamilies: finalFamilies.length,
            averageConfidence: this.calculateAverageConfidence(finalFamilies)
        });

        return finalFamilies;
    }

    /**
     * 🔍 Strategy 1: Automatic pattern detection
     */
    private async detectByPatterns(packages: Map<string, any>): Promise<PackageFamily[]> {
        const packageNames = Array.from(packages.keys());
        const families: PackageFamily[] = [];

        // Detect common prefixes
        const prefixGroups = this.groupByCommonPrefix(packageNames);
        for (const [prefix, packageList] of prefixGroups) {
            if (packageList.length >= this.config.minFamilySize) {
                families.push({
                    id: `prefix-${prefix.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    name: `${prefix} Family`,
                    packages: packageList,
                    detectionMethod: 'pattern',
                    confidence: this.calculatePatternConfidence(prefix, packageList),
                    characteristics: {
                        commonPrefix: prefix
                    },
                    updateStrategy: 'together'
                });
            }
        }

        // Detect common suffixes
        const suffixGroups = this.groupByCommonSuffix(packageNames);
        for (const [suffix, packageList] of suffixGroups) {
            if (packageList.length >= this.config.minFamilySize) {
                families.push({
                    id: `suffix-${suffix.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    name: `${suffix} Family`,
                    packages: packageList,
                    detectionMethod: 'pattern',
                    confidence: this.calculatePatternConfidence(suffix, packageList),
                    characteristics: {
                        commonSuffix: suffix
                    },
                    updateStrategy: 'together'
                });
            }
        }

        // Include custom patterns from config
        if (this.config.customPatterns) {
            for (const { pattern, name } of this.config.customPatterns) {
                const matchingPackages = packageNames.filter(pkg => pattern.test(pkg));
                if (matchingPackages.length >= this.config.minFamilySize) {
                    families.push({
                        id: `custom-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                        name: name,
                        packages: matchingPackages,
                        detectionMethod: 'pattern',
                        confidence: 0.9, // High confidence for manual patterns
                        characteristics: {},
                        updateStrategy: 'together'
                    });
                }
            }
        }

        return families.filter(f => f.confidence >= this.config.minConfidence);
    }

    /**
     * 🕸️ Strategy 2: Dependency relationship analysis
     */
    private async detectByDependencies(packages: Map<string, any>): Promise<PackageFamily[]> {
        const families: PackageFamily[] = [];
        const dependencyGroups = new Map<string, string[]>();

        // Group packages that share common dependencies
        for (const [packageName, packageNode] of packages) {
            const dependencies = packageNode.directDependencies || new Map();
            
            for (const [depName, depVersion] of dependencies) {
                if (!dependencyGroups.has(depName)) {
                    dependencyGroups.set(depName, []);
                }
                dependencyGroups.get(depName)!.push(packageName);
            }
        }

        // Create families from dependency groups
        for (const [sharedDep, dependentPackages] of dependencyGroups) {
            if (dependentPackages.length >= this.config.minFamilySize) {
                const confidence = this.calculateDependencyConfidence(sharedDep, dependentPackages);
                
                if (confidence >= this.config.minConfidence) {
                    families.push({
                        id: `dep-${sharedDep.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                        name: `${sharedDep} Ecosystem`,
                        packages: dependentPackages,
                        detectionMethod: 'dependency',
                        confidence,
                        characteristics: {
                            sharedDependencies: [sharedDep]
                        },
                        updateStrategy: 'sequential'
                    });
                }
            }
        }

        return families;
    }

    /**
     * 📦 Strategy 3: NuGet metadata analysis
     */
    private async detectByMetadata(
        packages: Map<string, any>,
        metadata: Map<string, any>
    ): Promise<PackageFamily[]> {
        const families: PackageFamily[] = [];
        const authorGroups = new Map<string, string[]>();
        const tagGroups = new Map<string, string[]>();

        // Group by author
        for (const [packageName, meta] of metadata) {
            if (packages.has(packageName)) {
                if (meta.authors) {
                    const author = Array.isArray(meta.authors) ? meta.authors[0] : meta.authors;
                    if (!authorGroups.has(author)) {
                        authorGroups.set(author, []);
                    }
                    authorGroups.get(author)!.push(packageName);
                }

                // Group by tags
                if (meta.tags) {
                    for (const tag of meta.tags) {
                        if (!tagGroups.has(tag)) {
                            tagGroups.set(tag, []);
                        }
                        tagGroups.get(tag)!.push(packageName);
                    }
                }
            }
        }

        // Create families from author groups
        for (const [author, packageList] of authorGroups) {
            if (packageList.length >= this.config.minFamilySize) {
                families.push({
                    id: `author-${author.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    name: `${author} Packages`,
                    packages: packageList,
                    detectionMethod: 'metadata',
                    confidence: 0.8,
                    characteristics: {
                        author
                    },
                    updateStrategy: 'together'
                });
            }
        }

        return families;
    }

    /**
     * 🤖 AI-powered package family detection using Copilot language model
     */
    private async detectByAI(packages: Map<string, any>): Promise<PackageFamily[]> {
        try {
            const packageNames = Array.from(packages.keys());
            
            if (packageNames.length === 0) {
                return [];
            }

            this.logger.info('🤖 Starting AI-powered package family detection', {
                packageCount: packageNames.length
            });

            // For very large sets, process in batches to avoid overwhelming AI
            const batchSize = 100;
            const families: PackageFamily[] = [];

            for (let i = 0; i < packageNames.length; i += batchSize) {
                const batch = packageNames.slice(i, i + batchSize);
                const batchFamilies = await this.analyzePackageBatch(batch);
                families.push(...batchFamilies);
            }

            // Remove duplicates and merge overlapping families
            const uniqueFamilies = this.deduplicateAIFamilies(families);

            this.logger.info('🤖 AI family detection completed', {
                totalFamilies: uniqueFamilies.length,
                batchesProcessed: Math.ceil(packageNames.length / batchSize)
            });

            return uniqueFamilies;

        } catch (error) {
            this.logger.warn('🤖 AI-powered family detection failed, falling back to pattern detection', error);
            return [];
        }
    }

    /**
     * 🧠 Analyze a batch of packages using AI language model
     */
    private async analyzePackageBatch(packageNames: string[]): Promise<PackageFamily[]> {
        const response = await this.copilotService.analyzePackageFamilies(packageNames);
        return this.parseAIFamilyResponse(response);
    }

    /**
     * 🔍 Parse AI response and convert to PackageFamily objects
     */
    private parseAIFamilyResponse(response: string): PackageFamily[] {
        try {
            this.logger.info('🔍 Parsing AI family response', { 
                responseLength: response.length,
                firstChars: response.substring(0, 100)
            });

            // Clean and extract JSON from response
            let jsonText = response.trim();
            
            // Try to extract JSON from markdown code blocks
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
            } else {
                // Try to find JSON array directly
                const arrayMatch = response.match(/\[([\s\S]*)\]/);
                if (arrayMatch) {
                    jsonText = arrayMatch[0];
                }
            }

            // Validate it looks like package family JSON
            if (!jsonText.includes('"packages"') && !jsonText.includes('"name"')) {
                this.logger.warn('🤖 Response does not appear to be package family format', {
                    response: response.substring(0, 200)
                });
                return [];
            }

            const aiFamilies = JSON.parse(jsonText);

            if (!Array.isArray(aiFamilies)) {
                this.logger.warn('🤖 AI response was not an array');
                return [];
            }

            const families: PackageFamily[] = [];

            for (const aiFamily of aiFamilies) {
                // Validate AI response structure
                if (!aiFamily.name || !Array.isArray(aiFamily.packages) || aiFamily.packages.length < 2) {
                    this.logger.info('🤖 Skipping invalid family', { family: aiFamily });
                    continue;
                }

                // Filter confidence threshold
                const confidence = Math.min(1.0, Math.max(0.0, aiFamily.confidence || 0.7));
                if (confidence < this.config.minConfidence) {
                    this.logger.info('🤖 Skipping low confidence family', { 
                        name: aiFamily.name, 
                        confidence 
                    });
                    continue;
                }

                const family: PackageFamily = {
                    id: `ai-${aiFamily.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    name: aiFamily.name,
                    packages: aiFamily.packages,
                    detectionMethod: 'ai',
                    confidence: confidence,
                    characteristics: {
                        description: aiFamily.reasoning || 'AI-detected package family',
                        ...aiFamily.characteristics,
                        aiReasoning: aiFamily.reasoning
                    },
                    updateStrategy: aiFamily.updateStrategy || 'together'
                };

                families.push(family);
            }

            this.logger.info('🤖 Successfully parsed AI families', {
                familiesDetected: families.length,
                totalPackages: families.reduce((sum, f) => sum + f.packages.length, 0)
            });

            return families;

        } catch (error) {
            this.logger.error('🤖 Failed to parse AI family response', { 
                error: error instanceof Error ? error.message : String(error),
                responseStart: response.substring(0, 200),
                responseLength: response.length
            });
            return [];
        }
    }

    /**
     * 🔧 Remove duplicate families and merge overlapping ones
     */
    private deduplicateAIFamilies(families: PackageFamily[]): PackageFamily[] {
        const uniqueFamilies: PackageFamily[] = [];
        const processedPackages = new Set<string>();

        // Sort by confidence (highest first)
        families.sort((a, b) => b.confidence - a.confidence);

        for (const family of families) {
            // Check if any packages in this family are already processed
            const hasOverlap = family.packages.some(pkg => processedPackages.has(pkg));
            
            if (!hasOverlap) {
                // Add this family as is
                uniqueFamilies.push(family);
                family.packages.forEach(pkg => processedPackages.add(pkg));
            } else {
                // Handle overlap: merge with existing family or create remainder
                const unprocessedPackages = family.packages.filter(pkg => !processedPackages.has(pkg));
                
                if (unprocessedPackages.length >= this.config.minFamilySize) {
                    const remainderFamily: PackageFamily = {
                        ...family,
                        id: `${family.id}-remainder`,
                        name: `${family.name} (Additional)`,
                        packages: unprocessedPackages,
                        confidence: family.confidence * 0.8 // Slightly lower confidence for remainder
                    };
                    
                    uniqueFamilies.push(remainderFamily);
                    unprocessedPackages.forEach(pkg => processedPackages.add(pkg));
                }
            }
        }

        return uniqueFamilies;
    }

    /**
     * 🔗 Merge similar families detected by different methods
     */
    private mergeSimilarFamilies(families: PackageFamily[]): PackageFamily[] {
        const merged: PackageFamily[] = [];
        const processed = new Set<string>();

        for (const family of families) {
            if (processed.has(family.id)) continue;

            const similar = families.filter(f => 
                f.id !== family.id && 
                !processed.has(f.id) &&
                this.calculatePackageOverlap(family.packages, f.packages) > 0.7
            );

            if (similar.length > 0) {
                // Merge similar families
                const allPackages = new Set([...family.packages]);
                const allMethods = [family.detectionMethod];
                let totalConfidence = family.confidence;

                for (const sim of similar) {
                    sim.packages.forEach(pkg => allPackages.add(pkg));
                    allMethods.push(sim.detectionMethod);
                    totalConfidence += sim.confidence;
                    processed.add(sim.id);
                }

                merged.push({
                    ...family,
                    packages: Array.from(allPackages),
                    confidence: totalConfidence / (similar.length + 1),
                    characteristics: {
                        ...family.characteristics,
                        detectionMethods: allMethods
                    }
                });
            } else {
                merged.push(family);
            }

            processed.add(family.id);
        }

        return merged;
    }

    /**
     * 📊 Calculate package overlap between two families
     */
    private calculatePackageOverlap(packages1: string[], packages2: string[]): number {
        const set1 = new Set(packages1);
        const set2 = new Set(packages2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    /**
     * ⚙️ Apply manual overrides from configuration
     */
    private applyManualOverrides(families: PackageFamily[]): PackageFamily[] {
        if (!this.config.manualOverrides) return families;

        const overriddenFamilies = [...families];
        
        // Apply manual overrides
        for (const [packageName, familyName] of Object.entries(this.config.manualOverrides)) {
            // Remove package from existing families
            for (const family of overriddenFamilies) {
                family.packages = family.packages.filter(pkg => pkg !== packageName);
            }

            // Add to specified family or create new one
            let targetFamily = overriddenFamilies.find(f => f.name === familyName);
            if (!targetFamily) {
                targetFamily = {
                    id: `manual-${familyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    name: familyName,
                    packages: [],
                    detectionMethod: 'manual',
                    confidence: 1.0,
                    characteristics: {},
                    updateStrategy: 'together'
                };
                overriddenFamilies.push(targetFamily);
            }
            
            targetFamily.packages.push(packageName);
        }

        // Remove empty families
        return overriddenFamilies.filter(f => f.packages.length > 0);
    }

    private getEnabledMethods(): string[] {
        const methods: string[] = [];
        if (this.config.enablePatternDetection) methods.push('pattern');
        if (this.config.enableDependencyAnalysis) methods.push('dependency');
        if (this.config.enableAIGrouping) methods.push('ai');
        if (this.config.enableMetadataAnalysis) methods.push('metadata');
        return methods;
    }

    private calculatePatternConfidence(pattern: string, packages: string[]): number {
        // Higher confidence for more specific patterns and larger groups
        const specificity = Math.min(pattern.length / 20, 1);
        const groupSize = Math.min(packages.length / 10, 1);
        return (specificity + groupSize) / 2;
    }

    private calculateDependencyConfidence(dependency: string, packages: string[]): number {
        // Higher confidence for well-known frameworks and larger dependent groups
        const wellKnownDeps = ['Microsoft.Extensions.DependencyInjection', 'Newtonsoft.Json', 'System.Text.Json'];
        const isWellKnown = wellKnownDeps.includes(dependency) ? 0.2 : 0;
        const groupSize = Math.min(packages.length / 5, 0.8);
        return groupSize + isWellKnown;
    }

    private calculateAverageConfidence(families: PackageFamily[]): number {
        if (families.length === 0) return 0;
        return families.reduce((sum, f) => sum + f.confidence, 0) / families.length;
    }

    /**
     * 🧮 Helper: Group packages by common prefix
     */
    private groupByCommonPrefix(packageNames: string[]): Map<string, string[]> {
        const groups = new Map<string, string[]>();
        
        for (const packageName of packageNames) {
            // Find common prefixes (words separated by dots)
            const parts = packageName.split('.');
            for (let i = 1; i <= Math.min(3, parts.length); i++) {
                const prefix = parts.slice(0, i).join('.');
                
                if (!groups.has(prefix)) {
                    groups.set(prefix, []);
                }
                groups.get(prefix)!.push(packageName);
            }
        }

        // Filter out groups that are too generic or too small
        const filtered = new Map<string, string[]>();
        for (const [prefix, packageList] of groups) {
            if (packageList.length >= this.config.minFamilySize && 
                packageList.length < packageNames.length * 0.8 && // Not too generic
                prefix.length > 3) { // Not too short
                filtered.set(prefix, packageList);
            }
        }

        return filtered;
    }

    /**
     * 🧮 Helper: Group packages by common suffix
     */
    private groupByCommonSuffix(packageNames: string[]): Map<string, string[]> {
        const groups = new Map<string, string[]>();
        
        for (const packageName of packageNames) {
            const parts = packageName.split('.');
            const lastPart = parts[parts.length - 1];
            
            // Look for common endings like "Client", "Core", "Extensions"
            const commonSuffixes = ['Client', 'Core', 'Extensions', 'Common', 'Abstractions', 'Contracts'];
            for (const suffix of commonSuffixes) {
                if (lastPart.includes(suffix)) {
                    if (!groups.has(suffix)) {
                        groups.set(suffix, []);
                    }
                    groups.get(suffix)!.push(packageName);
                }
            }
        }

        return groups;
    }
} 