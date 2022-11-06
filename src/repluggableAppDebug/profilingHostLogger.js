export function activateProfilingLogger() {

    function installAsyncLocals() {
      const originalPromise = window.Promise;
    
      const cloneLocals = (instanceId, source) => {
        const clone = new Map(source.entries());
        return clone;
      };
    
      let currentLocals = cloneLocals(-1, new Map());
      const getCurrentLocals = () => currentLocals;
    
      const cloneCurrentLocals = instanceId =>
        cloneLocals(instanceId, currentLocals);
    
      class PromiseWrapper extends Promise {
        _thisInstanceId;
        _parentLocals;
        _thisLocals;
    
        constructor(executor) {
          const parentLocals = currentLocals;
          let thisInstanceId = -1;
    
          const thisLocals = cloneCurrentLocals(thisInstanceId);
    
          super(function(resolve, reject) {
    
            const wrapperResolve = value => {
              const saveLocals = currentLocals;
              currentLocals = thisLocals;
              try {
                //completionHooks.invoke(value, thisInstanceId);
                resolve(value);
              } finally {
                currentLocals = saveLocals;
              }
            };
    
            const wrapperReject = error => {
              const saveLocals = currentLocals;
              currentLocals = thisLocals;
    
              try {
                //rejectionHooks.invoke(error, thisInstanceId);
                reject(error);
              } finally {
                currentLocals = saveLocals;
              }
            };
    
            currentLocals = thisLocals;
    
            try {
              const executorResult = executor(wrapperResolve, wrapperReject);
              return executorResult;
            } finally {
              currentLocals = parentLocals;
            }
          });
    
          this._thisInstanceId = thisInstanceId;
          this._parentLocals = parentLocals;
          this._thisLocals = thisLocals;
        }
    
        then(success, reject) {
          const thisInstanceId = this._thisInstanceId;
          const thenLocals = cloneLocals(thisInstanceId, currentLocals);
    
          const thenResult = super.then(
            result => {
              const saveLocals = currentLocals;
              currentLocals = thenLocals;
              try {
                //completionHooks.invoke(result, thisInstanceId);
                return success ? success(result) : result;
              } finally {
                currentLocals = saveLocals;
              }
            },
            error => {
              const saveLocals = currentLocals;
              currentLocals = thenLocals;
    
              try {
                //rejectionHooks.invoke(error, thisInstanceId);
                return reject(error);
              } finally {
                currentLocals = saveLocals;
              }
            }
          );
    
          return thenResult;
        }
      }
    
      const createAsyncLocal = initialValue => {
        const key = {};
        getCurrentLocals().set(key, initialValue);
        return {
          get() {
            return getCurrentLocals().get(key);
          },
          set(newValue) {
            getCurrentLocals().set(key, newValue);
          },
          remove() {
            getCurrentLocals().delete(key);
          }
        };
      };
    
      const uninstallAsyncLocals = () => {
        window.Promise = originalPromise;
      };
    
      window.Promise = PromiseWrapper;
    
      return [
        {
          createAsyncLocal,
          cloneCurrentLocals
        },
        uninstallAsyncLocals
      ];
    }

    const formatNumber = (value, intPlaces, decimalPlaces) => {
        const integerDigits = parseInt(value);
        const n1 = integerDigits * 10;
        const n2 = Math.round(value * 10);
        const decimalDigits = n2 - n1;
        return `${integerDigits}`.padStart(intPlaces) + '.' + `${decimalDigits}`.padEnd(decimalPlaces, '0');
    };

    const [asyncLocalProvider, uninstallAsyncLocals] = installAsyncLocals();

    const createResettableState = () => {
      let rootSpans = [];
      let currentSpanAsyncLocal = asyncLocalProvider.createAsyncLocal(undefined);
      let openedSpanCount = 0;
      let closedSpanCount = 0;
  
      return {
        getRootSpans: () => rootSpans,
        getCurrentSpanAsyncLocal: () => currentSpanAsyncLocal,
        getOpenedSpanCount: () => openedSpanCount,
        getClosedSpanCount: () => closedSpanCount,
        incrementOpenedSpans: () => openedSpanCount++,
        incrementClosedSpans: () => closedSpanCount++,
        reset: () => {
          rootSpans = [];
          currentSpanAsyncLocal = asyncLocalProvider.createAsyncLocal(undefined);
          openedSpanCount = 0;
          closedSpanCount = 0;
        }
      }  
    };

    const resettableState = createResettableState();

    //let count = 0;
    // let nextSpanId = 1;
    // let apiStats = {};
    // let apiFuncStats = {};
    // let openSpans = new Map();

    const deepCountChildren = (span) => {
        if (span.deepCount >= 0) {
            return span.deepCount;
        }
        let result = 0;
        for (let i = 0 ; i < span.children.length ; i++) {
            result += 1 + deepCountChildren(span.children[i]);
        }
        span.deepCount = result;
        return result;
    };

    function createProfilingHostLogger() {
        // const incrementEntry = (map, key, duration) => {
        //     const existingEntry = map[key];
        //     if (existingEntry) {
        //         existingEntry.count++;
        //         existingEntry.duration += duration;
        //     } else {
        //         map[key] = { 
        //             count: 1, 
        //             duration
        //         };  
        //     }
        // };

        const createSpan = (messageId, kvpStart) => {
            // const spanStack = spanStackAsyncLocal.get() || [];
            // if (spanStack.length === 0) {
            //     spanStackAsyncLocal.set(spanStack);
            // }
            const parentSpan = resettableState.getCurrentSpanAsyncLocal().get();
            const t0 = performance.now();
            const span = {
                messageId,
                parent: parentSpan,
                children: [],
                t0,
                t1: undefined,
                success: undefined,
                durationTotal: undefined,
                durationSelf: undefined,
                depth: parentSpan ? parentSpan.depth + 1 : 0,
                deepCount: -1,
                end(success, error, kvpEnd) {
                    span.t1 = performance.now();
                    span.success = success;
                    span.durationTotal = span.t1 - span.t0;
                    resettableState.getCurrentSpanAsyncLocal().set(parentSpan);
                    //TODO: calculate span.durationSelf
                    // if (spanStack.length < 1 || spanStack[spanStack.length-1] !== span) {
                    //     console.error('Internal error in api-profiling-host-logger: current span mismatch');
                    //     debugger;
                    // } else {
                    //     spanStack.pop();
                    // }
                    resettableState.incrementClosedSpans();
                },
                getText() {
                    deepCountChildren(span);
                    const messageColumnWidth = 100 - span.depth * 2;
                    const messageIdText = span.deepCount > 0 
                        ? `${span.messageId} (+${span.deepCount})` 
                        : span.messageId;
                    const alignedMessageId = messageIdText.length > messageColumnWidth 
                        ? messageIdText.substr(0, messageColumnWidth) 
                        : messageIdText.padEnd(messageColumnWidth);
                    const durationText = (span.durationTotal >= 0.1 ? formatNumber(span.durationTotal, 3, 1) : ' <0.1');
                    return alignedMessageId + ' | ' + durationText;// + ' | ' + span.t0 + ' | ' + span.t1 + ' | ' + span.durationTotal;// (span.success ? '' : 'FAIL');
                }
            };
            
            if (parentSpan) {
                parentSpan.children.push(span);
            } else {
                resettableState.getRootSpans().push(span);
            }
            //spanStack.push(span);
            resettableState.getCurrentSpanAsyncLocal().set(span);
            resettableState.incrementOpenedSpans();
            return span;
        };

        return {
            log(/*severity, id, error, keyValuePairs*/) {
            },
            spanChild(messageId, keyValuePairs) {
                return createSpan(messageId, keyValuePairs, false);
            },
            spanRoot(messageId, keyValuePairs) {
                return createSpan(messageId, keyValuePairs, true);
            }
        };
    }

    const printSpanRecursive = (span) => {
        if (!span.children || span.children.length === 0) {
            console.log(span.getText())
        } else {
            console.groupCollapsed(span.getText());
            for (let i = 0 ; i < span.children.length ; i++) {
                printSpanRecursive(span.children[i]);
            }
            console.groupEnd();
        }
    };

    const originalHostLogger = window.repluggableAppDebug.host.log;
    window.repluggableAppDebug.host.log = createProfilingHostLogger();
    
    window.debug_reset_api_call_tree = () => {
        resettableState.reset();
        console.log('debug_reset_api_call_tree: api call tree was reset');
    };
    
    window.debug_call_tree_take_snapshot = (includeOpenSpans) => {
        console.log('debug_call_tree_take_snapshot: printing recorded call tree');
        console.table([{
          openedSpans: resettableState.getOpenedSpanCount(),
          closedSpans: resettableState.getClosedSpanCount(),
        }]);

        const spans = resettableState.getRootSpans();
        for (let i = 0 ; i < spans.length && i < 10 ; i++) {
          printSpanRecursive(spans[i]);
        }

        resettableState.reset();
        console.log('debug_call_tree_take_snapshot: the call tree was reset');
    };

    window.debug_call_tree_logger_onkeydown = (e) => {
        if (e.metaKey) {
            switch (e.code) {
                // case 'F1': 
                //     window.debug_reset_api_call_tree();
                //     break;
                case 'F2': 
                    window.debug_call_tree_take_snapshot();
                    break;
                case 'F8': 
                    window.debug_remove_call_tree_logger();
                    break;
            }
        }
    };

    window.debug_remove_call_tree_logger = () => {
        document.removeEventListener('keydown', window.debug_call_tree_logger_onkeydown);
        window.repluggableAppDebug.host.log = originalHostLogger;
        uninstallAsyncLocals();
        delete window.debug_call_tree_logger_onkeydown;
        delete window.debug_reset_api_call_tree;
        delete window.debug_call_tree_take_snapshot;
        delete window.debug_remove_call_tree_logger;
        console.log('debug_remove_call_tree_logger: logger removed');
    }

    document.addEventListener('keydown', window.debug_call_tree_logger_onkeydown);

    console.log('--- Repluggable Monitoring Script ---');
    console.log('Statistics collection started. Use the following to print or reset:');
    console.log('> Command+F2 or window.debug_call_tree_take_snapshot() - print recorded call tree and start over');
    console.log('> Command+F8 or window.debug_remove_call_tree_logger() - remove call tree logger and revert to the original one');
    console.log('------------');
}

export function deactivateProfilingLogger() {
    window.debug_remove_call_tree_logger();
}
