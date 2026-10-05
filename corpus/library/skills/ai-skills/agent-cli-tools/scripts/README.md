# Scripts Directory

This directory contains executable scripts used by the skill for automation.

## Guidelines

### Script Requirements

All scripts in this directory should:
- Be self-contained and well-documented
- Include a clear description at the top
- Implement robust error handling
- Be executable (`chmod +x script.sh`)
- Use appropriate shebang line

### Example Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail

# script-name.sh - Brief description
#
# Usage: ./script-name.sh [arguments]
#
# Detailed description of what this script does.

# Script implementation...
```

### Supported Languages

- Shell scripts (`.sh`) - Bash 4.0+
- Python scripts (`.py`) - Python 3.9+
- JavaScript/TypeScript (`.js`, `.ts`) - Node.js 18+

### Testing Scripts

Always test scripts independently before integrating with the skill:

```bash
# Make executable
chmod +x scripts/my-script.sh

# Test execution
./scripts/my-script.sh --help
./scripts/my-script.sh [test-args]
```

## See Also

- Parent SKILL.md for skill documentation
- `../references/` for supporting documentation
