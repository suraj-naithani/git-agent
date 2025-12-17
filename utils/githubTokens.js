export function getGitHubTokens() {
    const tokens = [];

    // Collect indexed tokens: GITHUB_TOKEN_1, GITHUB_TOKEN_2, ...
    let index = 1;
    while (true) {
        const key = `GITHUB_TOKEN_${index}`;
        const value = process.env[key];

        if (!value) {
            // Stop when we first miss an index; keeps behavior simple/deterministic
            break;
        }

        const trimmed = value.trim();
        if (trimmed) {
            tokens.push(trimmed);
        }

        index += 1;
    }

    // Fallback to single-token env var for backwards compatibility
    if (tokens.length === 0 && process.env.GITHUB_TOKEN) {
        const trimmed = process.env.GITHUB_TOKEN.trim();
        if (trimmed) {
            tokens.push(trimmed);
        }
    }

    return tokens;
}

export function getPrimaryGitHubToken() {
    const tokens = getGitHubTokens();
    return tokens.length > 0 ? tokens[0] : null;
}


