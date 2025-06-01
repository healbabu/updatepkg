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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const logger_1 = require("./utils/logger");
const packageUpgrader_1 = require("./services/packageUpgrader");
const packageRecommenderService_1 = require("./services/packageRecommenderService");
const configurationManager_1 = require("./services/configurationManager");
const breakingChangeHandler_1 = require("./services/breakingChangeHandler");
const copilotService_1 = require("./services/copilotService");
/**
 * Extension activation event handler
 * @param context The extension context
 */
async function activate(context) {
    const logger = new logger_1.Logger();
    const configManager = new configurationManager_1.ConfigurationManager();
    const copilotService = new copilotService_1.CopilotService(logger);
    // Get the corporate service URL from configuration
    const serviceUrl = configManager.getConfig('serviceUrl', 'https://api.corporate-package-service.com');
    const serviceTimeout = configManager.getConfig('serviceTimeout', 30000);
    const recommenderService = new packageRecommenderService_1.PackageRecommenderService(logger, serviceUrl, serviceTimeout);
    const packageUpgrader = new packageUpgrader_1.PackageUpgrader(logger);
    const breakingChangeHandler = new breakingChangeHandler_1.BreakingChangeHandler(logger);
    logger.info('Extension activated');
    // Register the upgrade packages command
    const disposable = vscode.commands.registerCommand('dotnet-package-upgrader.upgradePackages', async () => {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }
            // Let user choose update scope
            const scope = await vscode.window.showQuickPick([
                { label: 'Current Project', description: 'Update packages in the current project' },
                { label: 'Entire Solution', description: 'Update packages across all projects in the solution' }
            ], { placeHolder: 'Choose update scope' });
            if (!scope) {
                return;
            }
            const progressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Upgrading .NET Packages',
                cancellable: true
            };
            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                token.onCancellationRequested(() => {
                    logger.info('Package upgrade cancelled by user');
                });
                if (scope.label === 'Current Project') {
                    const projectPath = await findProjectFile();
                    if (!projectPath)
                        return;
                    await handleProjectUpdate(projectPath, progress);
                }
                else {
                    const solutionPath = await findSolutionFile();
                    if (!solutionPath)
                        return;
                    await handleSolutionUpdate(solutionPath, progress);
                }
            });
        }
        catch (error) {
            logger.error('Error during package upgrade', error);
            vscode.window.showErrorMessage('Failed to upgrade packages. Check the output panel for details.');
        }
    });
    async function handleProjectUpdate(projectPath, progress) {
        progress.report({ message: 'Agent reviewing project for breaking changes...' });
        const breakingChangeFixes = await breakingChangeHandler.analyzeProjectForBreakingChanges(projectPath);
        if (breakingChangeFixes.length > 0) {
            vscode.window.showWarningMessage(`Agent found potential breaking changes:\n${breakingChangeFixes.map(fix => fix.description).join('\n')}`);
        }
        progress.report({ message: 'Checking for package updates...' });
        const updates = await packageUpgrader.checkForUpdates(projectPath); // Will be PackageUpdateWithProject[]
        if (updates.length === 0) {
            vscode.window.showInformationMessage('All packages are up to date!');
            return;
        }
        const projectName = updates[0]?.projectName || 'Project';
        // Wrap in a map for compatibility with new webview
        const updatesMap = new Map();
        updatesMap.set(projectName, updates);
        // For single project, we can still check for conflicts with AI
        progress.report({ message: 'AI Agent analyzing potential conflicts...' });
        const conflicts = await packageUpgrader.checkForVersionConflicts(updatesMap);
        // Prepare conflict analysis data
        const conflictAnalysis = new Map();
        for (const [packageName, analysis] of conflicts) {
            conflictAnalysis.set(packageName, analysis);
            logger.info('AI Agent conflict analysis for ' + packageName, {
                recommendedVersion: analysis.recommendedVersion,
                reasoning: analysis.reasoning
            });
        }
        // Use the enhanced webview with AI analysis
        await showUpdateWebviewWithAnalysis(context, updatesMap, conflictAnalysis, logger, async (selected, panel) => {
            progress.report({ message: 'Applying package updates...' });
            const selectedUpdates = updates.filter((u) => selected[projectName]?.includes(u.packageName));
            let completed = 0;
            panel.webview.postMessage({ type: 'disableButton' });
            for (const update of selectedUpdates) {
                // Apply conflict resolution if available
                const conflictResolution = conflictAnalysis.get(update.packageName);
                if (conflictResolution) {
                    update.recommendedVersion = conflictResolution.recommendedVersion;
                    panel.webview.postMessage({
                        type: 'log',
                        text: `🤖 AI Agent resolved conflict for ${update.packageName}: ${conflictResolution.reasoning}`
                    });
                }
                try {
                    panel.webview.postMessage({ type: 'log', text: `Updating ${update.packageName}...` });
                    await packageUpgrader.applyUpdates([update], projectPath);
                    panel.webview.postMessage({ type: 'log', text: `✅ Updated ${update.packageName}` });
                }
                catch (err) {
                    let errorMsg = '';
                    if (err && typeof err === 'object' && 'message' in err) {
                        errorMsg = err.message;
                    }
                    else {
                        errorMsg = String(err);
                    }
                    panel.webview.postMessage({ type: 'log', text: `❌ Failed to update ${update.packageName}: ${errorMsg}` });
                }
                completed++;
                panel.webview.postMessage({ type: 'progress', value: completed, max: selectedUpdates.length, text: `Updated ${update.packageName}` });
            }
            panel.webview.postMessage({ type: 'log', text: 'All updates complete.' });
            panel.webview.postMessage({ type: 'enableButton' });
        }, projectName);
    }
    async function handleSolutionUpdate(solutionPath, progress) {
        progress.report({ message: 'Analyzing solution structure...' });
        // Get all projects in solution
        const projects = await packageUpgrader.getSolutionProjects(solutionPath);
        if (projects.length === 0) {
            vscode.window.showErrorMessage('No projects found in solution');
            return;
        }
        // Let user choose which projects to update
        const projectItems = projects.map((projectPath) => ({
            label: path.basename(projectPath),
            description: projectPath,
            projectPath
        }));
        const selectedProjects = await vscode.window.showQuickPick([
            { label: 'All Projects', description: 'Update all projects in solution', projectPath: '' },
            ...projectItems
        ], {
            placeHolder: 'Select projects to update',
            canPickMany: true
        });
        if (!selectedProjects) {
            return;
        }
        const projectsToUpdate = selectedProjects.some(p => p.label === 'All Projects')
            ? projects
            : selectedProjects.map(p => p.projectPath);
        // Check for updates in selected projects
        progress.report({ message: 'Checking for package updates...' });
        const updatesMap = await packageUpgrader.checkForUpdatesInSolution(solutionPath);
        // Filter updatesMap to only selected projects
        const filteredUpdatesMap = new Map();
        for (const [projectPath, updates] of updatesMap) {
            if (projectsToUpdate.includes(projectPath)) {
                filteredUpdatesMap.set(projectPath, updates);
            }
        }
        if (filteredUpdatesMap.size === 0) {
            vscode.window.showInformationMessage('All packages are up to date!');
            return;
        }
        // **FIXED: Declare conflicts and conflictAnalysis in proper scope**
        let conflicts = new Map();
        // Check for version conflicts using AI Agent if available
        try {
            progress.report({ message: 'AI Agent analyzing version conflicts...' });
            conflicts = await packageUpgrader.checkForVersionConflicts(filteredUpdatesMap);
        }
        catch (error) {
            logger.error('AI analysis failed, proceeding without conflict resolution', error);
            progress.report({ message: 'Proceeding without AI analysis...' });
        }
        // **FIXED: Prepare conflict analysis data for the webview**
        const conflictAnalysis = new Map();
        for (const [packageName, analysis] of conflicts) {
            conflictAnalysis.set(packageName, analysis);
            logger.info('AI Agent conflict analysis for ' + packageName, {
                recommendedVersion: analysis.recommendedVersion,
                reasoning: analysis.reasoning,
                migrationSteps: analysis.migrationSteps,
                breakingChanges: analysis.breakingChanges
            });
        }
        // Display updates in webview with AI analysis
        await showUpdateWebviewWithAnalysis(context, filteredUpdatesMap, conflictAnalysis, logger, async (selected, panel) => {
            // **ENHANCED: Track all errors and successes for summary**
            const updateResults = {
                successes: [],
                failures: [],
                conflicts: [],
                totalAttempted: 0
            };
            panel.webview.postMessage({ type: 'disableButton' });
            let completed = 0;
            let total = 0;
            for (const project in selected) {
                total += selected[project].length;
            }
            updateResults.totalAttempted = total;
            panel.webview.postMessage({ type: 'log', text: '🚀 Starting package updates...' });
            for (const [projectName, packageNames] of Object.entries(selected)) {
                const projectUpdates = filteredUpdatesMap.get(projectName) || [];
                for (const packageName of packageNames) {
                    const update = projectUpdates.find(u => u.packageName === packageName);
                    if (!update)
                        continue;
                    // Apply conflict resolution if available
                    const conflictResolution = conflictAnalysis.get(update.packageName);
                    if (conflictResolution) {
                        update.recommendedVersion = conflictResolution.recommendedVersion;
                        panel.webview.postMessage({
                            type: 'log',
                            text: `🤖 AI Agent resolved conflict for ${update.packageName}: ${conflictResolution.reasoning}`
                        });
                        updateResults.conflicts.push({
                            package: update.packageName,
                            project: projectName,
                            conflictDetails: conflictResolution.reasoning
                        });
                    }
                    try {
                        panel.webview.postMessage({ type: 'log', text: `⏳ Updating ${update.packageName} in ${projectName}...` });
                        // **ENHANCED: Get detailed error information from package update**
                        await packageUpgrader.updatePackageWithDetails(update.packageName, update.recommendedVersion, projectName);
                        panel.webview.postMessage({ type: 'log', text: `✅ Successfully updated ${update.packageName} to ${update.recommendedVersion} in ${projectName}` });
                        updateResults.successes.push({
                            package: update.packageName,
                            project: projectName,
                            version: update.recommendedVersion
                        });
                    }
                    catch (err) {
                        let errorMsg = '';
                        let errorDetails = '';
                        if (err && typeof err === 'object' && 'message' in err) {
                            errorMsg = err.message;
                            // Extract more details from dotnet CLI errors
                            if (errorMsg.includes('NU1107')) {
                                errorDetails = 'Version conflict detected. This package requires a specific version that conflicts with other dependencies.';
                            }
                            else if (errorMsg.includes('NU1102')) {
                                errorDetails = 'Package not found or network connectivity issue.';
                            }
                            else if (errorMsg.includes('NU1605')) {
                                errorDetails = 'Package downgrade detected. Higher version already installed.';
                            }
                            else if (errorMsg.includes('restore')) {
                                errorDetails = 'Package restore failed. Check package sources and network connectivity.';
                            }
                        }
                        else {
                            errorMsg = String(err);
                        }
                        panel.webview.postMessage({
                            type: 'log',
                            text: `❌ Failed to update ${update.packageName} in ${projectName}: ${errorMsg}${errorDetails ? '\n   Reason: ' + errorDetails : ''}`
                        });
                        updateResults.failures.push({
                            package: update.packageName,
                            project: projectName,
                            error: errorMsg,
                            details: errorDetails
                        });
                    }
                    completed++;
                    panel.webview.postMessage({
                        type: 'progress',
                        value: completed,
                        max: total,
                        text: `Processed ${update.packageName} (${completed}/${total})`
                    });
                }
            }
            // **NEW: Generate comprehensive summary**
            await generateUpdateSummary(panel, updateResults, conflictAnalysis);
            panel.webview.postMessage({ type: 'enableButton' });
        });
    }
    // **NEW: Generate comprehensive update summary**
    async function generateUpdateSummary(panel, results, conflictAnalysis) {
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
                        text: `     Solution: ${failure.details}`
                    });
                }
            }
            // **NEW: Provide actionable recommendations**
            panel.webview.postMessage({ type: 'log', text: '\n🛠️  RECOMMENDED ACTIONS:' });
            const hasVersionConflicts = results.failures.some((f) => f.error.includes('NU1107'));
            const hasNetworkIssues = results.failures.some((f) => f.error.includes('NU1102'));
            const hasDowngradeIssues = results.failures.some((f) => f.error.includes('NU1605'));
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
        }
        else {
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
    // Helper to find the solution file
    async function findSolutionFile() {
        const solutionFiles = await vscode.workspace.findFiles('**/*.sln');
        if (solutionFiles.length === 0) {
            vscode.window.showErrorMessage('No solution file (.sln) found in workspace.');
            return undefined;
        }
        if (solutionFiles.length === 1) {
            return solutionFiles[0].fsPath;
        }
        const picked = await vscode.window.showQuickPick(solutionFiles.map(f => f.fsPath), { placeHolder: 'Select the solution file to use' });
        return picked;
    }
    // Helper to find the project file
    async function findProjectFile() {
        const projectFiles = await vscode.workspace.findFiles('**/*.csproj');
        if (projectFiles.length === 0) {
            vscode.window.showErrorMessage('No project file (.csproj) found in workspace.');
            return undefined;
        }
        if (projectFiles.length === 1) {
            return projectFiles[0].fsPath;
        }
        const picked = await vscode.window.showQuickPick(projectFiles.map(f => f.fsPath), { placeHolder: 'Select the project file to use' });
        return picked;
    }
    // **NEW: Enhanced webview function that includes AI analysis**
    async function showUpdateWebviewWithAnalysis(context, updatesMap, conflictAnalysis, logger, onApply, singleProjectName) {
        const panel = vscode.window.createWebviewPanel('packageUpdates', 'Package Updates', vscode.ViewColumn.One, { enableScripts: true });
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
                                ${analysis.migrationSteps.map((step) => `<li>${step}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="analysis-card">
                            <h5>Breaking Changes</h5>
                            <ul>
                                ${analysis.breakingChanges.map((change) => `<li>${change}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="analysis-card">
                            <h5>Compatibility Notes</h5>
                            <ul>
                                ${analysis.compatibilityNotes.map((note) => `<li>${note}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="analysis-card">
                            <h5>Test Impact</h5>
                            <ul>
                                ${analysis.testImpact.map((impact) => `<li>${impact}</li>`).join('')}
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
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const applyBtn = document.getElementById('applyBtn');
        
        function toggleDetails(packageName) {
            const details = document.getElementById('details-' + packageName);
            const toggle = document.querySelector('[onclick="toggleDetails(\\'' + packageName + '\\')"]');
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
        });
    </script>
</body>
</html>`;
        panel.webview.html = html;
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'applyUpdates') {
                panel.webview.postMessage({ type: 'log', text: 'Starting AI-guided update process...' });
                await onApply(message.selected, panel);
            }
        }, undefined, context.subscriptions);
    }
    // Register the Copilot agent
    context.subscriptions.push(copilotService);
    context.subscriptions.push(disposable);
}
function deactivate() {
    // Cleanup code here
}
//# sourceMappingURL=extension.js.map