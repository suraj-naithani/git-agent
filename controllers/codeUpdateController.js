import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { chatLLM } from "../utils/model.js";
import { StringOutputParser } from "@langchain/core/output_parsers";

const updateSchema = z.object({
    repoName: z.string().describe("Name of the GitHub repository"),
    filePath: z.string().describe("Path to the file to update"),
    change: z.string().describe("Description of the change you want to make"),
    branch: z.string().default("main").describe("Branch to update (defaults to main)"),
    commitMessage: z.string().optional().describe("Custom commit message (optional)")
});

const deleteSchema = z.object({
    repoName: z.string().describe("Name of the GitHub repository"),
    filePath: z.string().describe("Path to the file or folder to delete"),
    branch: z.string().default("main").describe("Branch to delete from (defaults to main)"),
    commitMessage: z.string().optional().describe("Custom commit message (optional)")
});

const updateCode = async (req, res) => {
    try {
        const input = updateSchema.parse(req.body);

        // Validate GitHub token
        if (!process.env.GITHUB_TOKEN) {
            return res.status(400).json({
                success: false,
                message: "GITHUB_TOKEN not found in environment variables"
            });
        }

        const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // Get authenticated user
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        console.log(`🔑 GitHub authenticated as: ${owner}`);
        console.log(`📁 Working with repository: ${input.repoName}`);
        console.log(`📝 File path: ${input.filePath}`);
        console.log(`🔄 Change requested: ${input.change}`);

        // Check if repository exists
        try {
            await github.rest.repos.get({
                owner: owner,
                repo: input.repoName
            });
        } catch (error) {
            if (error.status === 404) {
                return res.status(404).json({
                    success: false,
                    message: `Repository '${input.repoName}' not found`
                });
            }
            throw error;
        }

        // Check if file exists to get its current content and SHA
        let currentContent = null;
        let sha = null;

        try {
            const { data } = await github.rest.repos.getContent({
                owner: owner,
                repo: input.repoName,
                path: input.filePath,
                branch: input.branch
            });

            if (data.type === 'file') {
                sha = data.sha;
                currentContent = Buffer.from(data.content, 'base64').toString('utf-8');
                console.log(`📝 File exists at ${input.filePath}, will update`);
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Path '${input.filePath}' is not a file`
                });
            }
        } catch (error) {
            if (error.status === 404) {
                sha = undefined;
                console.log(`🆕 File doesn't exist at ${input.filePath}, will create new`);
            } else {
                throw error;
            }
        }

        // Generate new code using LLM
        console.log(`🤖 Generating code using LLM...`);
        const model = chatLLM();
        const parser = new StringOutputParser();

        const prompt = `You are an expert software developer. Update the code based on the user's request.
                        ${currentContent ? `CURRENT CODE:
                        \`\`\`
                        ${currentContent}
                        \`\`\`

                        ` : ''}CHANGE REQUESTED: ${input.change}

                        REQUIREMENTS:
                        - Generate ONLY the updated code content
                        - Do NOT include any explanations, markdown, or code block markers
                        - The code should be production-ready and immediately runnable
                        - Maintain the same coding style and structure as the original code
                        - Include proper error handling and best practices
                        - If creating a new file, use appropriate file structure and imports

                        IMPORTANT: Return ONLY the raw code content. No explanations, no markdown formatting, no code block markers.`;

        const response = await model.invoke([["human", prompt]]);
        let newCodeContent = await parser.parse(response.content);

        // Clean up the response
        newCodeContent = newCodeContent
            .replace(/```(?:[a-z]*)?\s*/gi, "")
            .replace(/```/g, "")
            .trim();

        // Validate that we got actual code content
        if (!newCodeContent || newCodeContent.length < 5) {
            throw new Error('Generated code content is too short or invalid');
        }

        console.log(`✅ Generated new code content (${newCodeContent.length} characters)`);

        // Prepare commit message
        const commitMessage = input.commitMessage ||
            `${currentContent ? 'Update' : 'Create'} ${input.filePath}: ${input.change}`;

        // Commit the file
        console.log(`📤 Committing to GitHub: ${input.filePath}`);
        console.log(`📤 Commit message: ${commitMessage}`);
        console.log(`📤 Repository: ${input.repoName}`);
        console.log(`📤 Branch: ${input.branch}`);

        await github.rest.repos.createOrUpdateFileContents({
            owner: owner,
            repo: input.repoName,
            path: input.filePath,
            message: commitMessage,
            content: Buffer.from(newCodeContent).toString('base64'),
            branch: input.branch,
            sha: sha
        });

        console.log(`✅ Code successfully updated in repository`);

        res.status(200).json({
            success: true,
            message: 'Code updated successfully',
            data: {
                repository: input.repoName,
                filePath: input.filePath,
                branch: input.branch,
                commitMessage: commitMessage,
                contentLength: newCodeContent.length,
                action: currentContent ? 'updated' : 'created'
            }
        });

    } catch (error) {
        console.error('Error in updateCode controller:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update code',
            error: error.message
        });
    }
};

// Delete file or folder functionality
const deleteFileOrFolder = async (req, res) => {
    try {
        const input = deleteSchema.parse(req.body);

        // Validate GitHub token
        if (!process.env.GITHUB_TOKEN) {
            return res.status(400).json({
                success: false,
                message: "GITHUB_TOKEN not found in environment variables"
            });
        }

        const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // Get authenticated user
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        console.log(`🔑 GitHub authenticated as: ${owner}`);
        console.log(`📁 Working with repository: ${input.repoName}`);
        console.log(`🗑️ Path to delete: ${input.filePath}`);
        console.log(`🌿 Branch: ${input.branch}`);

        // Check if repository exists
        try {
            await github.rest.repos.get({
                owner: owner,
                repo: input.repoName
            });
        } catch (error) {
            if (error.status === 404) {
                return res.status(404).json({
                    success: false,
                    message: `Repository '${input.repoName}' not found`
                });
            }
            throw error;
        }

        // Check if path exists and get its details
        let pathInfo = null;
        let sha = null;
        let isDirectory = false;

        try {
            const { data } = await github.rest.repos.getContent({
                owner: owner,
                repo: input.repoName,
                path: input.filePath,
                branch: input.branch
            });

            pathInfo = data;
            sha = data.sha;

            if (data.type === 'dir') {
                isDirectory = true;
                console.log(`📁 Directory found at ${input.filePath}, will delete`);
            } else if (data.type === 'file') {
                isDirectory = false;
                console.log(`📝 File found at ${input.filePath}, will delete`);
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Path '${input.filePath}' is not a file or directory`
                });
            }
        } catch (error) {
            if (error.status === 404) {
                return res.status(404).json({
                    success: false,
                    message: `Path '${input.filePath}' not found in repository`
                });
            }
            throw error;
        }

        // Prepare commit message
        const commitMessage = input.commitMessage ||
            `Delete ${isDirectory ? 'directory' : 'file'}: ${input.filePath}`;

        // Delete the file or directory
        console.log(`🗑️ Deleting from GitHub: ${input.filePath}`);
        console.log(`📤 Commit message: ${commitMessage}`);
        console.log(`📤 Repository: ${input.repoName}`);
        console.log(`📤 Branch: ${input.branch}`);

        try {
            await github.rest.repos.deleteFile({
                owner: owner,
                repo: input.repoName,
                path: input.filePath,
                message: commitMessage,
                sha: sha,
                branch: input.branch
            });

            console.log(`✅ Successfully deleted: ${input.filePath}`);

            res.status(200).json({
                success: true,
                message: 'File or directory deleted successfully',
                data: {
                    repository: input.repoName,
                    path: input.filePath,
                    branch: input.branch,
                    commitMessage: commitMessage,
                    type: isDirectory ? 'directory' : 'file',
                    action: 'deleted'
                }
            });

        } catch (deleteError) {
            // Handle specific deletion errors
            if (deleteError.status === 409) {
                // Conflict - file might have been modified
                return res.status(409).json({
                    success: false,
                    message: 'File has been modified since last check. Please try again.',
                    error: 'Conflict: File modified'
                });
            } else {
                throw deleteError;
            }
        }

    } catch (error) {
        console.error('Error in deleteFileOrFolder controller:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file or directory',
            error: error.message
        });
    }
};

export { updateCode, deleteFileOrFolder };
