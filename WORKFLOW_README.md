# Git Automation Workflow - Episodic Memory Edition

## Overview

This updated workflow implements LangChain episodic memory to enable agents to remember past actions and work incrementally on projects. The system now supports:

1. **Initial Setup Cycle**: Idea → Plan → Repository Setup (manual run)
2. **Daily Development Cycles**: Incremental code commits (automated via cron)
3. **Episodic Memory**: Agents remember project state across runs
4. **No Extra Files**: Development Agent only generates required code

## Workflow Architecture

### Initial Cycle (Manual Run)
```
User Request → Agent 1 (Idea Generation) → Agent 2 (Planning) → Agent 3 (Repo Setup)
```
- Generates project idea and specification
- Creates detailed implementation plan
- Sets up GitHub repository
- Saves project state to episodic memory

### Daily Development Cycles (Automated)
```
Cron Trigger → Agent 4 (Development) → Generate Code → Commit → Update Memory
```
- Runs automatically based on schedule
- Generates next task from plan
- Commits single task incrementally
- Updates memory with progress

## Configuration

### Commit Schedule Modes

#### Test Mode (Default)
- **Interval**: Every 2 minutes
- **Cron**: `*/2 * * * *`
- **Use Case**: Development and testing

#### Production Mode
- **Interval**: Daily at 9:00 AM
- **Cron**: `0 9 * * *`
- **Use Case**: Production deployments

Set via environment variable: `COMMIT_MODE=production`

### Environment Variables

```bash
# Required
GITHUB_TOKEN=your_github_personal_access_token
COMMIT_MODE=test  # or "production"

# Optional
GITHUB_REPO_NAME=your_repo_name
GITHUB_REPO_URL=https://github.com/username/repo
SLACK_TOKEN=your_slack_token
SLACK_CHANNEL=#general
PORT=3000
```

## API Endpoints

### Main Workflow
- `POST /api/git-agent/run` - Execute workflow (initial or development cycle)

### Cron Management
- `GET /api/git-agent/cron/status` - Get scheduler status
- `POST /api/git-agent/cron/start` - Start cron scheduler
- `POST /api/git-agent/cron/stop` - Stop cron scheduler
- `POST /api/git-agent/cron/restart` - Restart cron scheduler
- `POST /api/git-agent/cron/trigger` - Manually trigger development cycle

### Project Status
- `GET /api/git-agent/status` - Check project initialization and completion status

## Usage Examples

### 1. Start New Project
```bash
curl -X POST http://localhost:3000/api/git-agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "My Awesome App",
    "complexity": "intermediate",
    "techConstraints": ["Node.js", "React"]
  }'
```

### 2. Check Project Status
```bash
curl http://localhost:3000/api/git-agent/status
```

### 3. Manually Trigger Development Cycle
```bash
curl -X POST http://localhost:3000/api/git-agent/cron/trigger
```

### 4. Check Cron Scheduler Status
```bash
curl http://localhost:3000/api/git-agent/cron/status
```

## Memory Management

### What Gets Remembered
- Project specification and plan
- Remaining tasks list
- Completed task history
- Project initialization status
- Project completion status

### Memory Persistence
- Uses LangChain BufferMemory
- Persists across server restarts
- Automatically manages task progression

## Development Agent Rules

The Development Agent is strictly configured to:
- ✅ Generate ONLY code files required by project plan
- ✅ Make single atomic commits per task
- ✅ Follow project tech stack and patterns
- ❌ NOT create README files, tests, or documentation
- ❌ NOT create configuration files unless explicitly required
- ❌ NOT create any extra files

## Stopping Conditions

The system automatically stops when:
1. All planned tasks are completed
2. Project completion is detected
3. Memory indicates no remaining work

## Error Handling

- Failed tasks are logged to memory
- Development continues with next available task
- Cron scheduler handles errors gracefully
- Memory preserves error context for debugging

## Testing

### Quick Test (2-minute intervals)
```bash
COMMIT_MODE=test npm run dev
```

### Production Test (daily at 9 AM)
```bash
COMMIT_MODE=production npm run dev
```

## Troubleshooting

### Common Issues

1. **Project not progressing**
   - Check memory status: `GET /api/git-agent/status`
   - Verify cron scheduler: `GET /api/git-agent/cron/status`

2. **Cron not running**
   - Check scheduler status
   - Verify environment variables
   - Restart scheduler: `POST /api/git-agent/cron/restart`

3. **Memory issues**
   - Clear memory: Use development tools or restart server
   - Check memory service logs

### Debug Mode
Enable detailed logging by setting environment variables:
```bash
DEBUG=* npm run dev
```

## Migration from Old Workflow

The new workflow maintains backward compatibility:
- `runCycle()` method still works (maps to `runInitialCycle()`)
- Existing API responses include new fields
- Gradual migration supported

## Performance Considerations

- Memory operations are lightweight
- Cron jobs run independently
- GitHub API rate limits respected
- Efficient task progression tracking
