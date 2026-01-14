// tests/utils/eventbus_test.js
// Basic tests for EventBus functionality

(function() {
    // Simple test runner
    const tests = [];
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        tests.push({ name, fn });
    }

    function runTests() {
        console.log('Running EventBus tests...');

        tests.forEach(({ name, fn }) => {
            try {
                fn();
                console.log(`✓ ${name}`);
                passed++;
            } catch (e) {
                console.error(`✗ ${name}: ${e.message}`);
                failed++;
            }
        });

        console.log(`\nResults: ${passed} passed, ${failed} failed`);
    }

    // Test EventBus basic functionality
    test('EventBus should emit events to listeners', function() {
        if (typeof eventBus === 'undefined') {
            throw new Error('eventBus not available');
        }

        let received = false;
        const callback = () => { received = true; };

        eventBus.on('test:event', callback);
        eventBus.emit('test:event');

        if (!received) {
            throw new Error('Event was not received by listener');
        }
    });

    test('EventBus should pass data to listeners', function() {
        let receivedData = null;
        const testData = { message: 'hello' };
        const callback = (data) => { receivedData = data; };

        eventBus.on('test:data', callback);
        eventBus.emit('test:data', testData);

        if (!receivedData || receivedData.message !== 'hello') {
            throw new Error('Event data was not passed correctly');
        }
    });

    test('EventBus should handle multiple listeners', function() {
        let count = 0;
        const callback1 = () => { count++; };
        const callback2 = () => { count++; };

        eventBus.on('test:multi', callback1);
        eventBus.on('test:multi', callback2);
        eventBus.emit('test:multi');

        if (count !== 2) {
            throw new Error('Multiple listeners were not called');
        }
    });

    test('EventBus should allow unsubscribing', function() {
        let count = 0;
        const callback = () => { count++; };

        const unsubscribe = eventBus.on('test:unsub', callback);
        eventBus.emit('test:unsub');
        unsubscribe();
        eventBus.emit('test:unsub');

        if (count !== 1) {
            throw new Error('Unsubscribing did not work');
        }
    });

    test('EventTypes constants should be available', function() {
        if (typeof EventTypes === 'undefined') {
            throw new Error('EventTypes not available');
        }

        if (EventTypes.RENDER_REQUESTED !== 'render:requested') {
            throw new Error('EventTypes constants not defined correctly');
        }
    });

    // Run tests when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runTests);
    } else {
        runTests();
    }

})();