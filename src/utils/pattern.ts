export const fileTypePatterns = [
    // Documentation - highest priority
    { pattern: /^(README|CHANGELOG|LICENSE|CONTRIBUTING|AUTHORS)/i, category: 'docs', weight: 25 },
    { pattern: /^docs?\//i, category: 'docs', weight: 22 },
    { pattern: /\.(md|mdx|txt|rst|adoc|tex)$/i, category: 'docs', weight: 20 },

    // Test files
    { pattern: /\.(test|spec)\.(js|ts|jsx|tsx|py|java|cs|rb|php|go|rs)$/i, category: 'test', weight: 22 },
    { pattern: /^(test|tests|spec|specs|__tests__|__specs__)\//i, category: 'test', weight: 20 },
    { pattern: /(\.|_)(test|spec)$/i, category: 'test', weight: 18 },

    // Configuration files
    { pattern: /\.(json|yaml|yml|toml|ini|cfg|conf|properties)$/i, category: 'config', weight: 19 },
    {
        pattern: /^(package\.json|package-lock\.json|yarn\.lock|Gemfile|requirements\.txt|pom\.xml|build\.gradle)$/i,
        category: 'config',
        commitType: 'chore',
        weight: 21,
    },
    { pattern: /\.(config|rc|env|\.env)/i, category: 'config', weight: 18 },

    // Build and CI/CD
    { pattern: /^(Dockerfile|docker-compose|Makefile|CMakeLists\.txt)$/i, category: 'build', weight: 18 },
    { pattern: /^\.(github|gitlab|circleci|travis)\//i, category: 'ci', weight: 17 },
    { pattern: /\.(github|gitlab|bitbucket|circleci|travis)\.(yml|yaml)$/i, category: 'ci', weight: 16 },

    // Style files
    { pattern: /\.(css|scss|sass|less|styl)$/i, category: 'style', weight: 16 },
    { pattern: /\.(html|htm|xml|xhtml|vue|svelte|astro)$/i, category: 'markup', weight: 14 },

    // Scripts and binaries
    { pattern: /\.(sh|bash|bat|cmd|ps1|zsh|fish)$/i, category: 'script', weight: 12 },

    // Assets and media
    { pattern: /\.(png|jpg|jpeg|gif|svg|ico|bmp|tiff|webp|avif)$/i, category: 'assets', weight: 10 },
    { pattern: /\.(woff|woff2|ttf|eot|otf)$/i, category: 'assets', weight: 10 },
    { pattern: /\.(mp4|mp3|avi|mov|wmv|flv|webm|ogg|wav|flac)$/i, category: 'assets', weight: 10 },

    // Source code files with framework-specific patterns
    { pattern: /\.(js|jsx|ts|tsx)$/i, category: 'feature', weight: 8 },
    { pattern: /\.(py|java|cs|rb|php|go|rs|cpp|c|h|m|swift|kt|dart)$/i, category: 'feature', weight: 7 },

    // Framework-specific patterns
    { pattern: /\.(vue|svelte|astro)$/i, category: 'component', weight: 15 },
    { pattern: /\.(story|stories)\.(js|jsx|ts|tsx)$/i, category: 'docs', weight: 14 },

    // Data files
    { pattern: /\.(csv|tsv|jsonl|xml|sql|db|sqlite|parquet)$/i, category: 'data', weight: 9 },
];

export const scopePatterns = [
    // Framework/Architecture specific
    { pattern: /(^|\/)(components?|ui)(\/|$)/i, name: 'components', weight: 15 },
    { pattern: /(^|\/)(pages?|views?|screens?)(\/|$)/i, name: 'pages', weight: 15 },
    { pattern: /(^|\/)(api|server|backend)(\/|$)/i, name: 'api', weight: 15 },
    { pattern: /(^|\/)(services?|business|domain)(\/|$)/i, name: 'services', weight: 14 },
    { pattern: /(^|\/)(hooks?|custom-hooks)(\/|$)/i, name: 'hooks', weight: 14 },

    // Feature-specific patterns
    { pattern: /(^|\/)(auth|authentication)(\/|$)/i, name: 'auth', weight: 13 },
    { pattern: /(^|\/)(dashboard|admin)(\/|$)/i, name: 'dashboard', weight: 13 },
    { pattern: /(^|\/)(user|profile)(\/|$)/i, name: 'user', weight: 12 },
    { pattern: /(^|\/)(payment|billing)(\/|$)/i, name: 'payment', weight: 12 },

    // Common directories
    { pattern: /(^|\/)(models?|entities?|schemas?)(\/|$)/i, name: 'models', weight: 12 },
    { pattern: /(^|\/)(controllers?|handlers?|routes?)(\/|$)/i, name: 'controllers', weight: 12 },
    { pattern: /(^|\/)(utils?|helpers?|shared)(\/|$)/i, name: 'utils', weight: 10 },
    { pattern: /(^|\/)(types?|interfaces?|@types)(\/|$)/i, name: 'types', weight: 10 },

    // Testing and tooling
    { pattern: /(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/i, name: 'tests', weight: 11 },
    { pattern: /(^|\/)(stories?|storybook)(\/|$)/i, name: 'storybook', weight: 9 },

    // Build and assets
    { pattern: /(^|\/)(build|dist|out|public)(\/|$)/i, name: 'build', weight: 8 },
    { pattern: /(^|\/)(assets?|static|media)(\/|$)/i, name: 'assets', weight: 9 },
    { pattern: /(^|\/)(styles?|css|scss|sass)(\/|$)/i, name: 'styles', weight: 9 },
    { pattern: /(^|\/)(docs?|documentation)(\/|$)/i, name: 'docs', weight: 8 },
    { pattern: /(^|\/)(scripts?|bin|tools)(\/|$)/i, name: 'scripts', weight: 7 },

    // Core system
    { pattern: /(^|\/)(core|kernel|system)(\/|$)/i, name: 'core', weight: 11 },

    // Config-related
    { pattern: /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i, name: 'config', weight: 20 },
    { pattern: /(^|\/)(requirements\.txt|Gemfile|pom\.xml|build\.gradle)$/i, name: 'config', weight: 19 },
    { pattern: /(^|\/)(constants?|config|configuration)(\/|$)/i, name: 'config', weight: 15 },
    { pattern: /\.(json|yaml|yml|toml|ini|cfg|conf|properties|env)$/i, name: 'config', weight: 14 },
];
