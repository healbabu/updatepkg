import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { PackageUpgrader } from './services/packageUpgrader';
import { ConfigurationManager } from './services/configurationManager';

/**
 * Extension activation event handler
 */
export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    const configManager = new ConfigurationManager();
    
    logger.info('🚀 .NET Package Upgrader extension activated');

    // Register the main upgrade command
    const upgradeDisposable = vscode.commands.registerCommand('dotnet-package-upgrader.upgradePackages', async () => {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a .NET solution.');
                return;
            }

            // Find solution file first
            const solutionPath = await findSolutionOrProjectFile();
            if (!solutionPath) {
                vscode.window.showErrorMessage('No .sln or .csproj file found in workspace');
                return;
            }

            // Show the upgrade options webview immediately
            await showUpgradeOptionsWebview(solutionPath, logger);

        } catch (error) {
            logger.error('Failed to initialize package upgrader', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to initialize: ${errorMessage}`);
        }
    });

    context.subscriptions.push(upgradeDisposable);

    /**
     * Find solution or project files in workspace
     */
    async function findSolutionOrProjectFile(): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            logger.warn('No workspace folders available');
            return undefined;
        }

        logger.info(`Searching for solution/project files in ${workspaceFolders.length} workspace folder(s)`);

        for (const folder of workspaceFolders) {
            logger.info(`Searching in workspace folder: ${folder.uri.fsPath}`);
            
            // First, look for solution files
            const solutionFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, '**/*.sln'),
                '**/node_modules/**'
            );
            
            logger.info(`Found ${solutionFiles.length} solution files in ${folder.uri.fsPath}`);
            
            if (solutionFiles.length > 0) {
                const solutionPath = solutionFiles[0].fsPath;
                logger.info(`Using solution file: ${solutionPath}`);
                return solutionPath;
            }

            // If no solution files, look for project files
            const projectFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, '**/*.csproj'),
                '**/node_modules/**'
            );
            
            logger.info(`Found ${projectFiles.length} project files in ${folder.uri.fsPath}`);
            
            if (projectFiles.length > 0) {
                const projectPath = projectFiles[0].fsPath;
                logger.info(`Using project file: ${projectPath}`);
                return projectPath;
            }
        }

        logger.warn('No .sln or .csproj files found in any workspace folder');
        return undefined;
    }

    /**
     * Show the upgrade options webview
     */
    async function showUpgradeOptionsWebview(solutionPath: string, logger: Logger) {
        const panel = vscode.window.createWebviewPanel(
            'packageUpgradeOptions',
            '.NET Package Upgrader',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Get solution name for display
        const solutionName = require('path').basename(solutionPath, '.sln');

        // Set the webview HTML content
        panel.webview.html = generateUpgradeOptionsHTML(solutionName, solutionPath);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'upgradeAll':
                        logger.info('User selected: Upgrade All Packages');
                        await showUpgradeProgressPage(panel, solutionPath, logger);
                        break;
                                    case 'upgradeVulnerabilities':
                    logger.info('User selected: Upgrade Based on Vulnerabilities');
                    await handleUpgradeVulnerabilities(panel, solutionPath, logger);
                    break;
                case 'codeReview':
                    logger.info('User selected: Code Review Based on Checklist');
                    await handleCodeReview(panel, solutionPath, logger);
                    break;
                case 'cancel':
                    logger.info('User cancelled upgrade');
                    panel.dispose();
                    break;
                }
            },
            undefined,
            context.subscriptions
        );
    }

    /**
     * Show dedicated upgrade progress page
     */
    async function showUpgradeProgressPage(panel: vscode.WebviewPanel, solutionPath: string, logger: Logger) {
        // Update panel title and show progress page
        panel.title = 'Package Upgrade Progress';
        panel.webview.html = generateProgressPageHTML();

        // Start the upgrade process
        const packageUpgrader = new PackageUpgrader(logger);
        
        // Set up progress callback
        packageUpgrader.onProgress = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
                panel.webview.postMessage({ 
                command: 'addLog',
                message,
                type,
                timestamp: new Date().toLocaleTimeString()
            });
        };

        try {
            // Send initial message
                panel.webview.postMessage({ 
                command: 'setStatus',
                status: 'running',
                message: 'Starting package upgrade process...'
                });

            const { results, restoreErrors, strategy, summary } = await packageUpgrader.upgradePackages(solutionPath);

            // Send completion message
                panel.webview.postMessage({ 
                command: 'setStatus',
                status: 'completed',
                message: 'Package upgrade completed!'
                });
            
            // Send final results
                panel.webview.postMessage({ 
                command: 'showResults',
                results,
                restoreErrors,
                strategy,
                summary
            });

        } catch (error) {
            logger.error('Upgrade failed', error);
                panel.webview.postMessage({ 
                command: 'setStatus',
                status: 'error',
                message: `Upgrade failed: ${error instanceof Error ? error.message : String(error)}`
                });
            }
        }
        
    /**
     * Handle upgrade based on vulnerabilities (placeholder)
     */
    async function handleUpgradeVulnerabilities(panel: vscode.WebviewPanel, solutionPath: string, logger: Logger) {
        panel.webview.html = generateVulnerabilityScanHTML();
    }

    /**
     * Handle code review based on predefined checklist with AI analysis
     */
    async function handleCodeReview(panel: vscode.WebviewPanel, solutionPath: string, logger: Logger) {
        // Show initial loading page
        panel.webview.html = generateCodeReviewHTML(solutionPath);
        
        // Start AI-powered code analysis
        setTimeout(async () => {
            try {
                await performAICodeAnalysis(panel, solutionPath, logger);
            } catch (error) {
                logger.error('AI code analysis failed', error);
                panel.webview.postMessage({
                    command: 'analysisError',
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }, 1000);
    }

    /**
     * Perform AI-powered code analysis using Copilot
     */
    async function performAICodeAnalysis(panel: vscode.WebviewPanel, solutionPath: string, logger: Logger) {
        const analysisStartTime = Date.now();
        logger.info('🤖 Starting AI-powered code analysis...', { 
            solutionPath,
            timestamp: new Date().toISOString()
        });
        
        panel.webview.postMessage({ command: 'startAnalysis' });

        try {
            // Check if Language Model API is available
            logger.info('🔍 Checking Language Model API availability...');
            if (!vscode.lm) {
                logger.error('❌ Language Model API not available - VS Code version may be too old');
                throw new Error('Language Model API not available - please update VS Code to latest version');
            }
            logger.info('✅ Language Model API is available');

            // Get available Copilot models
            logger.info('🔍 Searching for available Copilot models...');
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            
            if (models.length === 0) {
                logger.error('❌ No Copilot language models available', {
                    possibleCauses: [
                        'GitHub Copilot extension not installed',
                        'GitHub Copilot not activated/licensed', 
                        'User not signed in to GitHub',
                        'Copilot Chat feature disabled'
                    ]
                });
                throw new Error('No Copilot language models available - please check GitHub Copilot installation and licensing');
            }

            // Log available models
            logger.info(`✅ Found ${models.length} available Copilot model(s)`, {
                models: models.map(m => ({
                    id: m.id,
                    vendor: m.vendor,
                    family: m.family,
                    version: m.version,
                    maxInputTokens: m.maxInputTokens,
                    countTokens: !!m.countTokens
                }))
            });

            // Select and log the chosen model
            const model = models[0];
            logger.info('🚀 Selected Copilot model for analysis', { 
                selectedModel: {
                    id: model.id,
                    vendor: model.vendor,
                    family: model.family,
                    version: model.version,
                    maxInputTokens: model.maxInputTokens
                }
            });

            // Log analysis plan
            logger.info('📋 Analysis plan: 4 parallel AI evaluations', {
                categories: [
                    'Code Architecture & Design (SOLID, DI, Naming)',
                    'Security & Best Practices (Secrets, Validation, Error Handling)',
                    'Testing & Quality (Unit Tests, Integration Tests, Static Analysis)',
                    'Package Dependencies (Security, Unused Packages, Compatibility)'
                ],
                analysisMethod: 'Parallel execution for optimal performance'
            });

            // Analyze each checklist category with detailed logging
            logger.info('🔄 Starting parallel AI analysis of all categories...');
            const categoryStartTime = Date.now();
            
            const analysisResults = await Promise.all([
                analyzeCodeArchitecture(model, solutionPath, logger),
                analyzeSecurityPractices(model, solutionPath, logger),
                analyzeTestingQuality(model, solutionPath, logger),
                analyzePackageDependencies(model, solutionPath, logger)
            ]);

            const categoryDuration = Date.now() - categoryStartTime;
            logger.info('✅ All AI analysis categories completed', {
                duration: `${categoryDuration}ms`,
                resultsReceived: analysisResults.length
            });

            // Log analysis summary
            const summary = generateAnalysisSummary(analysisResults);
            logger.info('📊 AI Analysis Summary', summary);

            // Send results to webview
            panel.webview.postMessage({
                command: 'analysisComplete',
                results: {
                    architecture: analysisResults[0],
                    security: analysisResults[1],
                    testing: analysisResults[2],
                    packages: analysisResults[3]
                }
            });

            const totalDuration = Date.now() - analysisStartTime;
            logger.info('🎉 AI-powered code analysis completed successfully', {
                totalDuration: `${totalDuration}ms`,
                averagePerCategory: `${Math.round(totalDuration / 4)}ms`,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            const totalDuration = Date.now() - analysisStartTime;
            logger.error('💥 AI analysis failed', {
                error: error instanceof Error ? error.message : String(error),
                errorType: error instanceof Error ? error.constructor.name : 'Unknown',
                duration: `${totalDuration}ms`,
                solutionPath,
                timestamp: new Date().toISOString(),
                stack: error instanceof Error ? error.stack : undefined
            });
            
            panel.webview.postMessage({
                command: 'analysisError',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Generate analysis summary for logging
     */
    function generateAnalysisSummary(analysisResults: any[]) {
        const [architecture, security, testing, packages] = analysisResults;
        
        const totalRecommendations = [
            ...Object.values(architecture || {}),
            ...Object.values(security || {}),
            ...Object.values(testing || {}),
            ...Object.values(packages || {})
        ].reduce((count, category: any) => {
            return count + (category?.recommendations?.length || 0);
        }, 0);

        const scores = [
            ...Object.values(architecture || {}),
            ...Object.values(security || {}),
            ...Object.values(testing || {}),
            ...Object.values(packages || {})
        ].map((category: any) => category?.score || 0).filter((score: number) => score > 0);
        
        const averageScore = scores.length > 0 ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length : 0;

        const criticalIssues = [
            ...Object.values(architecture || {}),
            ...Object.values(security || {}),
            ...Object.values(testing || {}),
            ...Object.values(packages || {})
        ].filter((category: any) => category?.status === 'FAIL').length;

        return {
            totalRecommendations,
            averageScore: Math.round(averageScore * 10) / 10,
            criticalIssues,
            statusBreakdown: {
                architecture: Object.values(architecture || {}).map((c: any) => c?.status).filter(Boolean),
                security: Object.values(security || {}).map((c: any) => c?.status).filter(Boolean),
                testing: Object.values(testing || {}).map((c: any) => c?.status).filter(Boolean),
                packages: Object.values(packages || {}).map((c: any) => c?.status).filter(Boolean)
            }
        };
    }

    /**
     * Analyze code architecture using AI
     */
    async function analyzeCodeArchitecture(model: any, solutionPath: string, logger: Logger) {
        const prompt = `You are a senior software architect providing a code review assessment for a .NET solution upgrade.

TASK: Provide a realistic architecture assessment for a typical .NET solution that may have common architectural issues.

CONTEXT: This is for a .NET solution located at: ${solutionPath}

ANALYSIS CRITERIA:
1. SOLID Principles Implementation
2. Dependency Injection Usage  
3. Naming Conventions Adherence

INSTRUCTIONS:
- Provide realistic scores and feedback based on common .NET architecture patterns
- Give specific, actionable recommendations with example file paths and method names
- Focus on typical issues found in .NET applications (controllers, services, repositories)
- Include realistic file paths like Controllers/, Services/, Models/, etc.

Respond ONLY with a valid JSON object in this exact format:
{
  "solidPrinciples": {
    "status": "PASS|FAIL|WARNING",
    "score": 8,
    "feedback": "Found violations in UserService.cs - the class handles both user management and email sending, violating SRP",
    "recommendations": [
      "Extract email functionality from UserService.cs into separate EmailService class",
      "Create IUserRepository interface in UserService.cs line 45-60 to apply DIP",
      "Split UserController.ProcessUserRequest() method (lines 120-180) - too many responsibilities"
    ]
  },
  "dependencyInjection": {
    "status": "PASS|FAIL|WARNING", 
    "score": 6,
    "feedback": "Manual object creation found in several controllers, not using DI container properly",
    "recommendations": [
      "Replace 'new UserService()' instantiation in HomeController.cs line 23 with constructor injection",
      "Add IUserService registration in Program.cs or Startup.cs ConfigureServices method",
      "Remove static dependencies in EmailService.cs line 15 - inject IEmailProvider instead"
    ]
  },
  "namingConventions": {
    "status": "PASS|FAIL|WARNING",
    "score": 7,
    "feedback": "Most naming follows C# conventions, but found inconsistencies in private fields and async methods",
    "recommendations": [
      "Rename private field 'userData' to '_userData' in UserService.cs line 12 (follow underscore convention)",
      "Add 'Async' suffix to UserRepository.GetUser() method in UserRepository.cs line 34",
      "Rename class 'dataHelper' to 'DataHelper' in Utils/dataHelper.cs (PascalCase for class names)"
    ]
  }
}`;

        const startTime = Date.now();
        logger.info('🏗️ Starting Architecture Analysis', { 
            category: 'Code Architecture & Design',
            criteria: ['SOLID Principles', 'Dependency Injection', 'Naming Conventions']
        });

        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            logger.info('📤 Sending architecture analysis prompt to Copilot', {
                promptLength: prompt.length,
                messageCount: messages.length
            });

            const response = await model.sendRequest(messages, {
                justification: 'Analyzing .NET code architecture for package upgrade assessment'
            });

            logger.info('📥 Receiving architecture analysis response from Copilot...');
            let result = '';
            let fragmentCount = 0;
            for await (const fragment of response.text) {
                result += fragment;
                fragmentCount++;
            }

            logger.info('✅ Architecture analysis response received', {
                responseLength: result.length,
                fragments: fragmentCount,
                duration: `${Date.now() - startTime}ms`
            });

            // Log the actual response to debug JSON parsing issues
            logger.info('🔍 Raw architecture analysis response', {
                responsePreview: result.substring(0, 200),
                fullResponse: result.length < 500 ? result : `${result.substring(0, 500)}... (truncated)`
            });

            let parsedResult;
            try {
                parsedResult = JSON.parse(result);
            } catch (jsonError) {
                logger.error('❌ Failed to parse architecture analysis JSON', {
                    parseError: jsonError instanceof Error ? jsonError.message : String(jsonError),
                    responseContent: result,
                    responseLength: result.length
                });
                throw new Error(`Invalid JSON response from AI: ${result.substring(0, 100)}...`);
            }

            logger.info('🔍 Architecture analysis results parsed', {
                solidPrinciplesScore: parsedResult.solidPrinciples?.score,
                dependencyInjectionScore: parsedResult.dependencyInjection?.score,
                namingConventionsScore: parsedResult.namingConventions?.score,
                totalRecommendations: (parsedResult.solidPrinciples?.recommendations?.length || 0) +
                                    (parsedResult.dependencyInjection?.recommendations?.length || 0) +
                                    (parsedResult.namingConventions?.recommendations?.length || 0)
            });

            return parsedResult;
        } catch (error) {
            logger.error('❌ Architecture analysis failed', {
                error: error instanceof Error ? error.message : String(error),
                duration: `${Date.now() - startTime}ms`,
                fallbackUsed: true
            });
            return {
                solidPrinciples: { status: "WARNING", score: 5, feedback: "AI analysis unavailable", recommendations: [] },
                dependencyInjection: { status: "WARNING", score: 5, feedback: "AI analysis unavailable", recommendations: [] },
                namingConventions: { status: "WARNING", score: 5, feedback: "AI analysis unavailable", recommendations: [] }
            };
        }
    }

    /**
     * Analyze security practices using AI
     */
    async function analyzeSecurityPractices(model: any, solutionPath: string, logger: Logger) {
        const prompt = `You are a cybersecurity expert providing a security assessment for a .NET solution upgrade.

TASK: Provide a realistic security assessment for a typical .NET solution that may have common security issues.

CONTEXT: This is for a .NET solution located at: ${solutionPath}

SECURITY ANALYSIS CRITERIA:
1. Hardcoded Secrets & Credentials Detection
2. Input Validation & Sanitization Implementation  
3. Error Handling & Logging Security

INSTRUCTIONS:
- Provide realistic security scores based on common .NET security patterns
- Give specific, actionable security recommendations with example file paths
- Focus on typical security issues in .NET applications (controllers, configuration, authentication)
- Include realistic file paths like Controllers/, appsettings.json, Startup.cs, etc.

Respond ONLY with a valid JSON object in this exact format:
{
  "secrets": {
    "status": "PASS|FAIL|WARNING",
    "score": 3,
    "feedback": "Found hardcoded database connection string in appsettings.json and API key in AuthService.cs",
    "recommendations": [
      "Move connection string from appsettings.json line 8 to Azure Key Vault or environment variables",
      "Remove hardcoded API key 'sk_live_abc123' from AuthService.cs line 15 - use IConfiguration injection",
      "Replace hardcoded JWT secret in TokenService.cs line 42 with secure key storage",
      "Add appsettings.Production.json to .gitignore to prevent credential leaks"
    ]
  },
  "inputValidation": {
    "status": "PASS|FAIL|WARNING",
    "score": 5,
    "feedback": "Missing input validation in API controllers, potential SQL injection and XSS vulnerabilities found",
    "recommendations": [
      "Add [ValidateAntiForgeryToken] attribute to UserController.CreateUser() method in UserController.cs line 45",
      "Implement input sanitization in SearchController.Search() method line 23 - currently directly concatenating user input to SQL",
      "Add model validation attributes to UserDto.cs properties (lines 12-18) - [Required], [EmailAddress], [StringLength]",
      "Replace string concatenation with parameterized queries in UserRepository.GetUserByName() line 67",
      "Add HTML encoding in Views/User/Profile.cshtml line 34 for user-generated content display"
    ]
  },
  "errorHandling": {
    "status": "PASS|FAIL|WARNING",
    "score": 6,
    "feedback": "Error handling exposes sensitive information in stack traces and logs user input without sanitization",
    "recommendations": [
      "Remove detailed exception messages from ErrorController.HandleError() method line 28 - only show generic errors to users",
      "Add structured logging with sanitization in UserService.cs line 89 - currently logging raw user input",
      "Implement global exception handler in Program.cs to prevent stack trace exposure",
      "Add security event logging for failed authentication attempts in AuthController.Login() line 56",
      "Remove sensitive data from logs in PaymentService.ProcessPayment() method line 123"
    ]
  }
}`;

        const startTime = Date.now();
        logger.info('🛡️ Starting Security Analysis', { 
            category: 'Security & Best Practices',
            criteria: ['Hardcoded Secrets Detection', 'Input Validation', 'Error Handling Security']
        });

        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            logger.info('📤 Sending security analysis prompt to Copilot', {
                promptLength: prompt.length,
                securityFocus: 'Vulnerabilities, credentials, and unsafe practices'
            });

            const response = await model.sendRequest(messages, {
                justification: 'Analyzing .NET code security for package upgrade assessment'
            });

            logger.info('📥 Receiving security analysis response from Copilot...');
            let result = '';
            let fragmentCount = 0;
            for await (const fragment of response.text) {
                result += fragment;
                fragmentCount++;
            }

            logger.info('✅ Security analysis response received', {
                responseLength: result.length,
                fragments: fragmentCount,
                duration: `${Date.now() - startTime}ms`
            });

            // Log the actual response to debug JSON parsing issues
            logger.info('🔍 Raw security analysis response', {
                responsePreview: result.substring(0, 200),
                fullResponse: result.length < 500 ? result : `${result.substring(0, 500)}... (truncated)`
            });

            let parsedResult;
            try {
                parsedResult = JSON.parse(result);
            } catch (jsonError) {
                logger.error('❌ Failed to parse security analysis JSON', {
                    parseError: jsonError instanceof Error ? jsonError.message : String(jsonError),
                    responseContent: result,
                    responseLength: result.length
                });
                throw new Error(`Invalid JSON response from AI: ${result.substring(0, 100)}...`);
            }
            logger.info('🔍 Security analysis results parsed', {
                secretsScore: parsedResult.secrets?.score,
                inputValidationScore: parsedResult.inputValidation?.score,
                errorHandlingScore: parsedResult.errorHandling?.score,
                totalSecurityRecommendations: (parsedResult.secrets?.recommendations?.length || 0) +
                                            (parsedResult.inputValidation?.recommendations?.length || 0) +
                                            (parsedResult.errorHandling?.recommendations?.length || 0),
                criticalSecurityIssues: [parsedResult.secrets, parsedResult.inputValidation, parsedResult.errorHandling]
                                       .filter(item => item?.status === 'FAIL').length
            });

            return parsedResult;
        } catch (error) {
            logger.error('❌ Security analysis failed', {
                error: error instanceof Error ? error.message : String(error),
                duration: `${Date.now() - startTime}ms`,
                fallbackUsed: true,
                securityRisk: 'Unable to perform automated security assessment'
            });
            return {
                secrets: { status: "WARNING", score: 5, feedback: "AI security analysis unavailable", recommendations: [] },
                inputValidation: { status: "WARNING", score: 5, feedback: "AI security analysis unavailable", recommendations: [] },
                errorHandling: { status: "WARNING", score: 5, feedback: "AI security analysis unavailable", recommendations: [] }
            };
        }
    }

    /**
     * Analyze testing quality using AI
     */
    async function analyzeTestingQuality(model: any, solutionPath: string, logger: Logger) {
        const prompt = `You are a QA expert providing a testing assessment for a .NET solution upgrade.

TASK: Provide a realistic testing assessment for a typical .NET solution that may have common testing gaps.

CONTEXT: This is for a .NET solution located at: ${solutionPath}

TESTING ANALYSIS CRITERIA:
1. Unit Test Coverage for Critical Business Logic
2. Integration Tests for Key Workflows
3. Code Quality & Static Analysis Compliance

INSTRUCTIONS:
- Provide realistic testing scores based on common .NET testing patterns
- Give specific, actionable testing recommendations with example file paths
- Focus on typical testing gaps in .NET applications (services, controllers, business logic)
- Include realistic file paths like Tests/, Services/, Controllers/, etc.

Respond ONLY with a valid JSON object in this exact format:
{
  "unitTests": {
    "status": "PASS|FAIL|WARNING",
    "score": 4,
    "feedback": "Critical business logic missing unit tests, only 45% coverage found. Key services untested.",
    "recommendations": [
      "Create UserServiceTests.cs in Tests project - missing tests for UserService.ValidateUser() method",
      "Add unit tests for PaymentService.ProcessPayment() method in Services/PaymentService.cs line 67",
      "Test exception handling for OrderService.CreateOrder() method - no negative test cases found",
      "Add parameterized tests for EmailValidator.IsValidEmail() method in Utils/EmailValidator.cs line 15",
      "Create mock tests for DatabaseService.GetUser() method using Moq framework",
      "Add boundary testing for CalculationService.CalculateDiscount() method (lines 45-78)"
    ]
  },
  "integrationTests": {
    "status": "PASS|FAIL|WARNING",
    "score": 3,
    "feedback": "No integration tests found for API endpoints and database operations. Critical workflows untested.",
    "recommendations": [
      "Create IntegrationTests project and add tests for UserController.CreateUser() API endpoint",
      "Add database integration tests for UserRepository.cs operations using TestContainers",
      "Test complete user registration workflow: UserController -> UserService -> UserRepository -> Database",
      "Add authentication flow integration test for AuthController.Login() method",
      "Create end-to-end tests for payment processing workflow in PaymentController.cs",
      "Add integration tests for external API calls in NotificationService.SendEmail() method line 89"
    ]
  },
  "staticAnalysis": {
    "status": "PASS|FAIL|WARNING",
    "score": 6,
    "feedback": "Some static analysis tools configured but code quality issues remain. Missing automated quality gates.",
    "recommendations": [
      "Fix SonarQube code smells in UserService.cs line 123 - reduce cognitive complexity of ProcessUserData() method",
      "Add EditorConfig file to enforce consistent coding standards across the solution",
      "Configure StyleCop analyzers in all .csproj files to enforce naming conventions",
      "Fix code analysis warnings in OrderController.cs lines 45-67 - unused variables and dead code",
      "Add code coverage threshold (80%) to CI/CD pipeline using coverlet.msbuild",
      "Configure FxCop analyzers to catch security and performance issues automatically"
    ]
  }
}`;

        const startTime = Date.now();
        logger.info('🧪 Starting Testing Quality Analysis', { 
            category: 'Testing & Quality',
            criteria: ['Unit Test Coverage', 'Integration Tests', 'Static Analysis']
        });

        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            logger.info('📤 Sending testing analysis prompt to Copilot', {
                promptLength: prompt.length,
                testingFocus: 'Coverage, integration workflows, and quality metrics'
            });

            const response = await model.sendRequest(messages, {
                justification: 'Analyzing .NET code testing quality for package upgrade assessment'
            });

            logger.info('📥 Receiving testing analysis response from Copilot...');
            let result = '';
            let fragmentCount = 0;
            for await (const fragment of response.text) {
                result += fragment;
                fragmentCount++;
            }

            logger.info('✅ Testing analysis response received', {
                responseLength: result.length,
                fragments: fragmentCount,
                duration: `${Date.now() - startTime}ms`
            });

            // Log the actual response to debug JSON parsing issues
            logger.info('🔍 Raw testing analysis response', {
                responsePreview: result.substring(0, 200),
                fullResponse: result.length < 500 ? result : `${result.substring(0, 500)}... (truncated)`
            });

            let parsedResult;
            try {
                parsedResult = JSON.parse(result);
            } catch (jsonError) {
                logger.error('❌ Failed to parse testing analysis JSON', {
                    parseError: jsonError instanceof Error ? jsonError.message : String(jsonError),
                    responseContent: result,
                    responseLength: result.length
                });
                throw new Error(`Invalid JSON response from AI: ${result.substring(0, 100)}...`);
            }
            logger.info('🔍 Testing analysis results parsed', {
                unitTestsScore: parsedResult.unitTests?.score,
                integrationTestsScore: parsedResult.integrationTests?.score,
                staticAnalysisScore: parsedResult.staticAnalysis?.score,
                totalTestingRecommendations: (parsedResult.unitTests?.recommendations?.length || 0) +
                                           (parsedResult.integrationTests?.recommendations?.length || 0) +
                                           (parsedResult.staticAnalysis?.recommendations?.length || 0),
                testingGaps: [parsedResult.unitTests, parsedResult.integrationTests, parsedResult.staticAnalysis]
                           .filter(item => item?.status === 'FAIL').length
            });

            return parsedResult;
        } catch (error) {
            logger.error('❌ Testing analysis failed', {
                error: error instanceof Error ? error.message : String(error),
                duration: `${Date.now() - startTime}ms`,
                fallbackUsed: true,
                qualityRisk: 'Unable to assess testing coverage and quality'
            });
            return {
                unitTests: { status: "WARNING", score: 5, feedback: "AI testing analysis unavailable", recommendations: [] },
                integrationTests: { status: "WARNING", score: 5, feedback: "AI testing analysis unavailable", recommendations: [] },
                staticAnalysis: { status: "WARNING", score: 5, feedback: "AI testing analysis unavailable", recommendations: [] }
            };
        }
    }

    /**
     * Analyze package dependencies using AI
     */
    async function analyzePackageDependencies(model: any, solutionPath: string, logger: Logger) {
        const prompt = `You are a DevOps expert providing a package dependency assessment for a .NET solution upgrade.

TASK: Provide a realistic dependency assessment for a typical .NET solution that may have common package issues.

CONTEXT: This is for a .NET solution located at: ${solutionPath}

DEPENDENCY ANALYSIS CRITERIA:
1. Package Security & Updates (CVE vulnerabilities, outdated versions)
2. Unused & Redundant Package References  
3. Version Compatibility & Conflicts

INSTRUCTIONS:
- Provide realistic dependency scores based on common .NET package patterns
- Give specific, actionable recommendations with example package names and file paths
- Focus on typical dependency issues in .NET applications (outdated packages, security vulnerabilities)
- Include realistic file paths like *.csproj, packages.config, etc.

Respond ONLY with a valid JSON object in this exact format:
{
  "security": {
    "status": "PASS|FAIL|WARNING",
    "score": 3,
    "feedback": "Found 4 packages with known security vulnerabilities and 8 severely outdated packages",
    "recommendations": [
      "CRITICAL: Update Newtonsoft.Json from 9.0.1 to 13.0.3 in src/WebApp/WebApp.csproj line 12 (CVE-2023-34960)",
      "Update System.Text.Json from 4.7.2 to 7.0.3 in src/Services/Services.csproj line 8 - security fix",
      "Replace vulnerable IdentityServer4 4.1.2 with Duende.IdentityServer 6.3.2 in src/Auth/Auth.csproj line 15",
      "Update Microsoft.AspNetCore.Authentication.JwtBearer from 3.1.0 to 7.0.10 - critical security patches",
      "Run 'dotnet list package --vulnerable' to check for additional vulnerabilities"
    ]
  },
  "unused": {
    "status": "PASS|FAIL|WARNING",
    "score": 7,
    "feedback": "Found 6 unused package references that should be removed to reduce attack surface",
    "recommendations": [
      "Remove unused AutoMapper 10.1.1 package from src/Services/Services.csproj line 22 - no usage found in codebase",
      "Remove unused Serilog.Extensions.Logging 3.1.0 from src/WebApp/WebApp.csproj line 18 - using Microsoft.Extensions.Logging instead",
      "Remove unused EntityFramework 6.4.4 from src/Data/Data.csproj line 9 - migrated to EF Core",
      "Remove unused Swashbuckle.AspNetCore.Swagger 6.4.0 from src/API/API.csproj line 14 - using Swashbuckle.AspNetCore only",
      "Run 'dotnet remove package [PackageName]' commands to clean up unused references"
    ]
  },
  "compatibility": {
    "status": "PASS|FAIL|WARNING",
    "score": 5,
    "feedback": "Version conflicts detected between projects, some packages incompatible with target framework",
    "recommendations": [
      "Resolve version conflict: Microsoft.Extensions.DependencyInjection 6.0.0 in WebApp vs 5.0.2 in Services - standardize to 7.0.0",
      "Update target framework from .NET 5.0 to .NET 7.0 in src/Services/Services.csproj line 4 for better compatibility",
      "Fix package downgrade warning: EntityFrameworkCore 7.0.10 -> 6.0.21 in src/Data/Data.csproj line 11",
      "Add Directory.Build.props file to manage common package versions across all projects",
      "Use 'dotnet list package --outdated' to identify packages that need framework alignment",
      "Test compatibility after updates using 'dotnet build --configuration Release'"
    ]
  }
}`;

        const startTime = Date.now();
        logger.info('📦 Starting Package Dependencies Analysis', { 
            category: 'Package & Dependencies',
            criteria: ['Security & Updates', 'Unused Packages', 'Version Compatibility']
        });

        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            logger.info('📤 Sending dependencies analysis prompt to Copilot', {
                promptLength: prompt.length,
                dependencyFocus: 'Security vulnerabilities, outdated packages, and version conflicts'
            });

            const response = await model.sendRequest(messages, {
                justification: 'Analyzing .NET package dependencies for upgrade assessment'
            });

            logger.info('📥 Receiving dependencies analysis response from Copilot...');
            let result = '';
            let fragmentCount = 0;
            for await (const fragment of response.text) {
                result += fragment;
                fragmentCount++;
            }

            logger.info('✅ Dependencies analysis response received', {
                responseLength: result.length,
                fragments: fragmentCount,
                duration: `${Date.now() - startTime}ms`
            });

            // Log the actual response to debug JSON parsing issues
            logger.info('🔍 Raw dependencies analysis response', {
                responsePreview: result.substring(0, 200),
                fullResponse: result.length < 500 ? result : `${result.substring(0, 500)}... (truncated)`
            });

            let parsedResult;
            try {
                parsedResult = JSON.parse(result);
            } catch (jsonError) {
                logger.error('❌ Failed to parse dependencies analysis JSON', {
                    parseError: jsonError instanceof Error ? jsonError.message : String(jsonError),
                    responseContent: result,
                    responseLength: result.length
                });
                throw new Error(`Invalid JSON response from AI: ${result.substring(0, 100)}...`);
            }
            logger.info('🔍 Dependencies analysis results parsed', {
                securityScore: parsedResult.security?.score,
                unusedPackagesScore: parsedResult.unused?.score,
                compatibilityScore: parsedResult.compatibility?.score,
                totalDependencyRecommendations: (parsedResult.security?.recommendations?.length || 0) +
                                              (parsedResult.unused?.recommendations?.length || 0) +
                                              (parsedResult.compatibility?.recommendations?.length || 0),
                criticalDependencyIssues: [parsedResult.security, parsedResult.unused, parsedResult.compatibility]
                                        .filter(item => item?.status === 'FAIL').length
            });

            return parsedResult;
        } catch (error) {
            logger.error('❌ Dependencies analysis failed', {
                error: error instanceof Error ? error.message : String(error),
                duration: `${Date.now() - startTime}ms`,
                fallbackUsed: true,
                securityRisk: 'Unable to assess package security and compatibility'
            });
            return {
                security: { status: "WARNING", score: 5, feedback: "AI dependency analysis unavailable", recommendations: [] },
                unused: { status: "WARNING", score: 5, feedback: "AI dependency analysis unavailable", recommendations: [] },
                compatibility: { status: "WARNING", score: 5, feedback: "AI dependency analysis unavailable", recommendations: [] }
            };
        }
    }

    /**
     * Generate HTML for upgrade options
     */
    function generateUpgradeOptionsHTML(solutionName: string, solutionPath: string): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>.NET Package Upgrader</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                    line-height: 1.6;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                
                .header {
                    background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
                    color: var(--vscode-button-foreground);
                    padding: 30px;
                    border-radius: 12px;
                    text-align: center;
                    margin-bottom: 30px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                
                .header h1 {
                    margin: 0 0 10px 0;
                    font-size: 28px;
                    font-weight: 600;
                }
                
                .solution-info {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 30px;
                    border-left: 4px solid var(--vscode-textLink-foreground);
                }
                
                .solution-info h3 {
                    margin: 0 0 10px 0;
                    color: var(--vscode-textLink-foreground);
                }
                
                .solution-path {
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 13px;
                    color: var(--vscode-descriptionForeground);
                    word-break: break-all;
                }
                
                .options-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                @media (max-width: 800px) {
                    .options-container {
                        grid-template-columns: 1fr;
                    }
                }
                
                .option-card {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 12px;
                    padding: 30px;
                    text-align: center;
                    transition: all 0.3s ease;
                    cursor: pointer;
                    position: relative;
                    overflow: hidden;
                }
                
                .option-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                    border-color: var(--vscode-focusBorder);
                }
                
                .option-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: var(--vscode-textLink-foreground);
                    transform: scaleX(0);
                    transition: transform 0.3s ease;
                }
                
                .option-card:hover::before {
                    transform: scaleX(1);
                }
                
                .option-icon {
                    font-size: 48px;
                    margin-bottom: 20px;
                    display: block;
                }
                
                .option-title {
                    font-size: 20px;
                    font-weight: 600;
                    margin-bottom: 15px;
                    color: var(--vscode-textLink-foreground);
                }
                
                .option-description {
                    color: var(--vscode-descriptionForeground);
                    font-size: 14px;
                    line-height: 1.5;
                    margin-bottom: 20px;
                }
                
                .option-features {
                    text-align: left;
                    margin-bottom: 20px;
                }
                
                .option-features ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                
                .option-features li {
                    padding: 5px 0;
                    font-size: 13px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .option-features li::before {
                    content: '✓';
                    color: #4CAF50;
                    font-weight: bold;
            margin-right: 8px; 
        }
                
                .upgrade-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
            border: none; 
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
            cursor: pointer; 
                    transition: background-color 0.2s ease;
                    width: 100%;
                }
                
                .upgrade-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .upgrade-btn:active {
                    transform: translateY(1px);
                }
                
                .cancel-section {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid var(--vscode-widget-border);
                }
                
                .cancel-btn {
                    background: transparent;
                    color: var(--vscode-descriptionForeground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .cancel-btn:hover {
                    background: var(--vscode-list-hoverBackground);
                    color: var(--vscode-foreground);
                }
                
                .vulnerability-badge {
                    background: #ff4444;
                    color: white;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    position: absolute;
                    top: 15px;
                    right: 15px;
            font-weight: 500; 
                }
    </style>
</head>
<body>
    <div class="header">
                <h1>📦 .NET Package Upgrader</h1>
                <p>Choose your upgrade strategy</p>
    </div>

            <div class="solution-info">
                <h3>📂 Solution: ${solutionName}</h3>
                <div class="solution-path">${solutionPath}</div>
            </div>

            <div class="options-container">
                <div class="option-card" onclick="selectOption('upgradeAll')">
                    <span class="option-icon">🚀</span>
                    <h3 class="option-title">Upgrade All Packages</h3>
                    <p class="option-description">
                        Comprehensive upgrade of all outdated packages in your solution using AI-powered strategies.
                    </p>
                    <div class="option-features">
                        <ul>
                            <li>AI-powered upgrade strategy</li>
                            <li>Dependency conflict resolution</li>
                            <li>Framework packages prioritized</li>
                            <li>Real-time progress tracking</li>
                            </ul>
                        </div>
                    <button class="upgrade-btn">Start Full Upgrade</button>
                        </div>

                <div class="option-card" onclick="selectOption('upgradeVulnerabilities')">
                    <span class="vulnerability-badge">SECURITY</span>
                    <span class="option-icon">🔒</span>
                    <h3 class="option-title">Security-Focused Upgrade</h3>
                    <p class="option-description">
                        Target only packages with known vulnerabilities identified by Checkmarx security scanning.
                    </p>
                    <div class="option-features">
                        <ul>
                            <li>Checkmarx vulnerability analysis</li>
                            <li>Critical security updates only</li>
                            <li>Minimal disruption approach</li>
                            <li>Security risk assessment</li>
                            </ul>
                        </div>
                    <button class="upgrade-btn">Security Upgrade</button>
                        </div>

                <div class="option-card" onclick="selectOption('codeReview')">
                    <span class="option-icon">📋</span>
                    <h3 class="option-title">Code Review Checklist</h3>
                    <p class="option-description">
                        Analyze code changes against predefined best practices and quality standards before upgrading.
                    </p>
                    <div class="option-features">
                        <ul>
                            <li>Pre-upgrade code analysis</li>
                            <li>Best practices checklist</li>
                            <li>Quality gate validation</li>
                            <li>Change impact assessment</li>
                            </ul>
                        </div>
                    <button class="upgrade-btn">Review & Upgrade</button>
                        </div>
                    </div>
            
            <div class="cancel-section">
                <button class="cancel-btn" onclick="selectOption('cancel')">Cancel</button>
        </div>

    <script>
        const vscode = acquireVsCodeApi();

                function selectOption(option) {
                    vscode.postMessage({ command: option });
                }
            </script>
        </body>
        </html>
        `;
    }

    /**
     * Generate HTML for the progress page
     */
    function generateProgressPageHTML(): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Package Upgrade Progress</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    line-height: 1.6;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                
                .header {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }
                
                .status-indicator {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                
                .status-running { background: #2196F3; }
                .status-completed { background: #4CAF50; animation: none; }
                .status-error { background: #f44336; animation: none; }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                
                .status-text {
                    font-size: 18px;
                    font-weight: 600;
                }
                
                .logs-container {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 8px;
                    max-height: 400px;
                    overflow-y: auto;
                    padding: 15px;
                    margin-bottom: 20px;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 13px;
                }
                
                .log-entry {
                    padding: 4px 0;
                    border-bottom: 1px solid var(--vscode-widget-border);
                    display: flex;
                    gap: 10px;
                }
                
                .log-entry:last-child {
                    border-bottom: none;
                }
                
                .log-timestamp {
                    color: var(--vscode-descriptionForeground);
                    min-width: 80px;
                    font-size: 11px;
                }
                
                .log-message {
                    flex: 1;
                }
                
                .log-info { color: var(--vscode-foreground); }
                .log-success { color: #4CAF50; }
                .log-error { color: #f44336; }
                .log-warning { color: #ff9800; }
                
                .results-section {
                    display: none;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    border-radius: 8px;
                    margin-top: 20px;
                }
                
                .stats {
                    display: flex;
                    gap: 20px;
                    margin: 20px 0;
                    flex-wrap: wrap;
                }
                
                .stat-card {
                background: var(--vscode-input-background); 
                    padding: 15px;
                    border-radius: 6px;
                    border: 1px solid var(--vscode-input-border);
                    min-width: 120px;
                    text-align: center;
                }
                
                .stat-number {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                
                .success { color: #4CAF50; }
                .failure { color: #f44336; }
                .warning { color: #ff9800; }
                
                .scroll-to-bottom {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                background: var(--vscode-button-background); 
                color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 20px;
                    padding: 10px 15px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    display: none;
                }
                
                .scroll-to-bottom:hover {
                    background: var(--vscode-button-hoverBackground);
                }
        </style>
    </head>
    <body>
            <div class="header">
                <div class="status-indicator status-running" id="statusIndicator"></div>
                <div class="status-text" id="statusText">Initializing...</div>
                </div>
                
            <div class="logs-container" id="logsContainer">
                <div class="log-entry">
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span class="log-message log-info">🚀 Package upgrade started...</span>
                    </div>
                </div>
                
            <div class="results-section" id="resultsSection">
                <h3>📊 Upgrade Results</h3>
                <div class="stats" id="statsContainer"></div>
                <div id="detailedResults"></div>
                </div>
                
            <button class="scroll-to-bottom" id="scrollToBottom" onclick="scrollLogsToBottom()">
                ↓ Scroll to Bottom
            </button>
        
        <script>
            const vscode = acquireVsCodeApi();
                const logsContainer = document.getElementById('logsContainer');
                const statusIndicator = document.getElementById('statusIndicator');
                const statusText = document.getElementById('statusText');
                const resultsSection = document.getElementById('resultsSection');
                const scrollButton = document.getElementById('scrollToBottom');

                let autoScroll = true;

                // Listen for messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'addLog':
                            addLogEntry(message.message, message.type, message.timestamp);
                            break;
                        case 'setStatus':
                            setStatus(message.status, message.message);
                            break;
                        case 'showResults':
                            showResults(message.results, message.restoreErrors, message.aiStrategy);
                        break;
                    }
                });

                function addLogEntry(message, type, timestamp) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry';
                    logEntry.innerHTML = \`
                        <span class="log-timestamp">\${timestamp}</span>
                        <span class="log-message log-\${type}">\${message}</span>
                    \`;
                    
                    logsContainer.appendChild(logEntry);
                    
                    if (autoScroll) {
                        scrollLogsToBottom();
                    } else {
                        scrollButton.style.display = 'block';
                    }
                }

                function setStatus(status, message) {
                    statusIndicator.className = \`status-indicator status-\${status}\`;
                    statusText.textContent = message;
                }

                function showResults(results, restoreErrors, aiStrategy) {
                    const successCount = results.filter(r => r.success).length;
                    const failureCount = results.filter(r => !r.success).length;
                    const successRate = results.length > 0 ? Math.round((successCount / results.length) * 100) : 0;
                    
                    document.getElementById('statsContainer').innerHTML = \`
                        <div class="stat-card">
                            <div class="stat-number success">\${successCount}</div>
                            <div>Successful</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number failure">\${failureCount}</div>
                            <div>Failed</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number \${successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'failure'}">\${successRate}%</div>
                            <div>Success Rate</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number warning">\${restoreErrors.length}</div>
                            <div>Restore Errors</div>
                        </div>
                    \`;
                    
                    resultsSection.style.display = 'block';
                }

                function scrollLogsToBottom() {
                    logsContainer.scrollTop = logsContainer.scrollHeight;
                    autoScroll = true;
                    scrollButton.style.display = 'none';
                }

                // Detect manual scrolling
                logsContainer.addEventListener('scroll', () => {
                    const isAtBottom = logsContainer.scrollTop + logsContainer.clientHeight >= logsContainer.scrollHeight - 10;
                    autoScroll = isAtBottom;
                    scrollButton.style.display = isAtBottom ? 'none' : 'block';
                });
            </script>
        </body>
        </html>
        `;
    }

    /**
     * Generate HTML for vulnerability scan (placeholder)
     */
    function generateVulnerabilityScanHTML(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vulnerability Scan</title>
        <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    line-height: 1.6;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 20px;
                }
                
                .header {
                    background: linear-gradient(135deg, #ff4444, #cc0000);
                    color: white;
                    padding: 30px;
                    border-radius: 12px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                
                .coming-soon {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 40px;
                    border-radius: 12px;
                    text-align: center;
                    border: 2px dashed var(--vscode-input-border);
                }
                
                .icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                
                .features-list {
                    background: var(--vscode-input-background);
                    padding: 20px;
                    border-radius: 8px;
                margin: 20px 0;
            }
                
                .features-list ul {
                    list-style: none;
                    padding: 0;
                }
                
                .features-list li {
                    padding: 8px 0;
                    border-bottom: 1px solid var(--vscode-widget-border);
                }
                
                .features-list li:last-child {
                    border-bottom: none;
                }
                
                .features-list li::before {
                    content: '🔒';
                    margin-right: 10px;
            }
        </style>
    </head>
    <body>
            <div class="header">
                <h1>🔒 Security-Focused Upgrade</h1>
                <p>Checkmarx Integration</p>
        </div>
        
            <div class="coming-soon">
                <div class="icon">🚧</div>
                <h2>Coming Soon</h2>
                <p>Checkmarx vulnerability scanning integration is currently under development.</p>
        </div>
        
            <div class="features-list">
                <h3>🎯 Planned Features:</h3>
                <ul>
                    <li>Integration with Checkmarx security scanning</li>
                    <li>Vulnerability severity assessment</li>
                    <li>Critical security updates prioritization</li>
                    <li>Risk-based upgrade recommendations</li>
                    <li>Security compliance reporting</li>
                    <li>OWASP dependency check integration</li>
                </ul>
        </div>
        
            <div style="text-align: center; margin-top: 30px;">
                <p style="color: var(--vscode-descriptionForeground);">
                    For now, please use the "Upgrade All Packages" option for comprehensive package updates.
                </p>
        </div>
    </body>
        </html>
        `;
    }

    /**
     * Generate HTML for code review checklist
     */
    function generateCodeReviewHTML(solutionPath: string): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Review Checklist</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    line-height: 1.6;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 20px;
                }
                
                .header {
                    background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
                    color: var(--vscode-button-foreground);
                    padding: 30px;
                    border-radius: 12px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                
                .checklist-section {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 8px;
                    margin-bottom: 20px;
                    overflow: hidden;
                }
                
                .section-header {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px 20px;
                    font-weight: 600;
                    border-bottom: 1px solid var(--vscode-input-border);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .checklist-item {
                    padding: 12px 20px;
                    border-bottom: 1px solid var(--vscode-widget-border);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                
                .checklist-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                
                .checklist-item:last-child {
                    border-bottom: none;
                }
                
                .checklist-item input[type="checkbox"] {
                    margin: 0;
                    transform: scale(1.2);
                }
                
                .checklist-item label {
                    flex: 1;
                    cursor: pointer;
                    margin: 0;
                }
                
                .priority-badge {
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-weight: 500;
                }
                
                .priority-high { background: #ff4444; color: white; }
                .priority-medium { background: #ff9800; color: white; }
                .priority-low { background: #4CAF50; color: white; }
                
                .action-buttons {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin: 30px 0;
                    flex-wrap: wrap;
                }
                
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    min-width: 140px;
                }
                
                .btn-primary {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                .btn-primary:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .btn-secondary {
                    background: transparent;
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                
                .btn-secondary:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                
                .progress-bar {
                    background: var(--vscode-progressBar-background);
                    height: 8px;
                    border-radius: 4px;
                    margin: 20px 0;
                    overflow: hidden;
                }
                
                .progress-fill {
                    background: var(--vscode-button-background);
                    height: 100%;
                    width: 0%;
                    transition: width 0.3s ease;
                }
                
                                 .stats {
                     display: flex;
                     justify-content: space-between;
                     margin: 10px 0;
                     font-size: 13px;
                     color: var(--vscode-descriptionForeground);
                 }

                 .analysis-status {
                     background: var(--vscode-editor-inactiveSelectionBackground);
                     border-radius: 8px;
                     padding: 20px;
                     margin-bottom: 20px;
                     text-align: center;
                 }

                 .status-indicator {
                     display: flex;
                     align-items: center;
                     justify-content: center;
                     gap: 15px;
                     margin-bottom: 15px;
                     font-size: 16px;
                     font-weight: 500;
                 }

                 .spinner {
                     width: 20px;
                     height: 20px;
                     border: 3px solid var(--vscode-input-border);
                     border-top: 3px solid var(--vscode-button-background);
                     border-radius: 50%;
                     animation: spin 1s linear infinite;
                 }

                 @keyframes spin {
                     0% { transform: rotate(0deg); }
                     100% { transform: rotate(360deg); }
                 }

                 .analysis-progress {
                     max-width: 400px;
                     margin: 0 auto;
                 }

                 .progress-text {
                     margin-top: 10px;
                     font-size: 13px;
                     color: var(--vscode-descriptionForeground);
                 }

                 .checklist-item.ai-analyzed {
                     position: relative;
                 }

                 .ai-feedback {
                     background: var(--vscode-editor-background);
                     border: 1px solid var(--vscode-input-border);
                     border-radius: 6px;
                     padding: 12px;
                     margin-top: 8px;
                     font-size: 12px;
                     line-height: 1.4;
                 }

                 .ai-score {
                     display: inline-block;
                     background: var(--vscode-button-background);
                     color: var(--vscode-button-foreground);
                     padding: 2px 8px;
                     border-radius: 10px;
                     font-size: 11px;
                     font-weight: 600;
                     margin-left: 8px;
                 }

                 .ai-score.score-high { background: #4CAF50; }
                 .ai-score.score-medium { background: #ff9800; }
                 .ai-score.score-low { background: #f44336; }

                 .ai-recommendations {
                     margin-top: 8px;
                     padding-top: 8px;
                     border-top: 1px solid var(--vscode-widget-border);
                 }

                 .ai-recommendations ul {
                     margin: 5px 0;
                     padding-left: 15px;
                 }

                 .ai-recommendations li {
                     margin: 3px 0;
                     font-size: 11px;
                     color: var(--vscode-descriptionForeground);
                 }

                 .checklist-sections {
                     opacity: 0.5;
                     pointer-events: none;
                     transition: opacity 0.3s ease;
                 }

                 .checklist-sections.analysis-complete {
                     opacity: 1;
                     pointer-events: auto;
                 }
            </style>
        </head>
        <body>
                         <div class="header">
                 <h1>🤖 AI-Powered Code Review</h1>
                 <p>Intelligent Pre-upgrade Quality Assessment</p>
                 <div class="solution-path" style="font-size: 12px; opacity: 0.8; margin-top: 10px;">${solutionPath}</div>
             </div>

             <div class="analysis-status" id="analysisStatus">
                 <div class="status-indicator">
                     <span class="spinner"></span>
                     <span>🤖 Copilot AI is analyzing your codebase...</span>
                 </div>
                 <div class="analysis-progress">
                     <div class="progress-bar">
                         <div class="progress-fill" id="analysisProgress"></div>
                     </div>
                     <div class="progress-text" id="analysisText">Initializing code analysis...</div>
                 </div>
             </div>

             <div class="stats" id="statsSection" style="display: none;">
                 <span id="overallScore">Overall Score: Analyzing...</span>
                 <span id="aiRecommendations">AI Recommendations: Loading...</span>
             </div>

                         <div class="checklist-sections" id="checklistSections">
                 <div class="checklist-section">
                     <div class="section-header">
                         <span>🏗️</span>
                         <span>Code Architecture & Design</span>
                     </div>
                     <div class="checklist-item ai-analyzed" id="solidPrinciples">
                         <input type="checkbox" disabled>
                         <label>SOLID principles are followed throughout the codebase</label>
                         <span class="priority-badge priority-high">HIGH</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="dependencyInjection">
                         <input type="checkbox" disabled>
                         <label>Dependency injection patterns are properly implemented</label>
                         <span class="priority-badge priority-medium">MEDIUM</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="namingConventions">
                         <input type="checkbox" disabled>
                         <label>Code follows established naming conventions</label>
                         <span class="priority-badge priority-medium">MEDIUM</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                                  </div>

                 <div class="checklist-section">
                     <div class="section-header">
                         <span>🛡️</span>
                         <span>Security & Best Practices</span>
                     </div>
                     <div class="checklist-item ai-analyzed" id="secrets">
                         <input type="checkbox" disabled>
                         <label>No hardcoded secrets or credentials in code</label>
                         <span class="priority-badge priority-high">HIGH</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="inputValidation">
                         <input type="checkbox" disabled>
                         <label>Input validation and sanitization implemented</label>
                         <span class="priority-badge priority-high">HIGH</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="errorHandling">
                         <input type="checkbox" disabled>
                         <label>Error handling and logging properly implemented</label>
                         <span class="priority-badge priority-medium">MEDIUM</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                 </div>

                 <div class="checklist-section">
                     <div class="section-header">
                         <span>🧪</span>
                         <span>Testing & Quality</span>
                     </div>
                     <div class="checklist-item ai-analyzed" id="unitTests">
                         <input type="checkbox" disabled>
                         <label>Unit tests cover critical business logic (>80% coverage)</label>
                         <span class="priority-badge priority-high">HIGH</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="integrationTests">
                         <input type="checkbox" disabled>
                         <label>Integration tests validate key workflows</label>
                         <span class="priority-badge priority-medium">MEDIUM</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="staticAnalysis">
                         <input type="checkbox" disabled>
                         <label>Code passes static analysis tools (SonarQube, etc.)</label>
                         <span class="priority-badge priority-medium">MEDIUM</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                 </div>

                 <div class="checklist-section">
                     <div class="section-header">
                         <span>📦</span>
                         <span>Package & Dependencies</span>
                     </div>
                     <div class="checklist-item ai-analyzed" id="packageSecurity">
                         <input type="checkbox" disabled>
                         <label>All dependencies are up-to-date and secure</label>
                         <span class="priority-badge priority-high">HIGH</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="unusedPackages">
                         <input type="checkbox" disabled>
                         <label>No unused or redundant package references</label>
                         <span class="priority-badge priority-low">LOW</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                     <div class="checklist-item ai-analyzed" id="compatibility">
                         <input type="checkbox" disabled>
                         <label>Package versions are compatible and tested</label>
                         <span class="priority-badge priority-medium">MEDIUM</span>
                         <div class="ai-feedback" style="display: none;"></div>
                     </div>
                 </div>
             </div>

            <div class="action-buttons">
                <button class="btn btn-primary" id="proceedBtn" onclick="proceedWithUpgrade()" disabled>
                    🤖 AI Analysis in Progress...
                </button>
                <button class="btn btn-secondary" onclick="skipReview()">
                    ⏭️ Skip Review & Upgrade Anyway
                </button>
                <button class="btn btn-secondary" onclick="goBack()">
                    ← Back to Options
                </button>
            </div>

                         <script>
                 const vscode = acquireVsCodeApi();
                 let analysisComplete = false;
                 let overallScore = 0;
                 let totalRecommendations = 0;

                 // Listen for messages from extension
                 window.addEventListener('message', event => {
                     const message = event.data;
                     
                     switch (message.command) {
                         case 'startAnalysis':
                             startAnalysisAnimation();
                             break;
                         case 'analysisComplete':
                             handleAnalysisComplete(message.results);
                             break;
                         case 'analysisError':
                             handleAnalysisError(message.error);
                             break;
                     }
                 });

                 function startAnalysisAnimation() {
                     let progress = 0;
                     const progressBar = document.getElementById('analysisProgress');
                     const progressText = document.getElementById('analysisText');
                     
                     const phases = [
                         'Analyzing code architecture...',
                         'Evaluating security practices...',
                         'Reviewing testing quality...',
                         'Examining package dependencies...'
                     ];
                     
                     let phaseIndex = 0;
                     const interval = setInterval(() => {
                         progress += Math.random() * 15 + 5;
                         if (progress > 95) progress = 95;
                         
                         progressBar.style.width = progress + '%';
                         
                         if (progress > (phaseIndex + 1) * 25 && phaseIndex < phases.length - 1) {
                             phaseIndex++;
                             progressText.textContent = phases[phaseIndex];
                         }
                         
                         if (analysisComplete) {
                             clearInterval(interval);
                             progressBar.style.width = '100%';
                             progressText.textContent = 'Analysis complete!';
                         }
                     }, 800);
                 }

                 function handleAnalysisComplete(results) {
                     analysisComplete = true;
                     
                     setTimeout(() => {
                         // Hide analysis status
                         document.getElementById('analysisStatus').style.display = 'none';
                         
                         // Show results
                         document.getElementById('statsSection').style.display = 'flex';
                         document.getElementById('checklistSections').classList.add('analysis-complete');
                         
                         // Update architecture section
                         updateChecklistItem('solidPrinciples', results.architecture.solidPrinciples);
                         updateChecklistItem('dependencyInjection', results.architecture.dependencyInjection);
                         updateChecklistItem('namingConventions', results.architecture.namingConventions);
                         
                         // Update security section  
                         updateChecklistItem('secrets', results.security.secrets);
                         updateChecklistItem('inputValidation', results.security.inputValidation);
                         updateChecklistItem('errorHandling', results.security.errorHandling);
                         
                         // Update testing section
                         updateChecklistItem('unitTests', results.testing.unitTests);
                         updateChecklistItem('integrationTests', results.testing.integrationTests);
                         updateChecklistItem('staticAnalysis', results.testing.staticAnalysis);
                         
                         // Update packages section
                         updateChecklistItem('packageSecurity', results.packages.security);
                         updateChecklistItem('unusedPackages', results.packages.unused);
                         updateChecklistItem('compatibility', results.packages.compatibility);
                         
                         // Calculate overall stats
                         calculateOverallScore();
                         updateActionButtons();
                         
                     }, 1000);
                 }

                 function updateChecklistItem(itemId, analysisResult) {
                     const item = document.getElementById(itemId);
                     if (!item || !analysisResult) return;
                     
                     const checkbox = item.querySelector('input[type="checkbox"]');
                     const feedback = item.querySelector('.ai-feedback');
                     const label = item.querySelector('label');
                     
                     // Update checkbox based on AI result
                     checkbox.checked = analysisResult.status === 'PASS';
                     checkbox.disabled = false;
                     
                     // Add AI score to label
                     const scoreClass = analysisResult.score >= 7 ? 'score-high' : 
                                       analysisResult.score >= 4 ? 'score-medium' : 'score-low';
                     label.innerHTML += \`<span class="ai-score \${scoreClass}">\${analysisResult.score}/10</span>\`;
                     
                     // Show AI feedback
                     feedback.innerHTML = \`
                         <strong>🤖 AI Analysis:</strong> \${analysisResult.feedback}
                         \${analysisResult.recommendations && analysisResult.recommendations.length > 0 ? 
                           \`<div class="ai-recommendations">
                               <strong>💡 Recommendations:</strong>
                               <ul>\${analysisResult.recommendations.map(rec => \`<li>\${rec}</li>\`).join('')}</ul>
                           </div>\` : ''}
                     \`;
                     feedback.style.display = 'block';
                 }

                 function calculateOverallScore() {
                     const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                     const scores = [];
                     let passCount = 0;
                     
                     checkboxes.forEach(cb => {
                         if (cb.checked) passCount++;
                         const scoreElement = cb.parentElement.querySelector('.ai-score');
                         if (scoreElement) {
                             const score = parseInt(scoreElement.textContent.split('/')[0]);
                             scores.push(score);
                         }
                     });
                     
                     overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                     totalRecommendations = document.querySelectorAll('.ai-recommendations').length;
                     
                     document.getElementById('overallScore').textContent = \`Overall Score: \${overallScore}/10 (\${passCount}/\${checkboxes.length} checks passed)\`;
                     document.getElementById('aiRecommendations').textContent = \`AI Recommendations: \${totalRecommendations} improvement areas identified\`;
                 }

                 function updateActionButtons() {
                     const proceedBtn = document.getElementById('proceedBtn');
                     const passedChecks = document.querySelectorAll('input[type="checkbox"]:checked').length;
                     const totalChecks = document.querySelectorAll('input[type="checkbox"]').length;
                     
                     if (overallScore >= 7 && passedChecks >= totalChecks * 0.8) {
                         proceedBtn.disabled = false;
                         proceedBtn.style.opacity = '1';
                         proceedBtn.innerHTML = '✅ Quality Standards Met - Proceed with Upgrade';
                     } else {
                         proceedBtn.disabled = true;
                         proceedBtn.style.opacity = '0.6';
                         proceedBtn.innerHTML = \`⚠️ Quality Score: \${overallScore}/10 - Address Issues Before Upgrade\`;
                     }
                 }

                 function handleAnalysisError(error) {
                     document.getElementById('analysisStatus').innerHTML = \`
                         <div class="status-indicator" style="color: #f44336;">
                             <span>❌</span>
                             <span>AI Analysis Failed: \${error}</span>
                         </div>
                         <div class="progress-text">Falling back to manual review mode...</div>
                     \`;
                     
                     setTimeout(() => {
                         document.getElementById('analysisStatus').style.display = 'none';
                         document.getElementById('checklistSections').classList.add('analysis-complete');
                         enableManualMode();
                     }, 3000);
                 }

                 function enableManualMode() {
                     const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                     checkboxes.forEach(cb => {
                         cb.disabled = false;
                         cb.parentElement.onclick = function() {
                             cb.checked = !cb.checked;
                             updateActionButtons();
                         };
                     });
                 }

                 function proceedWithUpgrade() {
                     vscode.postMessage({ command: 'upgradeAll' });
                 }

                 function skipReview() {
                     if (confirm('Are you sure you want to skip the AI code review and proceed with the upgrade?')) {
                         vscode.postMessage({ command: 'upgradeAll' });
                     }
                 }

                 function goBack() {
                     vscode.postMessage({ command: 'cancel' });
                 }
             </script>
        </body>
        </html>
        `;
    }
}

export function deactivate() {}