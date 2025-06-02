import { FamilyDetectionConfig } from '../services/packageFamilyDetector';

export const defaultFamilyDetectionConfig: FamilyDetectionConfig = {
    enablePatternDetection: true,
    enableDependencyAnalysis: true,
    enableAIGrouping: true,
    enableMetadataAnalysis: true,
    minFamilySize: 2,
    minConfidence: 0.6,
    
    // User can add custom patterns
    customPatterns: [
        { pattern: /^HealPros\./, name: 'HealPros Internal' },
        { pattern: /\.Testing$/, name: 'Testing Frameworks' },
        { pattern: /\.Client$/, name: 'Client Libraries' }
    ],
    
    // Manual overrides for edge cases
    manualOverrides: {
        'SomePackage': 'Custom Family',
        'AnotherPackage': 'Custom Family'
    }
}; 