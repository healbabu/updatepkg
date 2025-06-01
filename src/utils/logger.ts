import * as vscode from 'vscode';
import * as winston from 'winston';

/**
 * Logger utility class for consistent logging across the extension
 */
export class Logger {
    private logger: winston.Logger;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('.NET Package Upgrader');
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Log an informational message
     * @param message The message to log
     * @param meta Additional metadata
     */
    info(message: string, meta?: any): void {
        this.logger.info(message, meta);
        this.outputChannel.appendLine(`[INFO] ${message}`);
    }

    /**
     * Log a warning message
     * @param message The message to log
     * @param meta Additional metadata
     */
    warn(message: string, meta?: any): void {
        this.logger.warn(message, meta);
        this.outputChannel.appendLine(`[WARN] ${message}`);
    }

    /**
     * Log an error message
     * @param message The message to log
     * @param error The error object
     */
    error(message: string, error?: any): void {
        this.logger.error(message, { error });
        this.outputChannel.appendLine(`[ERROR] ${message}`);
        if (error) {
            this.outputChannel.appendLine(error.stack || error.toString());
        }
    }

    /**
     * Show the output channel
     */
    showOutput(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose the logger
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
} 