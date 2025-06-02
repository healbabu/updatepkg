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
exports.Logger = void 0;
const vscode = __importStar(require("vscode"));
const winston = __importStar(require("winston"));
/**
 * Logger utility class for consistent logging across the extension
 */
class Logger {
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('.NET Package Upgrader');
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
                })
            ]
        });
    }
    /**
     * Log an informational message
     * @param message The message to log
     * @param meta Additional metadata
     */
    info(message, meta) {
        this.logger.info(message, meta);
        this.outputChannel.appendLine(`[INFO] ${message}`);
    }
    /**
     * Log a warning message
     * @param message The message to log
     * @param meta Additional metadata
     */
    warn(message, meta) {
        this.logger.warn(message, meta);
        this.outputChannel.appendLine(`[WARN] ${message}`);
    }
    /**
     * Log an error message
     * @param message The message to log
     * @param error The error object
     */
    error(message, error) {
        this.logger.error(message, { error });
        this.outputChannel.appendLine(`[ERROR] ${message}`);
        if (error) {
            this.outputChannel.appendLine(error.stack || error.toString());
        }
    }
    /**
     * Log a debug message (only when in development/verbose mode)
     * @param message The message to log
     * @param meta Additional metadata
     */
    debug(message, meta) {
        // Only log debug in development or when explicitly enabled
        const config = vscode.workspace.getConfiguration('dotnetPackageUpgrader');
        const verboseLogging = config.get('verboseLogging', false);
        if (verboseLogging) {
            this.logger.debug(message, meta);
            this.outputChannel.appendLine(`[DEBUG] ${message}`);
        }
    }
    /**
     * Show the output channel
     */
    showOutput() {
        this.outputChannel.show();
    }
    /**
     * Dispose the logger
     */
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map