import { Octokit } from 'octokit';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.GITHUB_TOKEN?.trim();
const octokit = new Octokit({
    auth: token,
    userAgent: 'git-automation v1.0'
});

async function checkExistingRepo(owner, repoName) {
    try {
        const { data: repo } = await octokit.rest.repos.get({
            owner,
            repo: repoName
        });
        return repo;
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

async function createNewRepo(repoName) {
    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: `Auto-generated repository: ${repoName}`,
        private: false,
        auto_init: true
    });
    return repo;
}

async function repositoryManagerAgent(repoName) {
    if (!token) {
        throw new Error('GitHub token is not configured');
    }

    try {
        const { data: user } = await octokit.rest.users.getAuthenticated();
        console.log('Authenticated as:', user.login);

        const existingRepo = await checkExistingRepo(user.login, repoName);

        if (existingRepo) {
            console.log('Using existing repository');
            return {
                repositoryUrl: existingRepo.html_url,
                status: 'Repository already exists',
                branch: existingRepo.default_branch
            };
        }

        console.log('Creating new repository');
        const newRepo = await createNewRepo(repoName);
        return {
            repositoryUrl: newRepo.html_url,
            status: 'Initialized',
            initialCommit: 'Initial project setup',
            branch: newRepo.default_branch
        };

    } catch (error) {
        console.error('Detailed error:', error.response?.data || error);
        throw new Error(`Failed to handle GitHub repository: ${error.message}`);
    }
}

export { repositoryManagerAgent };
