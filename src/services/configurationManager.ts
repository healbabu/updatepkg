import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

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
     * Get whether AI analysis is enabled
     */
    get enableAI(): boolean {
        return this.config.get('enableAI', true);
    }

    /**
     * Get upgrade timeout in milliseconds
     */
    get upgradeTimeout(): number {
        return this.config.get('upgradeTimeout', 60000);
    }

    /**
     * Get restore timeout in milliseconds
     */
    get restoreTimeout(): number {
        return this.config.get('restoreTimeout', 120000);
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
     * Get a configuration value
     * @param key The configuration key
     * @param defaultValue The default value if not set
     */
    getConfig<T>(key: string, defaultValue: T): T {
        return this.config.get(key, defaultValue);
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
} 