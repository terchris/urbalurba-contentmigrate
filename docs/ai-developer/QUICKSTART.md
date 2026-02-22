# Quick Start

**5-second guide** to common tasks. For details, see [README.md](README.md).

## Add a Script

**Bash:**
```bash
cp templates/bash/script-template.sh scripts-mac/my-folder/my-script.sh
# Edit metadata, implement main(), then:
bash tools/validate-bash.sh my-folder
```

**PowerShell:**
```bash
cp templates/powershell/script-template.ps1 scripts-win/my-folder/my-script.ps1
# Edit metadata, implement Main, then:
bash tools/validate-powershell.sh my-folder
```

## Create a Plan

```bash
cp plans/completed/EXAMPLE-PLAN-auto-version-bump.md plans/backlog/PLAN-my-feature.md
# Edit goal, phases, tasks
```

## Workflow

1. User: "I want feature X"
2. Claude: Creates plan in `backlog/`
3. User: Reviews & confirms
4. Claude: Moves to `active/`, implements phase by phase
5. User: Reviews result
6. Claude: Moves to `completed/`

See [WORKFLOW.md](WORKFLOW.md) for details.
