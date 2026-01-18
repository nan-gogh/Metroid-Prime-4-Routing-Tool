#!/usr/bin/env node

/**
 * Automated Error Handling Standardization Script
 * Replaces console.log/error/warn with errorHandler calls in production code
 */

const fs = require('fs');
const path = require('path');

// Files to exclude from processing
const EXCLUDE_PATTERNS = [
    /tests\//,           // Test files
    /ErrorHandler\.js$/, // The error handler itself
    /node_modules\//,    // Dependencies
    /docs\//,           // Documentation
    /\.md$/,            // Markdown files
    /\.html$/,          // HTML files (except index.html which might have inline scripts)
];

// Only process these file extensions
const INCLUDE_EXTENSIONS = ['.js'];

// Replacement patterns
const REPLACEMENTS = [
    {
        // this.errorHandler.logError('message', 'require', data) -> this.errorHandler.logError('message', 'context', data)
        pattern: /console\.error\(['"]([^'"]*)['"]\s*(?:,\s*([^;]+))?\)/g,
        replacement: (match, message, data) => {
            const context = inferContextFromFile(match);
            if (data) {
                return `this.errorHandler.logError('${message}', '${context}', ${data})`;
            } else {
                return `this.errorHandler.logError('${message}', '${context}')`;
            }
        }
    },
    {
        // this.errorHandler.logError('message', 'require', data) -> this.errorHandler.logWarning('message', 'context', data)
        pattern: /console\.warn\(['"]([^'"]*)['"]\s*(?:,\s*([^;]+))?\)/g,
        replacement: (match, message, data) => {
            const context = inferContextFromFile(match);
            if (data) {
                return `this.errorHandler.logWarning('${message}', '${context}', ${data})`;
            } else {
                return `this.errorHandler.logWarning('${message}', '${context}')`;
            }
        }
    },
    {
        // this.errorHandler.logError('message', 'require', data) -> this.errorHandler.logDebug('message', 'context', data)
        pattern: /console\.log\(['"]([^'"]*)['"]\s*(?:,\s*([^;]+))?\)/g,
        replacement: (match, message, data) => {
            const context = inferContextFromFile(match);
            if (data) {
                return `this.errorHandler.logDebug('${message}', '${context}', ${data})`;
            } else {
                return `this.errorHandler.logDebug('${message}', '${context}')`;
            }
        }
    }
];

function inferContextFromFile(content) {
    // Try to infer context from surrounding code
    const lines = content.split('\n');
    for (const line of lines) {
        // Look for class names, function names, or file-specific patterns
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) return classMatch[1];

        const functionMatch = line.match(/function\s+(\w+)/);
        if (functionMatch) return functionMatch[1];

        const methodMatch = line.match(/(\w+)\s*\(/);
        if (methodMatch && !['if', 'for', 'while', 'try', 'catch'].includes(methodMatch[1])) {
            return methodMatch[1];
        }
    }
    return 'unknown';
}

function shouldProcessFile(filePath) {
    // Check exclude patterns
    for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(filePath)) {
            return false;
        }
    }

    // Check file extension
    const ext = path.extname(filePath);
    return INCLUDE_EXTENSIONS.includes(ext);
}

function processFile(filePath) {
    console.log(`Processing: ${filePath}`);

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        for (const replacement of REPLACEMENTS) {
            const originalContent = content;

            content = content.replace(replacement.pattern, (match, message, data) => {
                const context = inferContextFromFile(content.substring(0, content.indexOf(match)));
                modified = true;

                if (data) {
                    return `this.errorHandler.logError('${message}', '${context}', ${data})`;
                } else {
                    return `this.errorHandler.logError('${message}', '${context}')`;
                }
            });

            if (content !== originalContent) {
                console.log(`  Replaced console call in ${filePath}`);
            }
        }

        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`  ✓ Updated ${filePath}`);
        } else {
            console.log(`  - No changes needed in ${filePath}`);
        }

    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

function walkDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Recurse into subdirectories
            walkDirectory(filePath);
        } else if (shouldProcessFile(filePath)) {
            processFile(filePath);
        }
    }
}

// Main execution
const workspaceRoot = process.cwd();
this.errorHandler.logError('Starting automated error handling standardization...', 'require');
console.log(`Working directory: ${workspaceRoot}`);

walkDirectory(workspaceRoot);

this.errorHandler.logError('\nError handling standardization complete!', 'require');
this.errorHandler.logError('Note: Please review the changes and ensure errorHandler is available in all modified files.', 'require');