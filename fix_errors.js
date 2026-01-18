#!/usr/bin/env node

/**
 * Corrected Automated Error Handling Standardization Script
 * Fixes the context-aware replacement of console calls with errorHandler calls
 */

const fs = require('fs');
const path = require('path');

// Files to exclude from processing
const EXCLUDE_PATTERNS = [
    /tests\//,           // Test files
    /ErrorHandler\.js$/, // The error handler itself
    /node_modules\//,    // Dependencies
    /docs\//,           // Documentation
    /standardize_errors\.js$/, // This script itself
];

// Only process these file extensions
const INCLUDE_EXTENSIONS = ['.js'];

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

function extractContextFromFile(content, matchIndex) {
    // Get lines around the match to infer context
    const lines = content.split('\n');
    const matchLine = content.substring(0, matchIndex).split('\n').length - 1;

    // Look for context in surrounding lines
    for (let i = Math.max(0, matchLine - 5); i <= Math.min(lines.length - 1, matchLine + 5); i++) {
        const line = lines[i].trim();

        // Look for class names
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) return classMatch[1];

        // Look for function/method names
        const funcMatch = line.match(/(?:function\s+|(\w+)\s*\()/);
        if (funcMatch && funcMatch[1] && !['if', 'for', 'while', 'try', 'catch', 'console'].includes(funcMatch[1])) {
            return funcMatch[1];
        }
    }

    // Fallback to filename
    return path.basename(path.dirname(process.cwd() + '/' + 'unknown.js'), '.js');
}

function processFile(filePath) {
    console.log(`Processing: ${filePath}`);

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // Determine context: class instance vs global object
        const isClassInstance = content.includes('this.errorHandler') || content.includes('this.eventBus');
        const isNotificationUtils = filePath.includes('notificationUtils.js');

        // Pattern 1: this.errorHandler.logError('message', 'instance', optionalData)
        content = content.replace(/console\.error\(['"]([^'"]*)['"](\s*,\s*([^;]+))?\)/g, (match, message, _, data, offset) => {
            const context = extractContextFromFile(content, offset);
            modified = true;

            if (isNotificationUtils) {
                // For NotificationUtils, use global errorHandler
                return data ?
                    `errorHandler.logError('${message}', '${context}', ${data.trim()})` :
                    `errorHandler.logError('${message}', '${context}')`;
            } else if (isClassInstance) {
                // For class instances, use this.errorHandler
                return data ?
                    `this.errorHandler.logError('${message}', '${context}', ${data.trim()})` :
                    `this.errorHandler.logError('${message}', '${context}')`;
            } else {
                // For other contexts, use global errorHandler with fallback
                return data ?
                    `(typeof errorHandler !== 'undefined' ? errorHandler : console).error('${message}', ${data.trim()})` :
                    `(typeof errorHandler !== 'undefined' ? errorHandler : console).error('${message}')`;
            }
        });

        // Pattern 2: this.errorHandler.logWarning('message', 'error', optionalData)
        content = content.replace(/console\.warn\(['"]([^'"]*)['"](\s*,\s*([^;]+))?\)/g, (match, message, _, data, offset) => {
            const context = extractContextFromFile(content, offset);
            modified = true;

            if (isNotificationUtils) {
                return data ?
                    `errorHandler.logWarning('${message}', '${context}', ${data.trim()})` :
                    `errorHandler.logWarning('${message}', '${context}')`;
            } else if (isClassInstance) {
                return data ?
                    `this.errorHandler.logWarning('${message}', '${context}', ${data.trim()})` :
                    `this.errorHandler.logWarning('${message}', '${context}')`;
            } else {
                return data ?
                    `(typeof errorHandler !== 'undefined' ? errorHandler : console).warn('${message}', ${data.trim()})` :
                    `(typeof errorHandler !== 'undefined' ? errorHandler : console).warn('${message}')`;
            }
        });

        // Pattern 3: this.errorHandler.logDebug('message', 'warn', optionalData) - convert to logDebug
        content = content.replace(/console\.log\(['"]([^'"]*)['"](\s*,\s*([^;]+))?\)/g, (match, message, _, data, offset) => {
            const context = extractContextFromFile(content, offset);
            modified = true;

            if (isNotificationUtils) {
                return data ?
                    `errorHandler.logDebug('${message}', '${context}', ${data.trim()})` :
                    `errorHandler.logDebug('${message}', '${context}')`;
            } else if (isClassInstance) {
                return data ?
                    `this.errorHandler.logDebug('${message}', '${context}', ${data.trim()})` :
                    `this.errorHandler.logDebug('${message}', '${context}')`;
            } else {
                return data ?
                    `(typeof errorHandler !== 'undefined' ? errorHandler : console).log('${message}', ${data.trim()})` :
                    `(typeof errorHandler !== 'undefined' ? errorHandler : console).log('${message}')`;
            }
        });

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
this.errorHandler.logDebug('Starting corrected error handling standardization...', 'cwd');
console.log(`Working directory: ${workspaceRoot}`);
this.errorHandler.logDebug('This will fix context-aware replacement of console calls with errorHandler calls.\n', 'cwd');

walkDirectory(workspaceRoot);

this.errorHandler.logDebug('\nCorrected error handling standardization complete!', 'log');
this.errorHandler.logDebug('Note: Please review the changes and test the application.', 'log');