# Code Update & Delete API

This API allows you to update GitHub code by providing a description of the change you want to make, and also delete files and folders from your repositories. The system will use an LLM model to generate the updated code and push it directly to the specified GitHub repository.

## Endpoints

### Update Code
```
POST /api/code-update/update
```

### Delete File/Folder
```
DELETE /api/code-update/delete
```

## Request Body

### Update Code
```json
{
  "repoName": "your-repository-name",
  "filePath": "path/to/file.js",
  "change": "Add error handling for the login function",
  "branch": "main",
  "commitMessage": "Optional custom commit message"
}
```

### Delete File/Folder
```json
{
  "repoName": "your-repository-name",
  "filePath": "path/to/file-or-folder",
  "branch": "main",
  "commitMessage": "Optional custom commit message"
}
```

### Update Code Parameters

- **repoName** (required): Name of the GitHub repository
- **filePath** (required): Path to the file you want to update
- **change** (required): Description of the change you want to make
- **branch** (optional): Branch to update (defaults to "main")
- **commitMessage** (optional): Custom commit message (if not provided, will auto-generate)

### Delete File/Folder Parameters

- **repoName** (required): Name of the GitHub repository
- **filePath** (required): Path to the file or folder you want to delete
- **branch** (optional): Branch to delete from (defaults to "main")
- **commitMessage** (optional): Custom commit message (if not provided, will auto-generate)

## Example Usage

### Update Code

#### Update existing file

```bash
curl -X POST http://localhost:3000/api/code-update/update \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "src/utils/validator.js",
    "change": "Add input validation for email addresses"
  }'
```

#### Create new file

```bash
curl -X POST http://localhost:3000/api/code-update/update \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "src/middleware/auth.js",
    "change": "Create authentication middleware with JWT verification"
  }'
```

#### With custom commit message

```bash
curl -X POST http://localhost:3000/api/code-update/update \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "src/routes/api.js",
    "change": "Add rate limiting to API endpoints",
    "commitMessage": "feat: implement rate limiting for API security"
  }'
```

### Delete File/Folder

#### Delete a file
```bash
curl -X DELETE http://localhost:3000/api/code-update/delete \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "src/utils/oldValidator.js"
  }'
```

#### Delete a folder
```bash
curl -X DELETE http://localhost:3000/api/code-update/delete \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "src/legacy"
  }'
```

#### Delete with custom commit message
```bash
curl -X DELETE http://localhost:3000/api/code-update/delete \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-project",
    "filePath": "docs/old-version.md",
    "commitMessage": "Remove outdated documentation"
  }'
```

## Response

### Update Code Success Response

```json
{
  "success": true,
  "message": "Code updated successfully",
  "data": {
    "repository": "my-project",
    "filePath": "src/utils/validator.js",
    "branch": "main",
    "commitMessage": "Update src/utils/validator.js: Add input validation for email addresses",
    "contentLength": 1250,
    "action": "updated"
  }
}
```

### Update Code Error Response

```json
{
  "success": false,
  "message": "Failed to update code",
  "error": "Repository 'my-project' not found"
}
```

### Delete File/Folder Success Response

```json
{
  "success": true,
  "message": "File or directory deleted successfully",
  "data": {
    "repository": "my-project",
    "path": "src/utils/oldValidator.js",
    "branch": "main",
    "commitMessage": "Delete file: src/utils/oldValidator.js",
    "type": "file",
    "action": "deleted"
  }
}
```

### Delete File/Folder Error Response

```json
{
  "success": false,
  "message": "Failed to delete file or directory",
  "error": "Path 'src/nonexistent.js' not found in repository"
}
```

## Features

### Update Code
- **Smart Code Generation**: Uses LLM to understand your change request and generate appropriate code
- **File Creation/Update**: Automatically detects if file exists and creates or updates accordingly
- **GitHub Integration**: Directly commits changes to your repository
- **Branch Support**: Works with any branch (defaults to main)
- **Custom Commit Messages**: Option to provide your own commit message
- **Error Handling**: Comprehensive error handling and validation

### Delete File/Folder
- **File & Directory Support**: Delete both individual files and entire folders
- **Smart Detection**: Automatically detects if path is a file or directory
- **GitHub Integration**: Directly removes files from your repository
- **Branch Support**: Work with any branch (defaults to main)
- **Custom Commit Messages**: Option to provide your own commit message
- **Conflict Handling**: Handles file conflicts gracefully

## Requirements

- `GITHUB_TOKEN` environment variable must be set with a valid GitHub Personal Access Token
- The token must have access to the repository you want to update
- Repository must exist and be accessible

## Notes

- The API will automatically detect if a file exists and either update it or create a new one
- Generated code is cleaned of any markdown formatting or explanations
- All changes are committed immediately to the specified branch
- The system maintains the same coding style and structure as existing code
