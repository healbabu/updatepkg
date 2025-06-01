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
exports.ConfigurationManager = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Service for managing extension configuration
 */
class ConfigurationManager {
    constructor() {
        this.logger = new logger_1.Logger();
        this.config = vscode.workspace.getConfiguration('dotnetPackageUpgrader');
    }
    /**
     * Get whether automatic package upgrades are enabled
     */
    get autoUpgrade() {
        return this.config.get('autoUpgrade') || false;
    }
    /**
     * Get the package upgrade strategy
     */
    get upgradeStrategy() {
        return this.config.get('upgradeStrategy') || 'patch';
    }
    /**
     * Get whether breaking changes are allowed
     */
    get allowBreakingChanges() {
        return this.upgradeStrategy === 'latest' || this.upgradeStrategy === 'major';
    }
    /**
     * Get the corporate service URL
     */
    get serviceUrl() {
        return this.config.get('serviceUrl') || 'https://api.corporate-package-service.com';
    }
    /**
     * Get the service timeout in milliseconds
     */
    get serviceTimeout() {
        return this.config.get('serviceTimeout') || 30000;
    }
    /**
     * Get whether to use corporate service recommendations
     */
    get useCorporateService() {
        return this.config.get('useCorporateService') || true;
    }
    /**
     * Get Copilot agent configuration
     */
    get copilotAgentConfig() {
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
    get customRules() {
        return this.config.get('customRules') || [];
    }
    /**
     * Get security requirements for package upgrades
     */
    get securityRequirements() {
        return this.config.get('securityRequirements') || [];
    }
    /**
     * Get whether AI analysis is enabled
     */
    get aiAnalysisEnabled() {
        return this.config.get('aiAnalysisEnabled', false); // Default to false until Copilot is working
    }
    /**
     * Update the configuration
     * @param key The configuration key
     * @param value The new value
     */
    async updateConfig(key, value) {
        try {
            await this.config.update(key, value, vscode.ConfigurationTarget.Global);
            this.logger.info(`Updated configuration: ${key} = ${value}`);
        }
        catch (error) {
            this.logger.error('Failed to update configuration', { key, value, error });
            throw error;
        }
    }
    /**
     * Get a configuration value
     * @param key The configuration key
     * @param defaultValue The default value if not set
     */
    getConfig(key, defaultValue) {
        return this.config.get(key, defaultValue);
    }
    /**
     * Reset configuration to defaults
     */
    async resetConfig() {
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
        }
        catch (error) {
            this.logger.error('Failed to reset configuration', error);
            throw error;
        }
    }
}
exports.ConfigurationManager = ConfigurationManager;
//# sourceMappingURL=configurationManager.js.map