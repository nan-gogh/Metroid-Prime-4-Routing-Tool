// utils/TaskScheduler.js
// Sophisticated task scheduling to break heavy operations into chunks
// and yield to browser for rendering/input handling between chunks

const TaskScheduler = {
    _errorHandler: null,

    // Inject error handler after initialization
    setErrorHandler(handler) {
        this._errorHandler = handler;
    },

    // Yield to browser with guaranteed paint opportunity
    // Uses scheduler.yield() if available (Chrome 94+), falls back to setTimeout
    async yield() {
        if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
            try {
                await scheduler.yield();
                return;
            } catch (e) {
                // Fall through to setTimeout fallback
            }
        }
        // Fallback: setTimeout with 0 delay creates a macrotask boundary
        return new Promise(resolve => setTimeout(resolve, 0));
    },

    // Execute an async function after yielding to browser
    // Ensures the function runs in a separate macrotask
    async deferToNextTask(fn) {
        try {
            await this.yield();
            return await fn();
        } catch (e) {
            if (TaskScheduler._errorHandler) {
                TaskScheduler._errorHandler.logError(e, 'TaskScheduler.deferToNextTask');
            }
            throw e;
        }
    },

    // Execute a function in chunks, yielding between chunks
    // Chunks can be defined by item count or by calling a progress callback
    async executeInChunks(fn, options = {}) {
        const {
            chunkSize = 100,           // Items per chunk
            onProgress = null,         // Optional callback for progress tracking
            context = null             // Optional 'this' context
        } = options;

        try {
            let chunkIndex = 0;
            let result;

            while (true) {
                // Execute one chunk
                result = await fn.call(context, chunkIndex, chunkSize);

                // Check if done (fn returns false to signal completion)
                if (result === false) {
                    break;
                }

                // Call progress callback if provided
                if (onProgress) {
                    try {
                        onProgress(chunkIndex, result);
                    } catch (e) {
                        if (TaskScheduler._errorHandler) {
                            TaskScheduler._errorHandler.logError(e, 'TaskScheduler.executeInChunks.onProgress');
                        }
                    }
                }

                // Yield to browser before next chunk
                await this.yield();
                chunkIndex++;
            }

            return result;
        } catch (e) {
            if (TaskScheduler._errorHandler) {
                TaskScheduler._errorHandler.logError(e, 'TaskScheduler.executeInChunks');
            }
            throw e;
        }
    },

    // Execute multiple async operations in sequence with yielding
    async executeSequence(operations, options = {}) {
        const { onProgress = null, context = null } = options;

        try {
            let completed = 0;

            for (const operation of operations) {
                // Execute operation (async or sync)
                const result = await Promise.resolve(operation.call(context));

                completed++;

                // Call progress callback if provided
                if (onProgress) {
                    try {
                        onProgress(completed, operations.length, result);
                    } catch (e) {
                        if (TaskScheduler._errorHandler) {
                            TaskScheduler._errorHandler.logError(e, 'TaskScheduler.executeSequence.onProgress');
                        }
                    }
                }

                // Yield between operations
                if (completed < operations.length) {
                    await this.yield();
                }
            }

            return completed;
        } catch (e) {
            if (TaskScheduler._errorHandler) {
                TaskScheduler._errorHandler.logError(e, 'TaskScheduler.executeSequence');
            }
            throw e;
        }
    }
};

// Make TaskScheduler globally available
window.TaskScheduler = TaskScheduler;
