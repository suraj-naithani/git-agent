# Git Automation Workflow - AI-Powered Code Management System

## 🚀 Project Overview

This is a comprehensive AI-powered Git automation system that combines episodic memory, intelligent code generation, and automated GitHub operations. The system enables developers to create, update, and manage code repositories using natural language descriptions and AI-powered code generation.

### 🎯 What This Project Does

- **AI-Powered Code Generation**: Uses LLM models to generate production-ready code based on natural language descriptions
- **Automated GitHub Operations**: Directly commits, updates, and deletes files in GitHub repositories
- **Episodic Memory System**: Remembers project state and progress across multiple development cycles
- **Intelligent Workflow Orchestration**: Manages complex development workflows with multiple AI agents
- **Real-time Code Updates**: Immediate code modifications without manual intervention

### 🏗️ System Architecture

The system consists of several interconnected components:

1. **AI Agents**: Specialized agents for different development tasks
2. **Episodic Memory**: Persistent storage for project state and progress
3. **GitHub Integration**: Direct repository management via GitHub API
4. **Workflow Orchestrator**: Coordinates agent activities and manages development cycles
5. **Cron Scheduler**: Automated execution of development tasks
6. **REST API**: HTTP endpoints for manual operations and system management

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [System Architecture](#️-system-architecture)
- [Key Components](#-key-components)
- [Installation & Setup](#-installation--setup)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [Workflow Explanation](#-workflow-explanation)
- [Usage Examples](#-usage-examples)
- [Troubleshooting](#-troubleshooting)
- [Development Guide](#-development-guide)

## 🔧 Key Components

### 1. **AI Agents System**
- **Idea Generation Agent**: Creates project specifications and ideas
- **Planning Agent**: Breaks down projects into implementable tasks
- **Repository Management Agent**: Sets up and manages GitHub repositories
- **Development Agent**: Generates actual code for specific tasks
- **Quality Assurance Agent**: Reviews and validates generated code

### 2. **Episodic Memory System**
- **Project State Tracking**: Remembers current project status
- **Task Progress**: Tracks completed and remaining tasks
- **Repository Information**: Stores GitHub repository details
- **Development History**: Maintains log of all development activities

### 3. **Workflow Orchestrator**
- **Initial Cycle Management**: Handles project setup and initialization
- **Daily Development Cycles**: Manages ongoing development tasks
- **Agent Coordination**: Ensures proper sequence of agent execution
- **State Management**: Maintains consistency across development phases

### 4. **GitHub Integration Layer**
- **Repository Operations**: Create, update, delete files and folders
- **Commit Management**: Automated commit messages and version control
- **Branch Handling**: Support for multiple branches and workflows
- **Conflict Resolution**: Handles file conflicts and modifications

## 🚀 Installation & Setup

### Prerequisites

- **Node.js**: Version 18 or higher
- **Git**: Latest version
- **GitHub Account**: With Personal Access Token
- **OpenAI API Key** (or Google Gemini API Key)

### Step-by-Step Installation

#### 1. **Clone the Repository**
```bash
git clone <your-repository-url>
cd git-automation
```

#### 2. **Install Dependencies**
```bash
npm install
```

#### 3. **Environment Configuration**
Create a `.env` file in the root directory:

```bash
# GitHub Configuration (single or multiple accounts)

# Option 1: Single account (backwards compatible)
GITHUB_TOKEN=your_github_personal_access_token

# Option 2: Multiple accounts (sequential runs for each)
# GITHUB_TOKEN_1=first_account_personal_access_token
# GITHUB_TOKEN_2=second_account_personal_access_token
# GITHUB_TOKEN_3=third_account_personal_access_token

# AI Model Configuration
MODEL_PROVIDER=openai  # or "gemini"
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_google_api_key

# Application Configuration
PORT=3000
COMMIT_MODE=test  # or "production"

# Optional: Repository Override
GITHUB_REPO_NAME=your_default_repo_name
GITHUB_REPO_URL=https://github.com/username/repo

# Optional: Notification Services
SLACK_TOKEN=your_slack_token
SLACK_CHANNEL=#general
```

#### 4. **GitHub Token Setup**
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with these permissions:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `admin:org` (if working with organization repositories)

#### 5. **Start the Application**
```bash
npm start
# or
node index.js
```

## ⚙️ Configuration

### Environment Variables Explained

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GITHUB_TOKEN` / `GITHUB_TOKEN_1..N` | GitHub Personal Access Token(s). When multiple are set (GITHUB_TOKEN_1, GITHUB_TOKEN_2, ...), the main git-agent workflow will run sequentially for each account. | ✅ Yes | - |
| `MODEL_PROVIDER` | AI Model Provider (openai/gemini) | ❌ No | `openai` |
| `OPENAI_API_KEY` | OpenAI API Key | ✅ Yes* | - |
| `GOOGLE_API_KEY` | Google Gemini API Key | ✅ Yes* | - |
| `PORT` | Application Port | ❌ No | `3000` |
| `COMMIT_MODE` | Commit Schedule Mode | ❌ No | `test` |
| `GITHUB_REPO_NAME` | Default Repository Name | ❌ No | Auto-generated |
| `GITHUB_REPO_URL` | Default Repository URL | ❌ No | Auto-generated |

*Required based on MODEL_PROVIDER selection

### Commit Schedule Modes

#### Test Mode (Default)
- **Interval**: Every 2 minutes
- **Cron Pattern**: `*/2 * * * *`
- **Use Case**: Development and testing

#### Production Mode
- **Interval**: Daily at 9:00 AM
- **Cron Pattern**: `0 9 * * *`
- **Use Case**: Production deployments

## 🌐 API Reference

### Base URL
```
http://localhost:3000/api
```

### 1. **Git Agent Workflow API**

#### Main Workflow Endpoint
```http
POST /api/git-agent/run
```

**Purpose**: Execute the main development workflow (initial setup or development cycle)

**Request Body**:
```json
{
  "projectName": "My Awesome Project",
  "description": "A web application for task management",
  "complexity": "intermediate",
  "techConstraints": ["Node.js", "React", "MongoDB"]
}
```

**Parameters**:
- `projectName` (optional): Specific project name/idea
- `description` (optional): Additional context about the project
- `complexity` (optional): `beginner`, `intermediate`, or `advanced`
- `techConstraints` (optional): Array of technology requirements

**Response**:
```json
{
  "success": true,
  "data": {
    "projectSpec": "Project specification JSON",
    "plan": "Implementation plan with tasks",
    "repo": "Repository information",
    "status": "Project status"
  },
  "message": "Initial project setup completed successfully"
}
```

#### Cron Management Endpoints

**Get Scheduler Status**:
```http
GET /api/git-agent/cron/status
```

**Start Scheduler**:
```http
POST /api/git-agent/cron/start
```

**Stop Scheduler**:
```http
POST /api/git-agent/cron/stop
```

**Restart Scheduler**:
```http
POST /api/git-agent/cron/restart
```

**Manual Trigger**:
```http
POST /api/git-agent/cron/trigger
```

#### Project Status Endpoints

**Get Project Status**:
```http
GET /api/git-agent/status
```

**Debug Current State**:
```http
GET /api/git-agent/debug
```

**Reset Project**:
```http
POST /api/git-agent/reset
```

**Force Reset**:
```http
POST /api/git-agent/force-reset
```

**Continue Development**:
```http
POST /api/git-agent/continue
```

### 2. **Code Update & Delete API**

#### Update Code
```http
POST /api/code-update/update
```

**Purpose**: Update or create code files using AI generation

**Request Body**:
```json
{
  "repoName": "my-project",
  "filePath": "src/utils/validator.js",
  "change": "Add input validation for email addresses",
  "branch": "main",
  "commitMessage": "feat: add email validation"
}
```

**Parameters**:
- `repoName` (required): GitHub repository name
- `filePath` (required): Path to the file to update/create
- `change` (required): Description of the change
- `branch` (optional): Target branch (defaults to "main")
- `commitMessage` (optional): Custom commit message

#### Delete File/Folder
```http
DELETE /api/code-update/delete
```

**Purpose**: Delete files or folders from GitHub repository

**Request Body**:
```json
{
  "repoName": "my-project",
  "filePath": "src/utils/oldFile.js",
  "branch": "main",
  "commitMessage": "Remove deprecated file"
}
```

**Parameters**:
- `repoName` (required): GitHub repository name
- `filePath` (required): Path to the file/folder to delete
- `branch` (optional): Target branch (defaults to "main")
- `commitMessage` (optional): Custom commit message

## 🔄 Workflow Explanation

### Initial Project Setup Cycle

```
User Request → Idea Generation → Project Planning → Repository Setup → Memory Storage
```

1. **Idea Generation**: AI creates project specification based on user input
2. **Project Planning**: Breaks down project into implementable tasks
3. **Repository Setup**: Creates GitHub repository with initial structure
4. **Memory Storage**: Saves project state and plan to episodic memory

### Daily Development Cycle

```
Cron Trigger → Task Selection → Code Generation → GitHub Commit → Memory Update
```

1. **Task Selection**: Picks next uncompleted task from the plan
2. **Code Generation**: AI generates code for the selected task
3. **GitHub Commit**: Commits generated code to the repository
4. **Memory Update**: Updates progress and moves to next task

### Agent Workflow

```
Input Validation → Agent Execution → Result Processing → State Update → Response
```

1. **Input Validation**: Validates request parameters and authentication
2. **Agent Execution**: Runs appropriate AI agent for the task
3. **Result Processing**: Processes agent output and validates results
4. **State Update**: Updates project state and memory
5. **Response**: Returns formatted response to user

## 📚 Usage Examples

### Complete Workflow Example

#### 1. **Start a New Project**
```bash
curl -X POST http://localhost:3000/api/git-agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "Task Management App",
    "description": "A web application for managing personal and team tasks",
    "complexity": "intermediate",
    "techConstraints": ["Node.js", "React", "MongoDB", "Express"]
  }'
```

#### 2. **Check Project Status**
```bash
curl -X GET http://localhost:3000/api/git-agent/status
```

#### 3. **Update Existing Code**
```bash
curl -X POST http://localhost:3000/api/code-update/update \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "task-management-app",
    "filePath": "src/components/TaskForm.js",
    "change": "Add form validation for task title and due date",
    "commitMessage": "feat: add form validation"
  }'
```

#### 4. **Delete Unused Files**
```bash
curl -X DELETE http://localhost:3000/api/code-update/delete \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "task-management-app",
    "filePath": "src/utils/oldHelper.js",
    "commitMessage": "Remove deprecated helper functions"
  }'
```

#### 5. **Manage Cron Scheduler**
```bash
# Check status
curl -X GET http://localhost:3000/api/git-agent/cron/status

# Start scheduler
curl -X POST http://localhost:3000/api/git-agent/cron/start

# Stop scheduler
curl -X POST http://localhost:3000/api/git-agent/cron/stop
```

### Advanced Usage Scenarios

#### **Multi-Branch Development**
```bash
# Update code in feature branch
curl -X POST http://localhost:3000/api/code-update/update \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "src/features/user-auth.js",
    "change": "Implement JWT authentication middleware",
    "branch": "feature/user-auth",
    "commitMessage": "feat: implement JWT authentication"
  }'
```

#### **Batch Operations**
```bash
# Create multiple files
for file in "auth.js" "validation.js" "database.js"; do
  curl -X POST http://localhost:3000/api/code-update/update \
    -H "Content-Type: application/json" \
    -d "{
      \"repoName\": \"my-project\",
      \"filePath\": \"src/utils/$file\",
      \"change\": \"Create $file utility module\"
    }"
done
```

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. **GitHub Token Issues**
**Problem**: `GITHUB_TOKEN not found in environment variables`
**Solution**: 
- Check `.env` file exists
- Verify token is correctly set
- Ensure token has required permissions

#### 2. **Repository Not Found**
**Problem**: `Repository 'repo-name' not found`
**Solution**:
- Verify repository name is correct
- Check GitHub token has access to repository
- Ensure repository exists and is not private

#### 3. **AI Model Errors**
**Problem**: `Failed to generate code`
**Solution**:
- Verify API key is valid
- Check API quota/limits
- Ensure MODEL_PROVIDER is correctly set

#### 4. **Cron Scheduler Issues**
**Problem**: Scheduler not starting or running
**Solution**:
- Check cron status endpoint
- Verify environment variables
- Restart the scheduler manually

#### 5. **Memory Issues**
**Problem**: Project state not persisting
**Solution**:
- Check memory service configuration
- Verify file permissions
- Reset project state if needed

### Debug Commands

```bash
# Check system status
curl -X GET http://localhost:3000/api/git-agent/debug

# Debug current state
curl -X POST http://localhost:3000/api/git-agent/debug-state

# Check cron status
curl -X GET http://localhost:3000/api/git-agent/cron/status

# Force reset project
curl -X POST http://localhost:3000/api/git-agent/force-reset
```

## 🛠️ Development Guide

### Project Structure
```
git-automation/
├── agent/                 # AI agent implementations
│   ├── agents.js         # Core agent functions
│   ├── developmentAgent.js # Code generation agent
│   └── workflow.js       # Workflow orchestration
├── controllers/          # API controllers
│   ├── gitAgentController.js # Main workflow controller
│   └── codeUpdateController.js # Code update/delete controller
├── routes/               # API route definitions
│   ├── gitAgentRoutes.js # Main workflow routes
│   └── codeUpdateRoutes.js # Code update routes
├── services/             # Business logic services
│   ├── memoryService.js  # Episodic memory management
│   ├── cronScheduler.js  # Automated task scheduling
│   └── notificationService.js # Notification handling
├── utils/                # Utility functions
│   ├── model.js          # AI model configuration
│   └── features.js       # GitHub repository utilities
├── config/               # Configuration files
├── index.js              # Application entry point
└── WORKFLOW_README.md    # This documentation
```

### Adding New Features

#### 1. **Create New Agent**
- Add agent function to `agent/agents.js`
- Update workflow orchestration in `agent/workflow.js`
- Add memory integration in `services/memoryService.js`

#### 2. **Add New API Endpoint**
- Create controller function
- Add route definition
- Update documentation

#### 3. **Extend Memory System**
- Modify `services/memoryService.js`
- Update agent integration
- Add new state tracking

### Testing

#### Manual Testing
```bash
# Start application
npm start

# Test endpoints with curl commands
curl -X POST http://localhost:3000/api/git-agent/run \
  -H "Content-Type: application/json" \
  -d '{"projectName": "test-project"}'
```

#### Automated Testing
```bash
# Run tests (if implemented)
npm test

# Check API health
curl -X GET http://localhost:3000/api/git-agent/status
```

## 📖 Additional Resources

### Documentation
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Google Gemini API Documentation](https://ai.google.dev/docs)

### Related Concepts
- **Episodic Memory**: Long-term memory for specific events and experiences
- **AI Agents**: Autonomous software entities that perform specific tasks
- **Workflow Orchestration**: Coordination of multiple processes and systems
- **GitOps**: Git-based operations and infrastructure management

### Community and Support
- GitHub Issues: Report bugs and request features
- Discussions: Ask questions and share ideas
- Contributing: Guidelines for contributing to the project

## 🎯 Conclusion

This Git Automation Workflow system represents a significant advancement in AI-powered development automation. By combining episodic memory, intelligent agents, and direct GitHub integration, it provides developers with a powerful tool for managing code repositories and automating development workflows.

The system is designed to be:
- **Intelligent**: Uses AI to understand and execute development tasks
- **Efficient**: Automates repetitive development processes
- **Reliable**: Maintains state and progress across sessions
- **Extensible**: Easy to add new features and capabilities
- **User-Friendly**: Simple API interface for all operations

Whether you're a solo developer looking to automate your workflow or a team lead managing multiple projects, this system provides the tools and infrastructure needed to streamline development processes and increase productivity.

---

**Happy Coding! 🚀**

*For questions, issues, or contributions, please refer to the project's GitHub repository.*
