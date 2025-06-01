import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { PackageUpgrader } from '../services/packageUpgrader';

/**
 * Interface for Copilot agent configuration
 */
interface CopilotAgentConfig {
    enabled: boolean;
    contextAware: boolean;
    securityAnalysis: boolean;
    testAnalysis: boolean;
}

/**
 * Service for managing extension configuration
 */
export class ConfigurationManager {
    private logger: Logger;
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.logger = new Logger();
        this.config = vscode.workspace.getConfiguration('dotnetPackageUpgrader');
    }

    /**
     * Get whether automatic package upgrades are enabled
     */
    get autoUpgrade(): boolean {
        return this.config.get('autoUpgrade') || false;
    }

    /**
     * Get the package upgrade strategy
     */
    get upgradeStrategy(): 'latest' | 'major' | 'minor' | 'patch' {
        return this.config.get('upgradeStrategy') || 'patch';
    }

    /**
     * Get whether breaking changes are allowed
     */
    get allowBreakingChanges(): boolean {
        return this.upgradeStrategy === 'latest' || this.upgradeStrategy === 'major';
    }

    /**
     * Get the corporate service URL
     */
    get serviceUrl(): string {
        return this.config.get('serviceUrl') || 'https://api.corporate-package-service.com';
    }

    /**
     * Get the service timeout in milliseconds
     */
    get serviceTimeout(): number {
        return this.config.get('serviceTimeout') || 30000;
    }

    /**
     * Get whether to use corporate service recommendations
     */
    get useCorporateService(): boolean {
        return this.config.get('useCorporateService') || true;
    }

    /**
     * Get Copilot agent configuration
     */
    get copilotAgentConfig(): CopilotAgentConfig {
        return this.config.get('copilotAgent') || {
            enabled: true,
            contextAware: true,
            securityAnalysis: true,
            testAnalysis: true
        };
    }

    /**
     * Get custom rules for package upgrades
     */
    get customRules(): string[] {
        return this.config.get('customRules') || [];
    }

    /**
     * Get security requirements for package upgrades
     */
    get securityRequirements(): string[] {
        return this.config.get('securityRequirements') || [];
    }

    /**
     * Get whether AI analysis is enabled
     */
    get aiAnalysisEnabled(): boolean {
        return this.config.get('aiAnalysisEnabled', false); // Default to false until Copilot is working
    }

    /**
     * Update the configuration
     * @param key The configuration key
     * @param value The new value
     */
    async updateConfig(key: string, value: any): Promise<void> {
        try {
            await this.config.update(key, value, vscode.ConfigurationTarget.Global);
            this.logger.info(`Updated configuration: ${key} = ${value}`);
        } catch (error) {
            this.logger.error('Failed to update configuration', { key, value, error });
            throw error;
        }
    }

    /**
     * Get a configuration value
     * @param key The configuration key
     * @param defaultValue The default value if not set
     */
    getConfig<T>(key: string, defaultValue: T): T {
        return this.config.get(key, defaultValue);
    }

    /**
     * Reset configuration to defaults
     */
    async resetConfig(): Promise<void> {
        try {
            await this.config.update('autoUpgrade', false);
            await this.config.update('upgradeStrategy', 'patch');
            await this.config.update('serviceUrl', 'https://api.corporate-package-service.com');
            await this.config.update('serviceTimeout', 30000);
            await this.config.update('useCorporateService', true);
            await this.config.update('copilotAgent', {
                enabled: true,
                contextAware: true,
                securityAnalysis: true,
                testAnalysis: true
            });
            await this.config.update('customRules', []);
            await this.config.update('securityRequirements', []);
            this.logger.info('Reset configuration to defaults');
        } catch (error) {
            this.logger.error('Failed to reset configuration', error);
            throw error;
        }
    }
} 