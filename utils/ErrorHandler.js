/**
 * Centralized Error Handler for Metroid Prime 4 Routing Tool
 *
 * Provides consistent error logging and handling across the application.
 * Replaces scattered empty catch blocks with meaningful error reporting.
 */

class ErrorHandler {
    constructor() {
        // Minimal constructor: ErrorHandler always logs errors and warnings.
    }

    /**
     * Log an error with context information
     * @param {Error|string} error - The error object or message
     * @param {string} context - Description of where the error occurred
     * @param {Object} additionalData - Additional context data
     */
    logError(error, context = '', additionalData = {}) {
        try {
            // Honor runtime ERRORS flag if available
            try {
                if (typeof window !== 'undefined' && window.MP4Config && window.MP4Config.ERRORS === false) return;
            } catch (flagErr) {
                // ignore and continue to best-effort log
            }
            const isErr = error instanceof Error;
            const errorMessage = isErr ? error.message : (error && typeof error === 'object' && error.message) ? error.message : String(error);
            const errorStack = isErr ? error.stack : (error && error.stack) ? error.stack : '';

            const logData = {
                timestamp: new Date().toISOString(),
                context,
                message: errorMessage,
                stack: errorStack,
                ...additionalData
            };

            // Console logging (through internal safe writer)
            this._writeConsole('error', `[${context}] ${errorMessage}`, logData);

            // Always include error details for diagnostics
            this._writeConsole('debug', 'Error details:', logData);
        } catch (inner) {
            try {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('ErrorHandler.logError internal failure', inner);
                }
            } catch (ignore) {}
        }
    }
    // Notification/storage wiring removed: ErrorHandler only logs to console

    /**
     * Log a warning with context
     * @param {string} message - Warning message
     * @param {string} context - Description of where the warning occurred
     * @param {Object} additionalData - Additional context data
     */
    logWarning(message, context = '', additionalData = {}) {
        try {
            // Honor runtime WARNINGS flag if available
            try {
                if (typeof window !== 'undefined' && window.MP4Config && window.MP4Config.WARNINGS === false) return;
            } catch (flagErr) {
                // ignore and continue to best-effort log
            }

            this._writeConsole('warn', `[${context}] ${message}`, {
                timestamp: new Date().toISOString(),
                context,
                ...additionalData
            });
        } catch (inner) {
            try {
                if (typeof console !== 'undefined' && console.warn) console.warn('ErrorHandler.logWarning internal failure', inner);
            } catch (ignore) {}
        }
    }

    /**
     * Log debug information (no-op unless debug enabled)
     * @param {string} message - Debug message
     * @param {string} context - Context description
     * @param {Object} additionalData - Additional context data
     */
    logDebug(message, context = '', additionalData = {}) {
        // Respect runtime debug flag if available
        try {
            if (typeof window !== 'undefined' && window.MP4Config && !window.MP4Config.DEBUG) return;
        } catch (e) {
            // ignore and continue to best-effort log
        }

        try {
            this._writeConsole('debug', `[${context}] ${message}`, {
                timestamp: new Date().toISOString(),
                context,
                ...additionalData
            });
        } catch (inner) {
            try {
                if (typeof console !== 'undefined' && console.error) console.error('ErrorHandler.logDebug internal failure', inner);
            } catch (ignore) {}
        }
    }
    
    _writeConsole(level, ...args) {
        try {
            if (typeof console === 'undefined') return;
            const fn = console[level] || console.log;
            fn.apply(console, args);
        } catch (e) {
            // swallow - best-effort logging only
        }
    }

    /**
     * Safe execution wrapper - executes a function and logs any errors
     * @param {Function} fn - Function to execute safely
     * @param {string} context - Context description for error logging
     * @param {*} defaultValue - Value to return if function fails
     * @returns {*} Result of function or defaultValue on error
     */
    safeExecute(fn, context = 'safeExecute', defaultValue = undefined) {
        try {
            return fn();
        } catch (error) {
            this.logError(error, context);
            return defaultValue;
        }
    }

    /**
     * Safe async execution wrapper
     * @param {Function} asyncFn - Async function to execute safely
     * @param {string} context - Context description for error logging
     * @param {*} defaultValue - Value to return if function fails
     * @returns {Promise<*>} Result of function or defaultValue on error
     */
    async safeExecuteAsync(asyncFn, context = 'safeExecuteAsync', defaultValue = undefined) {
        try {
            return await asyncFn();
        } catch (error) {
            this.logError(error, context);
            return defaultValue;
        }
    }

    /**
     * Create a safe method wrapper for object methods
     * @param {Object} obj - Object containing the method
     * @param {string} methodName - Name of the method to wrap
     * @param {string} context - Context description
     * @returns {Function} Wrapped method that logs errors
     */
    createSafeMethod(obj, methodName, context = '') {
        const originalMethod = obj[methodName];
        if (typeof originalMethod !== 'function') {
            this.logWarning(`Method ${methodName} not found on object`, context);
            return () => {};
        }

        const safeContext = context || `${obj.constructor.name}.${methodName}`;

        return (...args) => {
            try {
                return originalMethod.apply(obj, args);
            } catch (error) {
                this.logError(error, safeContext, { args });
            }
        };
    }
}

// Export for use in CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ErrorHandler };
}

// Make ErrorHandler class available in browser environment (no instance)
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}