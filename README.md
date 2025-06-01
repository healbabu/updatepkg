# .NET Package Upgrader

A VS Code extension that integrates with GitHub Copilot to provide intelligent package upgrade suggestions for .NET projects.

## Features

- Automated package version analysis using GitHub Copilot
- Smart upgrade suggestions based on compatibility and best practices
- Support for different upgrade strategies (latest, major, minor, patch)
- Configurable automatic upgrades
- Detailed logging and progress tracking
- Breaking change detection and handling

## Requirements

- Visual Studio Code 1.85.0 or higher
- GitHub Copilot subscription
- .NET SDK installed

## Installation

1. Install the extension from the VS Code marketplace
2. Ensure GitHub Copilot is installed and authenticated
3. Configure the extension settings as needed

## Usage

1. Open a .NET project in VS Code
2. Use the command palette (Ctrl+Shift+P) and select "Upgrade .NET Packages"
3. Review the suggested updates
4. Confirm to apply the updates

## Configuration

The extension can be configured through VS Code settings:

- `dotnetPackageUpgrader.autoUpgrade`: Enable/disable automatic package upgrades
- `dotnetPackageUpgrader.upgradeStrategy`: Choose upgrade strategy (latest, major, minor, patch)

## Extension Settings

```json
{
    "dotnetPackageUpgrader.autoUpgrade": false,
    "dotnetPackageUpgrader.upgradeStrategy": "patch"
}
```

## Known Issues

- Breaking changes detection may not be 100% accurate
- Some package updates may require manual intervention
- Large projects may take longer to analyze

## Release Notes

### 0.0.1

Initial release with basic package upgrade functionality.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details 