import { Logger } from '../utils/logger';
import { CopilotService } from './copilotService';
import { DependencyGraph } from './dependencyGraphAnalyzer';
import { PackageUpdate } from './packageUpgrader';

/**
 * Represents different upgrade strategies
 */
export interface UpgradeStrategy {
    name: string;
    description: string;
    phases: UpgradePhase[];
    estimatedRisk: 'low' | 'medium' | 'high';
    estimatedTime: string;
    pros: string[];
    cons: string[];
    aiRecommendation?: string;
}

export interface UpgradePhase {
    name: string;
    description: string;
    packageUpdates: PackageUpdate[];
    order: number;
    rationale: string;
}

/**
 * AI-powered upgrade strategist
 */
export class UpgradeStrategist {
    private logger: Logger;
    private copilotService: CopilotService;

    constructor(logger: Logger, copilotService: CopilotService) {
        this.logger = logger;
        this.copilotService = copilotService;
    }

    /**
     * 🎯 Generate intelligent upgrade strategies
     */
    public async generateUpgradeStrategies(
        solutionPath: string,
        availableUpdates: Map<string, PackageUpdate[]>,
        dependencyGraph?: DependencyGraph
    ): Promise<UpgradeStrategy[]> {
        this.logger.info('🎯 Generating intelligent upgrade strategies');

        const strategies: UpgradeStrategy[] = [];

        // Strategy 1: Family-First Approach
        strategies.push(await this.createFamilyFirstStrategy(availableUpdates, dependencyGraph));

        // Strategy 2: Conservative Approach
        strategies.push(await this.createConservativeStrategy(availableUpdates));

        // Strategy 3: All-at-Once Approach
        strategies.push(await this.createAllAtOnceStrategy(availableUpdates));

        return strategies;
    }

    /**
     * 👨‍👩‍👧‍👦 Family-First Strategy: Update package families together
     */
    private async createFamilyFirstStrategy(
        availableUpdates: Map<string, PackageUpdate[]>,
        dependencyGraph?: DependencyGraph
    ): Promise<UpgradeStrategy> {
        const phases: UpgradePhase[] = [];
        let phaseOrder = 1;

        if (dependencyGraph && dependencyGraph.packageFamilies.size > 0) {
            // Group updates by package family
            for (const [family, packageNames] of dependencyGraph.packageFamilies) {
                const familyUpdates: PackageUpdate[] = [];
                
                for (const [projectPath, updates] of availableUpdates) {
                    for (const update of updates) {
                        if (packageNames.includes(update.packageName)) {
                            familyUpdates.push(update);
                        }
                    }
                }

                if (familyUpdates.length > 0) {
                    const displayName = this.formatFamilyDisplayName(family);
                    
                    phases.push({
                        name: `Update ${displayName}`,
                        description: `Update all ${displayName} packages together to ensure compatibility`,
                        packageUpdates: familyUpdates,
                        order: phaseOrder++,
                        rationale: `Packages in the same family are designed to work together and should be updated as a unit to avoid version conflicts.`
                    });
                }
            }

            // Handle remaining packages not in any family
            const ungroupedUpdates: PackageUpdate[] = [];
            const groupedPackageNames = new Set<string>();
            
            // Collect all grouped package names
            for (const [, packageNames] of dependencyGraph.packageFamilies) {
                packageNames.forEach(name => groupedPackageNames.add(name));
            }

            // Find ungrouped packages
            for (const [, updates] of availableUpdates) {
                for (const update of updates) {
                    if (!groupedPackageNames.has(update.packageName)) {
                        ungroupedUpdates.push(update);
                    }
                }
            }

            if (ungroupedUpdates.length > 0) {
                phases.push({
                    name: 'Update Individual Packages',
                    description: 'Update remaining packages that don\'t belong to detected families',
                    packageUpdates: ungroupedUpdates,
                    order: phaseOrder++,
                    rationale: 'These packages don\'t have detected dependencies and can be updated independently.'
                });
            }
        } else {
            // Fallback: treat all updates as one phase
            const allUpdates: PackageUpdate[] = [];
            for (const [, updates] of availableUpdates) {
                allUpdates.push(...updates);
            }

            phases.push({
                name: 'Update All Packages',
                description: 'Update all packages together',
                packageUpdates: allUpdates,
                order: 1,
                rationale: 'No package families detected, updating all packages together.'
            });
        }

        return {
            name: 'Family-First Strategy',
            description: 'Update packages by family groups to maintain compatibility',
            phases,
            estimatedRisk: 'medium',
            estimatedTime: `${phases.length * 3}-${phases.length * 5} minutes`,
            pros: [
                'Maintains compatibility within package families',
                'Reduces version conflicts',
                'Clear upgrade phases'
            ],
            cons: [
                'May require larger updates at once',
                'Could introduce multiple breaking changes simultaneously'
            ],
            aiRecommendation: dependencyGraph?.packageFamilies.size ? 
                `Recommended: Detected ${dependencyGraph.packageFamilies.size} package families. This strategy will prevent conflicts like the AWSSDK.Core issue.` :
                undefined
        };
    }

    /**
     * 🐌 Conservative Strategy: Update packages one by one
     */
    private async createConservativeStrategy(
        availableUpdates: Map<string, PackageUpdate[]>
    ): Promise<UpgradeStrategy> {
        const phases: UpgradePhase[] = [];
        let phaseOrder = 1;

        // Create one phase per package
        for (const [projectPath, updates] of availableUpdates) {
            for (const update of updates) {
                phases.push({
                    name: `Update ${update.packageName}`,
                    description: `Update ${update.packageName} from ${update.currentVersion} to ${update.recommendedVersion}`,
                    packageUpdates: [update],
                    order: phaseOrder++,
                    rationale: 'Single package update minimizes risk and allows for immediate rollback if issues occur.'
                });
            }
        }

        return {
            name: 'Conservative Strategy',
            description: 'Update packages one by one to minimize risk',
            phases,
            estimatedRisk: 'low',
            estimatedTime: `${phases.length * 2}-${phases.length * 3} minutes`,
            pros: [
                'Minimal risk per update',
                'Easy to identify problematic packages',
                'Can stop at first issue'
            ],
            cons: [
                'Takes longer overall',
                'May not detect inter-package conflicts until later'
            ]
        };
    }

    /**
     * ⚡ All-at-Once Strategy: Update everything together
     */
    private async createAllAtOnceStrategy(
        availableUpdates: Map<string, PackageUpdate[]>
    ): Promise<UpgradeStrategy> {
        const allUpdates: PackageUpdate[] = [];
        for (const [, updates] of availableUpdates) {
            allUpdates.push(...updates);
        }

        const phases: UpgradePhase[] = [{
            name: 'Update All Packages',
            description: `Update all ${allUpdates.length} packages simultaneously`,
            packageUpdates: allUpdates,
            order: 1,
            rationale: 'Fastest approach that gets all updates done in one go.'
        }];

        return {
            name: 'All-at-Once Strategy',
            description: 'Update all packages simultaneously for maximum speed',
            phases,
            estimatedRisk: 'high',
            estimatedTime: '5-10 minutes',
            pros: [
                'Fastest completion time',
                'All conflicts surface immediately',
                'Single validation step'
            ],
            cons: [
                'High risk of conflicts',
                'Difficult to isolate issues',
                'May require significant rollback'
            ]
        };
    }

    /**
     * 🤖 Generic family name formatter - no hardcoded names
     */
    private formatFamilyDisplayName(familyName: string): string {
        // Step 1: Remove duplicate "Family" suffix (case insensitive)
        let cleanName = familyName.replace(/\s+family\s*$/i, '').trim();
        
        // Step 2: Generic pattern-based formatting
        
        // If it's already descriptive (contains key words), use as-is
        const descriptiveWords = ['packages', 'framework', 'library', 'tools', 'sdk', 'api', 'testing', 'documentation'];
        if (descriptiveWords.some(word => cleanName.toLowerCase().includes(word))) {
            return this.capitalizeWords(cleanName);
        }
        
        // If it contains dots (like Microsoft.Extensions), simplify
        if (cleanName.includes('.')) {
            const parts = cleanName.split('.');
            // Take first 2 parts max for readability
            const simplified = parts.slice(0, 2).join('.');
            return `${this.capitalizeWords(simplified)} Packages`;
        }
        
        // If it's an acronym (all caps or mostly caps), keep as-is and add context
        if (this.isAcronym(cleanName)) {
            return `${cleanName} Packages`;
        }
        
        // If it's a single word, add "Packages"
        if (!cleanName.includes(' ') && cleanName.length > 0) {
            return `${this.capitalizeWords(cleanName)} Packages`;
        }
        
        // Default: just clean up capitalization
        return this.capitalizeWords(cleanName);
    }
    
    /**
     * 🔤 Check if string is an acronym (like AWS, SDK, API)
     */
    private isAcronym(text: string): boolean {
        // Remove dots and spaces
        const cleaned = text.replace(/[.\s]/g, '');
        
        // Check if it's mostly uppercase (60%+ uppercase letters)
        const uppercaseCount = (cleaned.match(/[A-Z]/g) || []).length;
        const letterCount = (cleaned.match(/[A-Za-z]/g) || []).length;
        
        return letterCount > 0 && (uppercaseCount / letterCount) >= 0.6;
    }
    
    /**
     * 📝 Properly capitalize words (Title Case)
     */
    private capitalizeWords(text: string): string {
        return text.replace(/\b\w+/g, (word) => {
            // Keep acronyms as-is
            if (this.isAcronym(word)) {
                return word.toUpperCase();
            }
            // Capitalize first letter, lowercase the rest
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        });
    }
} 