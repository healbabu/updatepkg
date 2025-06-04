# .NET Package Upgrader - Troubleshooting Guide

## Common Issues and Solutions

### 1. Extension Getting Stuck at "Generating intelligent upgrade strategies"

**Problem**: The extension hangs during strategy generation phase.

**Root Cause**: Complex multi-stage package family detection process causing performance bottlenecks.

**Solution**: The extension now uses a simplified AI-first approach with fallback strategies:

- **AI Strategy Generation**: Direct AI strategy generation via `CopilotService.generateUpgradeStrategy()`
- **30-second Timeout Protection**: Automatic fallback if AI takes too long
- **Simple Prefix-based Fallback**: Groups packages by Microsoft.*, System.*, and third-party prefixes
- **Configuration Option**: Use `enableDependencyAnalysis: false` to disable complex analysis

**Settings**:
```json
{
  "dotnetPackageUpgrader.enableDependencyAnalysis": false
}
```

---

### 2. File System Race Condition Errors (ENOENT)

**Problem**: Errors like `ENOENT: no such file or directory` in temporary files (`obj/`, `.nuget/`).

**Root Cause**: Race conditions between dotnet CLI operations and VS Code extension file monitoring (particularly GitHub Copilot).

**Symptoms**:
- Temporary file access errors
- Files disappearing during operations
- Extension monitoring conflicts

**Solution**: Comprehensive race condition prevention system:

#### Pre-update Preparation
- Creates necessary directories (`obj/`, `bin/`, `.nuget/`) before operations
- Ensures stable environment before package operations

#### Enhanced Environment Variables
```bash
DOTNET_CLI_TELEMETRY_OPTOUT=1
DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
DOTNET_NOLOGO=1
DOTNET_USE_POLLING_FILE_WATCHER=1
NUGET_PACKAGES=<project>/.nuget/packages
```

#### Multi-stage Stabilization
1. **150ms Initial Delay**: Allows file system to stabilize
2. **Smart Temp File Monitoring**: Monitors temporary files (up to 10 attempts)
3. **100ms Final Verification**: Ensures operations completed

#### Process Improvements
- **Extended Timeout**: 120 seconds for operations
- **Larger Buffer**: 1MB for CLI output
- **Better Error Handling**: Distinguishes monitoring issues from real failures

**Settings**:
```json
{
  "dotnetPackageUpgrader.suppressFileSystemMonitoring": true
}
```

---

### 3. Transparent Error Reporting

**Problem**: File system monitoring warnings were hidden, making it hard to understand what was happening.

**Solution**: Enhanced WebView displays all warnings and errors transparently:

#### Warning Categories
- **File System Monitoring Issues**: Race condition warnings (not upgrade failures)
- **Real Upgrade Errors**: Actual package upgrade failures
- **Restore Errors**: NuGet restore problems

#### Error Display
- Warnings section in update results
- Detailed explanations distinguishing monitoring issues from failures
- Context about why monitoring issues occur
- Recommendations for resolution

---

### 4. Copilot Integration Issues

**Problem**: GitHub Copilot not available or not working properly.

**Diagnosis**: Run the extension to see Copilot availability status.

**Requirements**:
- GitHub Copilot extension installed
- Signed in to GitHub Copilot
- Active Copilot subscription
- Language Model API available in VS Code

**Fallback**: Extension automatically falls back to prefix-based strategy when Copilot is unavailable.

---

### 5. Compilation Errors

**Problem**: TypeScript compilation failures.

**Solutions Applied**:

#### Extended SuggestionMode Type
```typescript
export type SuggestionMode = 'simple' | 'comprehensive' | 'ai';
```

#### Environment Variable Access
```typescript
// Use index notation for dynamic environment variables
env['DOTNET_CLI_TELEMETRY_OPTOUT'] = '1';
```

#### Missing Method Implementation
```typescript
// Added missing initializeAgentContext() method
async initializeAgentContext(): Promise<void> {
    // Implementation provided
}
```

---

### 6. Performance Optimization

**Problem**: Extension slow or unresponsive.

**Solutions Implemented**:

#### Simplified Strategy Generation
- Removed complex PackageFamilyDetector
- Direct AI strategy generation
- Simple fallback mechanisms

#### Timeout Protection
- 30-second strategy generation timeout
- Automatic fallback to simple strategies
- Non-blocking operations

#### Configuration Options
```json
{
  "dotnetPackageUpgrader.enableDependencyAnalysis": false,
  "dotnetPackageUpgrader.suppressFileSystemMonitoring": true
}
```

---

## Configuration Reference

### All Available Settings

```json
{
  "dotnetPackageUpgrader.autoUpgrade": false,
  "dotnetPackageUpgrader.upgradeStrategy": "patch",
  "dotnetPackageUpgrader.serviceUrl": "https://api.corporate-package-service.com",
  "dotnetPackageUpgrader.serviceTimeout": 30000,
  "dotnetPackageUpgrader.useCorporateService": true,
  "dotnetPackageUpgrader.enableDependencyAnalysis": true,
  "dotnetPackageUpgrader.suppressFileSystemMonitoring": true,
  "dotnetPackageUpgrader.copilotAgent": {
    "enabled": true,
    "contextAware": true,
    "securityAnalysis": true,
    "testAnalysis": true
  },
  "dotnetPackageUpgrader.customRules": [],
  "dotnetPackageUpgrader.securityRequirements": []
}
```

### Key Configuration Options

#### `enableDependencyAnalysis` (default: true)
- **true**: Uses comprehensive dependency graph analysis (slower, more accurate)
- **false**: Uses simplified strategy generation (faster, good enough)

#### `suppressFileSystemMonitoring` (default: true)
- **true**: Applies race condition prevention measures
- **false**: Uses standard dotnet operations (may cause race conditions)

---

## Diagnostic Information

### Extension Logs
Check the VS Code Output panel under ".NET Package Upgrader" for detailed logs.

### File System Monitoring Tips
1. **Temporary Warnings Are Normal**: File system monitoring issues don't indicate upgrade failures
2. **Check Final Results**: Look at the summary to see actual upgrade success/failure
3. **GitHub Copilot Interactions**: Extensions monitoring the same files can cause race conditions

### Performance Tips
1. **Disable Complex Analysis**: Set `enableDependencyAnalysis: false` for faster upgrades
2. **Close Unnecessary Extensions**: Reduce file system monitoring conflicts
3. **Use Simple Strategy**: For quick upgrades, the fallback strategy works well

---

## Technical Architecture

### Primary Solution Components

1. **UpgradeStrategist**: Simplified AI-first strategy generation
2. **PackageUpgrader**: Comprehensive race condition prevention
3. **CopilotService**: AI strategy generation with fallbacks
4. **Transparent Error Reporting**: Clear distinction between monitoring and upgrade issues

### Fallback Mechanisms

1. **AI → Prefix-based**: If AI fails, use Microsoft.* first grouping
2. **Prefix-based → Sequential**: If grouping fails, upgrade all sequentially
3. **Complex → Simple**: Configurable complexity levels

### Race Condition Prevention

1. **Pre-emptive Directory Creation**: Avoid "directory not found" errors
2. **Environment Variable Suppression**: Reduce file system monitoring
3. **Stabilization Delays**: Allow operations to complete before proceeding
4. **Error Classification**: Distinguish monitoring issues from real errors

---

## Getting Help

If you continue to experience issues:

1. **Check Configuration**: Ensure settings match your environment
2. **Review Logs**: Look for specific error messages in VS Code Output
3. **Try Simple Mode**: Disable dependency analysis for faster operation
4. **File System Issues**: Enable monitoring suppression
5. **Copilot Issues**: Verify GitHub Copilot extension and subscription

The extension now provides much more resilient operation with clear feedback about what's happening during upgrades. 