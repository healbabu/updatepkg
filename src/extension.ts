import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './utils/logger';
import { PackageUpgrader, PackageUpdate } from './services/packageUpgrader';
import { PackageRecommenderService } from './services/packageRecommenderService';
import { ConfigurationManager } from './services/configurationManager';
import { BreakingChangeHandler } from './services/breakingChangeHandler';
import { CopilotService } from './services/copilotService';
import { DependencyGraphAnalyzer } from './services/dependencyGraphAnalyzer';
import { UpgradeStrategist, UpgradeStrategy } from './services/upgradeStrategist';

/**
 * Extension activation event handler
 * @param context The extension context
 */
export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    const configManager = new ConfigurationManager();
    const copilotService = new CopilotService(logger);
    
    // Get the corporate service URL from configuration
    const serviceUrl = configManager.getConfig('serviceUrl', 'https://api.corporate-package-service.com');
    const serviceTimeout = configManager.getConfig('serviceTimeout', 30000);
    
    const recommenderService = new PackageRecommenderService(logger, serviceUrl, serviceTimeout);
    const packageUpgrader = new PackageUpgrader(logger);
    const breakingChangeHandler = new BreakingChangeHandler(logger);

    logger.info('Extension activated');

    // 🔍 Diagnose Copilot availability on startup
    copilotService.diagnoseCopilotAvailability().then(diagnosis => {
        if (diagnosis.availableModels.length > 0) {
            logger.info('🤖 Copilot AI ready', { 
                modelCount: diagnosis.availableModels.length,
                models: diagnosis.availableModels.map(m => m.id)
            });
        } else {
            logger.warn('⚠️ Copilot AI not available', { 
                recommendations: diagnosis.recommendations 
            });
        }
    }).catch(error => {
        logger.error('Copilot diagnosis failed', error);
    });

    // Register the upgrade packages command
    const disposable = vscode.commands.registerCommand('dotnet-package-upgrader.upgradePackages', async () => {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Upgrading .NET Solution Packages',
                cancellable: true
            };

            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                token.onCancellationRequested(() => {
                    logger.info('Package upgrade cancelled by user');
                });

                const solutionPath = await findSolutionFile();
                if (!solutionPath) return;
                await handleSolutionUpdate(solutionPath, progress);
            });
        } catch (error) {
            logger.error('Error during package upgrade', error);
            vscode.window.showErrorMessage('Failed to upgrade packages. Check the output panel for details.');
        }
    });

    async function handleSolutionUpdate(solutionPath: string, progress: vscode.Progress<{ message?: string }>) {
        try {
        // 🧠 Dependency analysis (optional - can be disabled for now)
        let dependencyGraph;
        try {
            progress.report({ message: '🧠 Analyzing dependency graph...' });
            const dependencyAnalyzer = new DependencyGraphAnalyzer(logger, copilotService);
            dependencyGraph = await dependencyAnalyzer.analyzeSolutionDependencies(solutionPath);
            
            logger.info('📊 Dependency analysis completed', {
                totalPackages: dependencyGraph.packages.size,
                detectedFamilies: dependencyGraph.packageFamilies.size
            });
        } catch (error) {
            logger.warn('Dependency analysis failed, continuing without it', error);
            dependencyGraph = undefined;
        }

        // 🎯 NEW: Generate intelligent upgrade strategies  
        progress.report({ message: '🎯 Generating upgrade strategies...' });
        const upgradeStrategist = new UpgradeStrategist(logger, copilotService);
        
        // Get available updates first
        progress.report({ message: 'Analyzing solution structure...' });
        const projects = await packageUpgrader.getSolutionProjects(solutionPath);
        if (projects.length === 0) {
            vscode.window.showErrorMessage('No projects found in solution');
            return;
        }

        // Check for updates in selected projects
        progress.report({ message: 'Checking for package updates...' });
        const updatesMap = await packageUpgrader.checkForUpdatesInSolution(solutionPath);

        if (updatesMap.size === 0) {
            vscode.window.showInformationMessage('All packages are up to date!');
            return;
        }

        // 🎯 Generate upgrade strategies
        progress.report({ message: '🎯 Generating upgrade strategies...' });
        const strategies = await upgradeStrategist.generateUpgradeStrategies(
            solutionPath,
            updatesMap,
            dependencyGraph
        );

        // 🎛️ Show strategy selection
        const selectedStrategy = await showStrategySelectionWebview(context, strategies, logger);
        if (!selectedStrategy) {
            return; // User cancelled
        }

        // 🚀 Execute the selected strategy
        await executeUpgradeStrategy(selectedStrategy, solutionPath, progress, updatesMap, packageUpgrader, generateUpdateSummary);
        } catch (error) {
            logger.error('Error during package upgrade', error);
            vscode.window.showErrorMessage('Failed to upgrade packages. Check the output panel for details.');
        }
    }

    // **NEW: Generate comprehensive update summary**
    async function generateUpdateSummary(
        panel: vscode.WebviewPanel, 
        results: any, 
        conflictAnalysis: Map<string, any>
    ) {
        // **NEW: Generate markdown content for the viewer**
        const markdownContent = generateMarkdownSummary(results, conflictAnalysis);
        panel.webview.postMessage({ type: 'updateMarkdown', content: markdownContent });
        
        panel.webview.postMessage({ type: 'log', text: '\n' + '='.repeat(80) });
        panel.webview.postMessage({ type: 'log', text: '📊 UPDATE SUMMARY REPORT' });
        panel.webview.postMessage({ type: 'log', text: '='.repeat(80) });
        
        // Overall statistics
        panel.webview.postMessage({ 
            type: 'log', 
            text: `📈 Total Attempted: ${results.totalAttempted} | ✅ Successful: ${results.successes.length} | ❌ Failed: ${results.failures.length}` 
        });
        
        if (results.successes.length > 0) {
            panel.webview.postMessage({ type: 'log', text: '\n✅ SUCCESSFUL UPDATES:' });
            for (const success of results.successes) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   • ${success.package} → ${success.version} (${success.project})` 
                });
            }
        }
        
        if (results.failures.length > 0) {
            panel.webview.postMessage({ type: 'log', text: '\n❌ FAILED UPDATES:' });
            for (const failure of results.failures) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   • ${failure.package} (${failure.project})` 
                });
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `     Error: ${failure.error}` 
                });
                if (failure.details) {
                    panel.webview.postMessage({ 
                        type: 'log', 
                        text: `     Reason: ${failure.details}` 
                    });
                }
                if (failure.recommendations.length > 0) {
                    panel.webview.postMessage({ type: 'log', text: '\n🛠️  RECOMMENDED ACTIONS:' });
                    failure.recommendations.forEach((rec: string, index: number) => {
                        panel.webview.postMessage({ 
                            type: 'log', 
                            text: `   • ${index + 1}. ${rec}` 
                        });
                    });
                }
            }
            
            // **NEW: Provide actionable recommendations**
            panel.webview.postMessage({ type: 'log', text: '\n🛠️  RECOMMENDED ACTIONS:' });
            
            const hasVersionConflicts = results.failures.some((f: any) => f.error.includes('NU1107'));
            const hasNetworkIssues = results.failures.some((f: any) => f.error.includes('NU1102'));
            const hasDowngradeIssues = results.failures.some((f: any) => f.error.includes('NU1605'));
            
            if (hasVersionConflicts) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: '   1. Version Conflicts: Run "dotnet list package --include-transitive" to see full dependency tree' 
                });
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: '   2. Update related packages to compatible versions manually' 
                });
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: '   3. Consider using PackageReference with explicit version ranges' 
                });
            }
            
            if (hasNetworkIssues) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: '   • Network Issues: Check internet connection and NuGet package sources' 
                });
            }
            
            if (hasDowngradeIssues) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: '   • Downgrade Issues: Remove existing package first, then install desired version' 
                });
            }
        }
        
        if (results.conflicts.length > 0) {
            panel.webview.postMessage({ type: 'log', text: '\n🤖 AI AGENT RESOLUTIONS:' });
            for (const conflict of results.conflicts) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   • ${conflict.package} (${conflict.project}): ${conflict.conflictDetails}` 
                });
            }
        }
        
        // **NEW: Next steps recommendations**
        panel.webview.postMessage({ type: 'log', text: '\n🎯 NEXT STEPS:' });
        if (results.failures.length > 0) {
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   1. Review failed updates above and follow recommended actions' 
            });
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   2. Run "dotnet restore" to ensure package consistency' 
            });
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   3. Build solution to verify no compilation errors' 
            });
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   4. Run tests to ensure functionality is preserved' 
            });
        } else {
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   1. Run "dotnet restore" to finalize package updates' 
            });
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   2. Build and test your solution' 
            });
            panel.webview.postMessage({ 
                type: 'log', 
                text: '   3. Commit changes to source control' 
            });
        }
        
        panel.webview.postMessage({ type: 'log', text: '='.repeat(80) });
        panel.webview.postMessage({ type: 'log', text: '✨ Update process completed!' });
    }

    // **NEW: Generate markdown summary for the viewer**
    function generateMarkdownSummary(results: any, conflictAnalysis: Map<string, any>): string {
        const timestamp = new Date().toLocaleString();
        const successRate = results.totalAttempted > 0 ? 
            Math.round((results.successes.length / results.totalAttempted) * 100) : 0;
        
        let markdown = `# 📊 .NET Package Upgrade Summary

*Generated on ${timestamp}*

## 📈 Overview

<span class="status-badge status-info">Total Attempted: ${results.totalAttempted}</span>
<span class="status-badge status-success">Successful: ${results.successes.length}</span>
<span class="status-badge status-error">Failed: ${results.failures.length}</span>
<span class="status-badge status-info">Success Rate: ${successRate}%</span>

---

`;

        // Add successful updates
        if (results.successes.length > 0) {
            markdown += `## ✅ Successful Updates

| Package | Version | Project |
|---------|---------|---------|
`;
            for (const success of results.successes) {
                markdown += `| \`${success.package}\` | **${success.version}** | ${success.project} |\n`;
            }
            markdown += '\n';
        }

        // Add failed updates with detailed analysis
        if (results.failures.length > 0) {
            markdown += `## ❌ Failed Updates & Resolution Strategies

`;
            for (const failure of results.failures) {
                markdown += `### 📦 ${failure.package}

**Project:** ${failure.project}  
**Error:** \`${failure.error}\`  
`;
                if (failure.details) {
                    markdown += `**Reason:** ${failure.details}  \n`;
                }

                if (failure.recommendations && failure.recommendations.length > 0) {
                    markdown += `
**🛠️ Recommended Solutions:**
`;
                    failure.recommendations.forEach((rec: string, index: number) => {
                        markdown += `${index + 1}. ${rec}\n`;
                    });
                }
                markdown += '\n---\n\n';
            }
        }

        // Add AI resolutions
        if (results.conflicts && results.conflicts.length > 0) {
            markdown += `## 🤖 AI Agent Conflict Resolutions

`;
            for (const conflict of results.conflicts) {
                markdown += `### ${conflict.package} (${conflict.project})
${conflict.conflictDetails}

`;
            }
        }

        // Add detailed conflict analysis from conflictAnalysis Map
        if (conflictAnalysis.size > 0) {
            markdown += `## 🔍 Detailed Conflict Analysis

`;
            for (const [packageName, analysis] of conflictAnalysis) {
                markdown += `### 📦 ${packageName}

**Recommended Version:** \`${analysis.recommendedVersion}\`

**AI Analysis:** *${analysis.reasoning}*

#### 🔄 Migration Steps
`;
                if (analysis.migrationSteps && analysis.migrationSteps.length > 0) {
                    analysis.migrationSteps.forEach((step: string, index: number) => {
                        markdown += `${index + 1}. ${step}\n`;
                    });
                } else {
                    markdown += `- No specific migration steps identified\n`;
                }

                markdown += `
#### ⚠️ Breaking Changes
`;
                if (analysis.breakingChanges && analysis.breakingChanges.length > 0) {
                    analysis.breakingChanges.forEach((change: string) => {
                        markdown += `- ${change}\n`;
                    });
                } else {
                    markdown += `- No breaking changes identified\n`;
                }

                markdown += `
#### 🧪 Test Impact
`;
                if (analysis.testImpact && analysis.testImpact.length > 0) {
                    analysis.testImpact.forEach((impact: string) => {
                        markdown += `- ${impact}\n`;
                    });
                } else {
                    markdown += `- No test impact identified\n`;
                }

                markdown += '\n---\n\n';
            }
        }

        // Add general recommendations
        markdown += `## 🎯 Next Steps & Best Practices

`;
        
        if (results.failures.length > 0) {
            markdown += `### 🚨 Immediate Actions Required

1. **Review Failed Updates:** Address each failed package using the recommended solutions above
2. **Run Package Restore:** Execute \`dotnet restore\` to ensure package consistency
3. **Build Verification:** Run \`dotnet build\` to verify no compilation errors
4. **Test Validation:** Execute your test suite to ensure functionality is preserved

### 🔧 Common Resolution Strategies

`;
            const hasVersionConflicts = results.failures.some((f: any) => f.error.includes('NU1107'));
            const hasNetworkIssues = results.failures.some((f: any) => f.error.includes('NU1102'));
            const hasDowngradeIssues = results.failures.some((f: any) => f.error.includes('NU1605'));
            
            if (hasVersionConflicts) {
                markdown += `#### Version Conflicts (NU1107)
- Run \`dotnet list package --include-transitive\` to see full dependency tree
- Update related packages to compatible versions manually
- Consider using PackageReference with explicit version ranges
- Align major versions across related packages (e.g., all AWS SDK packages to v4)

`;
            }
            
            if (hasNetworkIssues) {
                markdown += `#### Network Issues (NU1102)
- Check internet connection and proxy settings
- Verify NuGet package sources: \`dotnet nuget list source\`
- Clear NuGet cache: \`dotnet nuget locals all --clear\`

`;
            }
            
            if (hasDowngradeIssues) {
                markdown += `#### Downgrade Issues (NU1605)
- Remove existing package: \`dotnet remove package <PackageName>\`
- Install desired version: \`dotnet add package <PackageName> --version <Version>\`
- Check if newer version is required by other dependencies

`;
            }
        } else {
            markdown += `### ✅ Success! Final Steps

1. **Finalize Updates:** Run \`dotnet restore\` to ensure all packages are properly restored
2. **Build & Test:** Execute \`dotnet build\` and run your test suite
3. **Commit Changes:** Save your progress to source control
4. **Documentation:** Update any relevant documentation with new package versions

`;
        }

        markdown += `### 📋 Useful Commands

\`\`\`bash
# Check for outdated packages
dotnet list package --outdated

# See all package dependencies
dotnet list package --include-transitive

# Clear package cache
dotnet nuget locals all --clear

# Restore packages with verbose output
dotnet restore --verbosity diagnostic

# Build with detailed output
dotnet build --verbosity normal
\`\`\`

---
*Generated by .NET Package Upgrader with AI Agent assistance*`;

        return markdown;
    }

    // Helper to find the solution file
    async function findSolutionFile(): Promise<string | undefined> {
        const solutionFiles = await vscode.workspace.findFiles('**/*.sln');
        if (solutionFiles.length === 0) {
            vscode.window.showErrorMessage('No solution file (.sln) found in workspace.');
            return undefined;
        }
        if (solutionFiles.length === 1) {
            return solutionFiles[0].fsPath;
        }
        const picked = await vscode.window.showQuickPick(
            solutionFiles.map(f => f.fsPath),
            { placeHolder: 'Select the solution file to use' }
        );
        return picked;
    }

    // **NEW: Enhanced webview function that includes AI analysis**
    async function showUpdateWebviewWithAnalysis(
        context: vscode.ExtensionContext,
        updatesMap: Map<string, PackageUpdate[]>,
        conflictAnalysis: Map<string, any>,
        logger: Logger,
        onApply: (selected: { [project: string]: string[] }, panel: vscode.WebviewPanel) => Promise<void>,
        singleProjectName?: string
    ) {
        const panel = vscode.window.createWebviewPanel(
            'packageUpdates',
            'Package Updates',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>.NET Package Upgrader</title>
    <style>
        body { font-family: "Segoe UI", Arial, sans-serif; background: #f3f3f3; margin: 0; padding: 0; }
        .header { background: #0078d4; color: #fff; padding: 24px 32px 16px 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.04); }
        .header h1 { margin: 0 0 4px 0; font-size: 2rem; font-weight: 600; letter-spacing: 0.5px; }
        .header h2 { margin: 0; font-size: 1.2rem; font-weight: 400; color: #c7e0f4; }
        .container { margin: 32px auto; max-width: 1200px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 10px 12px; text-align: left; }
        th { background: #e5e5e5; color: #222; font-weight: 600; border-bottom: 2px solid #c8c8c8; }
        tr:nth-child(even) { background: #f9f9f9; }
        tr:hover { background: #e6f2fb; }
        button { background: #0078d4; color: #fff; border: none; border-radius: 4px; padding: 10px 24px; font-size: 1rem; font-weight: 500; cursor: pointer; transition: background 0.2s; margin-bottom: 16px; }
        button:disabled { background: #b3d6f2; color: #fff; cursor: not-allowed; }
        button:hover:enabled { background: #005a9e; }
        #progress { margin-top: 20px; }
        #log { margin-top: 20px; background: #f4f4f4; padding: 10px; height: 120px; overflow: auto; border-radius: 4px; border: 1px solid #e1e1e1; font-size: 0.95rem; }
        
        /* **NEW: Markdown Viewer Styles** */
        .markdown-viewer-container { margin-top: 24px; }
        .markdown-viewer-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            background: #f8f9fa; 
            padding: 12px 16px; 
            border: 1px solid #dee2e6; 
            border-bottom: none; 
            border-radius: 6px 6px 0 0; 
        }
        .markdown-viewer-header h3 { 
            margin: 0; 
            font-size: 1.1rem; 
            color: #495057; 
            display: flex; 
            align-items: center; 
        }
        .markdown-viewer-header h3::before { 
            content: "📋"; 
            margin-right: 8px; 
        }
        .markdown-toggle { 
            background: #6c757d; 
            color: white; 
            border: none; 
            padding: 4px 12px; 
            border-radius: 4px; 
            font-size: 0.85rem; 
            cursor: pointer; 
        }
        .markdown-toggle:hover { background: #5a6268; }
        .markdown-viewer { 
            background: #fff; 
            border: 1px solid #dee2e6; 
            border-radius: 0 0 6px 6px; 
            max-height: 400px; 
            overflow: auto; 
            padding: 20px; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; 
            line-height: 1.6; 
        }
        .markdown-viewer.collapsed { display: none; }
        
        /* Markdown Content Styling */
        .markdown-viewer h1, .markdown-viewer h2, .markdown-viewer h3, .markdown-viewer h4 { 
            margin: 24px 0 16px 0; 
            font-weight: 600; 
            line-height: 1.25; 
        }
        .markdown-viewer h1 { font-size: 2rem; border-bottom: 1px solid #eaecef; padding-bottom: 10px; }
        .markdown-viewer h2 { font-size: 1.5rem; border-bottom: 1px solid #eaecef; padding-bottom: 8px; }
        .markdown-viewer h3 { font-size: 1.25rem; }
        .markdown-viewer h4 { font-size: 1rem; }
        .markdown-viewer p { margin: 16px 0; }
        .markdown-viewer ul, .markdown-viewer ol { margin: 16px 0; padding-left: 30px; }
        .markdown-viewer li { margin: 8px 0; }
        .markdown-viewer code { 
            background: #f6f8fa; 
            padding: 2px 6px; 
            border-radius: 3px; 
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; 
            font-size: 0.85em; 
        }
        .markdown-viewer pre { 
            background: #f6f8fa; 
            padding: 16px; 
            border-radius: 6px; 
            overflow: auto; 
            margin: 16px 0; 
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; 
            font-size: 0.85em; 
        }
        .markdown-viewer blockquote { 
            border-left: 4px solid #dfe2e5; 
            padding: 0 16px; 
            color: #6a737d; 
            margin: 16px 0; 
        }
        .markdown-viewer table { 
            border-collapse: collapse; 
            margin: 16px 0; 
            width: 100%; 
        }
        .markdown-viewer table th, .markdown-viewer table td { 
            border: 1px solid #dfe2e5; 
            padding: 6px 13px; 
            text-align: left; 
        }
        .markdown-viewer table th { 
            background: #f6f8fa; 
            font-weight: 600; 
        }
        .markdown-viewer .status-badge { 
            display: inline-block; 
            padding: 2px 8px; 
            border-radius: 12px; 
            font-size: 0.75rem; 
            font-weight: 500; 
            margin-right: 8px; 
        }
        .markdown-viewer .status-success { background: #d4edda; color: #155724; }
        .markdown-viewer .status-error { background: #f8d7da; color: #721c24; }
        .markdown-viewer .status-warning { background: #fff3cd; color: #856404; }
        .markdown-viewer .status-info { background: #d1ecf1; color: #0c5460; }
        
        .project-section { margin-bottom: 32px; }
        .project-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; color: #0078d4; }
        
        /* **NEW: Styles for AI analysis sections** */
        .ai-analysis-section { background: #f0f8ff; border-left: 4px solid #0078d4; margin: 24px 0; padding: 16px; border-radius: 0 4px 4px 0; }
        .ai-analysis-title { font-size: 1.2rem; font-weight: 600; color: #0078d4; margin-bottom: 12px; display: flex; align-items: center; }
        .ai-analysis-title::before { content: "🤖"; margin-right: 8px; }
        .conflict-warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 12px; margin: 12px 0; }
        .conflict-warning h4 { margin: 0 0 8px 0; color: #856404; }
        .analysis-details { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
        .analysis-card { background: #fff; border: 1px solid #dee2e6; border-radius: 4px; padding: 12px; }
        .analysis-card h5 { margin: 0 0 8px 0; color: #495057; font-size: 0.9rem; font-weight: 600; }
        .analysis-card ul { margin: 4px 0; padding-left: 16px; }
        .analysis-card li { margin: 4px 0; font-size: 0.85rem; }
        .toggle-details { cursor: pointer; color: #0078d4; font-size: 0.9rem; margin-top: 8px; }
        .toggle-details:hover { text-decoration: underline; }
        .details-hidden { display: none; }
        .reasoning-text { font-style: italic; color: #6c757d; margin: 8px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>.NET Package Upgrader</h1>
        <h2>AI-Powered Package Updates${singleProjectName ? ` for <span style=\"color:#fff;\">${singleProjectName}</span>` : ''}</h2>
    </div>
    <div class="container">
`;

        // **NEW: Display AI analysis section if conflicts were detected**
        if (conflictAnalysis.size > 0) {
            html += `
        <div class="ai-analysis-section">
            <div class="ai-analysis-title">AI Agent Analysis Results</div>
            <p>The AI Agent has analyzed your packages and detected potential version conflicts. Review the recommendations below:</p>
`;
            
            for (const [packageName, analysis] of conflictAnalysis) {
                html += `
            <div class="conflict-warning">
                <h4>📦 ${packageName}</h4>
                <p><strong>Recommended Version:</strong> ${analysis.recommendedVersion}</p>
                <p class="reasoning-text">${analysis.reasoning}</p>
                
                <div class="toggle-details" onclick="toggleDetails('${packageName}')">▼ Show detailed analysis</div>
                <div id="details-${packageName}" class="details-hidden">
                    <div class="analysis-details">
                        <div class="analysis-card">
                            <h5>Migration Steps</h5>
                            <ul>
                                ${analysis.migrationSteps.map((step: string) => `<li>${step}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="analysis-card">
                            <h5>Breaking Changes</h5>
                            <ul>
                                ${analysis.breakingChanges.map((change: string) => `<li>${change}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="analysis-card">
                            <h5>Compatibility Notes</h5>
                            <ul>
                                ${analysis.compatibilityNotes.map((note: string) => `<li>${note}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="analysis-card">
                            <h5>Test Impact</h5>
                            <ul>
                                ${analysis.testImpact.map((impact: string) => `<li>${impact}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
`;
            }
            
            html += `
        </div>
`;
        }

        // Display the packages table as before
        for (const [project, updates] of updatesMap) {
            html += `
        <div class="project-section">
            <div class="project-title">${project}</div>
            <table>
                <tr>
                    <th>Update?</th>
                    <th>Package</th>
                    <th>Current</th>
                    <th>Latest</th>
                    <th>AI Recommended</th>
                    <th>Breaking Changes</th>
                    <th>Migration Complexity</th>
                </tr>
                ${updates.map(update => {
                    const conflict = conflictAnalysis.get(update.packageName);
                    const aiRecommended = conflict ? conflict.recommendedVersion : update.recommendedVersion;
                    const hasConflictResolution = conflict ? '🤖' : '';
                    return `
                <tr>
                    <td><input type="checkbox" checked data-project="${project}" data-pkg="${update.packageName}"></td>
                    <td>${update.packageName} ${hasConflictResolution}</td>
                    <td>${update.currentVersion}</td>
                    <td>${update.recommendedVersion}</td>
                    <td><strong>${aiRecommended}</strong></td>
                    <td>${update.hasBreakingChanges ? 'Yes' : 'No'}</td>
                    <td>${update.migrationComplexity || 'low'}</td>
                </tr>
                `;
                }).join('')}
            </table>
        </div>
`;
        }

        html += `
        <button id="applyBtn" onclick="applyUpdates()">Apply AI-Recommended Updates</button>
        <div id="progress"></div>
        <div id="log">AI Agent ready to apply updates...</div>
        
        <!-- **NEW: Markdown Viewer Section** -->
        <div class="markdown-viewer-container">
            <div class="markdown-viewer-header">
                <h3>Package Upgrade Summary & Resolution Guide</h3>
                <button class="markdown-toggle" onclick="toggleMarkdownViewer()">Hide</button>
            </div>
            <div id="markdownViewer" class="markdown-viewer">
                <div style="text-align: center; color: #6c757d; padding: 40px;">
                    <p>📊 Upgrade summary will appear here after processing...</p>
                    <p><em>This section will show detailed analysis, conflicts, and resolution strategies</em></p>
                </div>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const applyBtn = document.getElementById('applyBtn');
        let markdownViewerCollapsed = false;
        
        // **NEW: Markdown viewer toggle functionality**
        function toggleMarkdownViewer() {
            const viewer = document.getElementById('markdownViewer');
            const toggle = document.querySelector('.markdown-toggle');
            markdownViewerCollapsed = !markdownViewerCollapsed;
            
            if (markdownViewerCollapsed) {
                viewer.classList.add('collapsed');
                toggle.textContent = 'Show';
            } else {
                viewer.classList.remove('collapsed');
                toggle.textContent = 'Hide';
            }
        }
        
        // **NEW: Simple markdown to HTML converter**
        function markdownToHtml(markdown) {
            let html = markdown
                // Headers
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                // Bold and italic
                .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                // Code blocks
                .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
                // Inline code
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                // Lists
                .replace(/^\\* (.*$)/gim, '<li>$1</li>')
                .replace(/^- (.*$)/gim, '<li>$1</li>')
                // Blockquotes
                .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
                // Line breaks
                .replace(/\\n/g, '<br>');
            
            // Wrap consecutive <li> elements in <ul>
            html = html.replace(/(<li>.*?<\\/li>)(\\s*<li>.*?<\\/li>)*/g, function(match) {
                return '<ul>' + match + '</ul>';
            });
            
            return html;
        }
        
        // **NEW: Update markdown viewer with content**
        function updateMarkdownViewer(markdownContent) {
            const viewer = document.getElementById('markdownViewer');
            const htmlContent = markdownToHtml(markdownContent);
            viewer.innerHTML = htmlContent;
        }
        
        function toggleDetails(packageName) {
            const details = document.getElementById('details-' + packageName);
            const toggle = document.querySelector('[onclick*="' + packageName + '"]');
            if (details.classList.contains('details-hidden')) {
                details.classList.remove('details-hidden');
                toggle.textContent = '▲ Hide detailed analysis';
            } else {
                details.classList.add('details-hidden');
                toggle.textContent = '▼ Show detailed analysis';
            }
        }
        
        function applyUpdates() {
            applyBtn.disabled = true;
            const selected = {};
            Array.from(document.querySelectorAll('input[type=checkbox]:checked')).forEach(cb => {
                const project = cb.getAttribute('data-project');
                const pkg = cb.getAttribute('data-pkg');
                if (!selected[project]) selected[project] = [];
                selected[project].push(pkg);
            });
            vscode.postMessage({ command: 'applyUpdates', selected });
        }
        
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'progress') {
                document.getElementById('progress').innerHTML = '<progress value="' + msg.value + '" max="' + msg.max + '"></progress> ' + msg.text;
            }
            if (msg.type === 'log') {
                const logDiv = document.getElementById('log');
                logDiv.innerHTML += '<div>' + msg.text + '</div>';
                logDiv.scrollTop = logDiv.scrollHeight;
            }
            if (msg.type === 'disableButton') {
                applyBtn.disabled = true;
            }
            if (msg.type === 'enableButton') {
                applyBtn.disabled = false;
            }
            // **NEW: Handle markdown viewer updates**
            if (msg.type === 'updateMarkdown') {
                updateMarkdownViewer(msg.content);
            }
        });
    </script>
</body>
</html>`;

        panel.webview.html = html;

        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'applyUpdates') {
                    panel.webview.postMessage({ type: 'log', text: 'Starting AI-guided update process...' });
                    await onApply(message.selected, panel);
                }
            },
            undefined,
            context.subscriptions
        );
    }

    // Helper function to find which family a package belongs to
    function findPackageFamily(packageName: string, families: Map<string, string[]>): string | undefined {
        for (const [familyName, packages] of families) {
            if (packages.includes(packageName)) {
                return familyName;
            }
        }
        return undefined;
    }

    // Register the Copilot agent
    context.subscriptions.push(copilotService);

    context.subscriptions.push(disposable);
}

export function deactivate() {
    // Cleanup code here
}

interface ProjectItem {
    label: string;
    description: string;
    projectPath: string;
}

/**
 * 🎛️ Show strategy selection interface
 */
async function showStrategySelectionWebview(
    context: vscode.ExtensionContext,
    strategies: UpgradeStrategy[],
    logger: Logger
): Promise<UpgradeStrategy | undefined> {
    
    return new Promise((resolve) => {
        const panel = vscode.window.createWebviewPanel(
            'upgradeStrategy',
            'Choose Upgrade Strategy',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = generateStrategySelectionHTML(strategies);
        
        panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'selectStrategy':
                        resolve(strategies[message.strategyIndex]);
                        panel.dispose();
                        break;
                    case 'cancel':
                        resolve(undefined);
                        panel.dispose();
                        break;
                }
            }
        );
    });
}

/**
 * 🎨 Generate HTML for strategy selection
 */
function generateStrategySelectionHTML(strategies: UpgradeStrategy[]): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
            .strategy-card { 
                border: 1px solid var(--vscode-panel-border);
                margin: 15px 0; padding: 20px; border-radius: 8px;
                background: var(--vscode-editor-background);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .strategy-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .strategy-title { font-size: 18px; font-weight: bold; margin: 0; }
            .risk-badge { padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            .risk-low { background: #0e7245; color: white; }
            .risk-medium { background: #f59e0b; color: white; }
            .risk-high { background: #dc2626; color: white; }
            .strategy-description { margin: 10px 0; color: var(--vscode-descriptionForeground); }
            .phase-list { margin: 15px 0; }
            .phase-item { 
                margin: 8px 0; padding: 12px; 
                background: var(--vscode-input-background); 
                border-radius: 4px; border-left: 3px solid var(--vscode-button-background);
            }
            .phase-title { font-weight: bold; margin-bottom: 5px; }
            .phase-description { font-size: 14px; color: var(--vscode-descriptionForeground); }
            .ai-recommendation { 
                background: var(--vscode-textCodeBlock-background); 
                padding: 15px; margin: 15px 0; border-radius: 6px;
                border-left: 4px solid #0078d4;
            }
            .pros-cons { display: flex; gap: 20px; margin: 15px 0; }
            .pros, .cons { flex: 1; }
            .pros h4 { color: #0e7245; margin: 0 0 8px 0; }
            .cons h4 { color: #dc2626; margin: 0 0 8px 0; }
            .pros ul, .cons ul { margin: 0; padding-left: 20px; }
            .pros li, .cons li { margin: 4px 0; }
            button { 
                background: var(--vscode-button-background); 
                color: var(--vscode-button-foreground);
                border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer;
                font-size: 14px; font-weight: bold;
                transition: background-color 0.2s;
            }
            button:hover { background: var(--vscode-button-hoverBackground); }
            .button-container { text-align: right; margin-top: 15px; }
            .footer { text-align: center; margin-top: 30px; }
            .footer button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        </style>
    </head>
    <body>
        <h1>🎯 Choose Your Upgrade Strategy</h1>
        <p>AI has analyzed your dependencies and generated optimized upgrade strategies:</p>
        
        ${strategies.map((strategy, index) => `
            <div class="strategy-card">
                <div class="strategy-header">
                    <h3 class="strategy-title">${strategy.name}</h3>
                    <div>
                        <span class="risk-badge risk-${strategy.estimatedRisk}">${strategy.estimatedRisk} risk</span>
                        <span style="margin-left: 10px; color: var(--vscode-descriptionForeground);">⏱️ ${strategy.estimatedTime}</span>
                    </div>
                </div>
                
                <p class="strategy-description">${strategy.description}</p>
                
                ${strategy.aiRecommendation ? `
                    <div class="ai-recommendation">
                        <strong>🤖 AI Recommendation:</strong> ${strategy.aiRecommendation}
                    </div>
                ` : ''}
                
                <div class="phase-list">
                    <strong>📋 Upgrade Phases (${strategy.phases.length}):</strong>
                    ${strategy.phases.slice(0, 3).map(phase => `
                        <div class="phase-item">
                            <div class="phase-title">${phase.name} (${phase.packageUpdates.length} packages)</div>
                            <div class="phase-description">${phase.description}</div>
                        </div>
                    `).join('')}
                    ${strategy.phases.length > 3 ? `<div style="text-align: center; color: var(--vscode-descriptionForeground); font-style: italic;">... and ${strategy.phases.length - 3} more phases</div>` : ''}
                </div>
                
                <div class="pros-cons">
                    <div class="pros">
                        <h4>✅ Pros:</h4>
                        <ul>
                            ${strategy.pros.map(pro => `<li>${pro}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="cons">
                        <h4>⚠️ Cons:</h4>
                        <ul>
                            ${strategy.cons.map(con => `<li>${con}</li>`).join('')}
                        </ul>
                    </div>
                </div>
                
                <div class="button-container">
                    <button onclick="selectStrategy(${index})">Choose This Strategy</button>
                </div>
            </div>
        `).join('')}
        
        <div class="footer">
            <button onclick="cancel()">Cancel</button>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function selectStrategy(index) {
                vscode.postMessage({ command: 'selectStrategy', strategyIndex: index });
            }
            
            function cancel() {
                vscode.postMessage({ command: 'cancel' });
            }
        </script>
    </body>
    </html>`;
}

/**
 * 🚀 Execute the selected upgrade strategy
 */
async function executeUpgradeStrategy(
    strategy: UpgradeStrategy,
    solutionPath: string,
    progress: vscode.Progress<{ message?: string }>,
    updatesMap: Map<string, PackageUpdate[]>,
    packageUpgrader: PackageUpgrader,
    generateUpdateSummary: (panel: vscode.WebviewPanel, results: any, conflictAnalysis: Map<string, any>) => Promise<void>
): Promise<void> {
    
    progress.report({ message: `🚀 Executing ${strategy.name}...` });
    
    const updateResults = {
        successes: [] as Array<{package: string, project: string, version: string}>,
        failures: [] as Array<{package: string, project: string, error: string, details?: string, recommendations: string[]}>,
        conflicts: [] as Array<{package: string, project: string, conflictDetails: string}>,
        totalAttempted: 0
    };

    updateResults.totalAttempted = strategy.phases.reduce((sum, phase) => sum + phase.packageUpdates.length, 0);

    const panel = vscode.window.createWebviewPanel(
        'upgradeExecution',
        `Executing ${strategy.name}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = generateEnhancedExecutionHTML(strategy);
    
    for (const phase of strategy.phases.sort((a, b) => a.order - b.order)) {
        panel.webview.postMessage({ 
            type: 'log', 
            text: `🎯 Starting Phase ${phase.order}: ${phase.name}` 
        });

        for (const update of phase.packageUpdates) {
            try {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `⏳ Updating ${update.packageName} to ${update.recommendedVersion}...`
                });
                
                let updateProjectPath = '';
                for (const [projectPath, projectUpdates] of updatesMap) {
                    if (projectUpdates.some(u => u.packageName === update.packageName)) {
                        updateProjectPath = projectPath;
                        break;
                    }
                }
                
                await packageUpgrader.updatePackageWithDetails(
                    update.packageName,
                    update.recommendedVersion,
                    updateProjectPath
                );
                
                updateResults.successes.push({
                    package: update.packageName,
                    project: updateProjectPath,
                    version: update.recommendedVersion
                });
                
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `✅ Successfully updated ${update.packageName} to ${update.recommendedVersion}`
                });
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                let errorProjectPath = '';
                for (const [projectPath, projectUpdates] of updatesMap) {
                    if (projectUpdates.some(u => u.packageName === update.packageName)) {
                        errorProjectPath = projectPath;
                        break;
                    }
                }
                
                updateResults.failures.push({
                    package: update.packageName,
                    project: errorProjectPath,
                    error: errorMessage,
                    recommendations: [`Consider manual update`, `Check for breaking changes`]
                });
                
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `❌ Failed to update ${update.packageName}: ${errorMessage}` 
                });
            }
        }
    }

    try {
        panel.webview.postMessage({ type: 'log', text: '🔍 Validating solution after updates...' });
        
        await packageUpgrader.validateSolutionAfterUpdates(solutionPath);
        
        panel.webview.postMessage({ type: 'log', text: '✅ Solution validation completed' });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (error && typeof error === 'object' && 'details' in error) {
            const structuredError = (error as any).details;
            
            panel.webview.postMessage({ 
                type: 'log', 
                text: `⚠️ ${structuredError.aiAnalysis?.errorType || 'Validation Issues'} Detected:` 
            });
            
            // ✅ Show AI analysis if available
            if (structuredError.aiAnalysis) {
                const ai = structuredError.aiAnalysis;
                
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   🤖 AI Analysis: ${ai.summary}` 
                });
                
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   🔍 Root Cause: ${ai.rootCause}` 
                });
                
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   ⚠️ Severity: ${ai.severity.toUpperCase()}` 
                });
                
                // Show quick fix if available
                if (ai.quickFix) {
                    panel.webview.postMessage({ 
                        type: 'log', 
                        text: `   ⚡ Quick Fix: ${ai.quickFix}` 
                    });
                }
            }
            
            // Show detailed conflict info for version conflicts
            if (structuredError.conflictDetails) {
                const conflict = structuredError.conflictDetails;
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   📦 Conflicting Package: ${conflict.conflictingPackage}` 
                });
                
                if (conflict.dependencyChains && conflict.dependencyChains.length > 0) {
                    panel.webview.postMessage({ 
                        type: 'log', 
                        text: `   🔗 Dependency Conflicts:` 
                    });
                    conflict.dependencyChains.slice(0, 3).forEach((chain: string) => {
                        panel.webview.postMessage({ 
                            type: 'log', 
                            text: `      ${chain}` 
                        });
                    });
                }
            }
            
            // ✅ ENHANCED: Show AI recommendations for ANY error type
            if (structuredError.recommendations && structuredError.recommendations.length > 0) {
                panel.webview.postMessage({ 
                    type: 'log', 
                    text: `   🤖 AI RECOMMENDATIONS:` 
                });
                structuredError.recommendations.slice(0, 5).forEach((rec: string, index: number) => {
                    panel.webview.postMessage({ 
                        type: 'log', 
                        text: `      ${index + 1}. ${rec}` 
                    });
                });
            }
            
        } else {
            panel.webview.postMessage({ 
                type: 'log', 
                text: `⚠️ Validation warning: ${errorMessage}` 
            });
        }
    }

    await generateUpdateSummary(panel, updateResults, new Map());
}

/**
 * 🎨 Generate HTML for strategy execution
 */
function generateEnhancedExecutionHTML(strategy: UpgradeStrategy): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .ai-attribution { 
                background: linear-gradient(90deg, #0078d4, #106ebe);
                color: white; padding: 12px; border-radius: 6px;
                margin-bottom: 15px; display: flex; align-items: center;
            }
            .ai-icon { font-size: 18px; margin-right: 8px; }
            .strategy-header { 
                display: flex; justify-content: space-between; 
                align-items: center; margin-bottom: 20px;
            }
            .progress-ring { 
                width: 60px; height: 60px; 
                border: 4px solid var(--vscode-button-background);
                border-radius: 50%; position: relative;
            }
            .phase-timeline {
                display: flex; flex-direction: column; gap: 10px;
                margin: 20px 0;
            }
            .phase-item {
                display: flex; align-items: center; gap: 10px;
                padding: 8px; border-radius: 4px;
                transition: background 0.3s;
            }
            .phase-item.active { background: var(--vscode-button-background); }
            .phase-item.completed { background: var(--vscode-button-secondaryBackground); }
            .phase-status { width: 20px; height: 20px; border-radius: 50%; }
            .status-pending { background: #666; }
            .status-active { background: #0078d4; animation: pulse 1s infinite; }
            .status-completed { background: #107c10; }
            .status-error { background: #d13438; }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        </style>
    </head>
    <body>
        <div class="ai-attribution">
            <span class="ai-icon">🤖</span>
            <div>
                <strong>AI-Recommended Strategy:</strong> ${strategy.name}
                <br><small>${strategy.aiRecommendation || strategy.description}</small>
            </div>
        </div>
        
        <div class="strategy-header">
            <div>
                <h2>${strategy.name}</h2>
                <p>${strategy.description}</p>
            </div>
            <div class="progress-ring" id="progressRing">
                <span id="progressText">0%</span>
            </div>
        </div>
        
        <div class="phase-timeline" id="phaseTimeline">
            ${strategy.phases.map((phase, index) => `
                <div class="phase-item" data-phase="${index}">
                    <div class="phase-status status-pending" id="status-${index}"></div>
                    <div class="phase-details">
                        <strong>Phase ${phase.order}: ${phase.name}</strong>
                        <br><small>${phase.packageUpdates.length} packages</small>
                    </div>
                    <div class="phase-time" id="time-${index}">--:--</div>
                </div>
            `).join('')}
        </div>
        
        <div class="log-container" id="logContainer">
            <div class="log-line">🎯 Strategy execution started...</div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            let currentPhase = -1;
            let startTime = Date.now();
            
            function updatePhaseStatus(phaseIndex, status) {
                const statusEl = document.getElementById(\`status-\${phaseIndex}\`);
                const phaseEl = document.querySelector(\`[data-phase="\${phaseIndex}"]\`);
                
                // Update status indicator
                statusEl.className = \`phase-status status-\${status}\`;
                
                // Update phase item class
                phaseEl.className = \`phase-item \${status === 'active' ? 'active' : status === 'completed' ? 'completed' : ''}\`;
                
                // Update timing
                if (status === 'completed') {
                    const timeEl = document.getElementById(\`time-\${phaseIndex}\`);
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    timeEl.textContent = \`\${elapsed}s\`;
                }
            }
            
            window.addEventListener('message', event => {
                const message = event.data;
                
                if (message.type === 'phaseStart') {
                    if (currentPhase >= 0) {
                        updatePhaseStatus(currentPhase, 'completed');
                    }
                    currentPhase = message.phaseIndex;
                    updatePhaseStatus(currentPhase, 'active');
                    startTime = Date.now();
                }
                
                if (message.type === 'phaseComplete') {
                    updatePhaseStatus(message.phaseIndex, 'completed');
                }
                
                if (message.type === 'log') {
                    const logLine = document.createElement('div');
                    logLine.className = 'log-line';
                    logLine.textContent = message.text;
                    document.getElementById('logContainer').appendChild(logLine);
                }
                
                // Update overall progress
                const completedPhases = document.querySelectorAll('.status-completed').length;
                const totalPhases = ${strategy.phases.length};
                const progressPercent = Math.round((completedPhases / totalPhases) * 100);
                document.getElementById('progressText').textContent = \`\${progressPercent}%\`;
            });
        </script>
    </body>
    </html>`;
}

// ✅ ADD: Context-aware action buttons based on results
function generateSmartActions(results: any): string {
    const actions = [];
    
    if (results.failures.length === 0) {
        actions.push(`
            <button onclick="runTests()">🧪 Run Tests</button>
            <button onclick="commitChanges()">📝 Commit Changes</button>
        `);
    } else {
        actions.push(`
            <button onclick="showResolutions()">🔧 Auto-Fix Issues</button>
            <button onclick="rollback()">↩️ Rollback Changes</button>
        `);
    }
    
    if (results.conflicts.length > 0) {
        actions.push(`
            <button onclick="resolveConflicts()">🤖 AI Resolve Conflicts</button>
        `);
    }
    
    return `
        <div class="action-bar">
            ${actions.join('')}
            <button onclick="exportReport()">📊 Export Report</button>
        </div>
    `;
} 