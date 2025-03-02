/**
 * @license
 * Copyright 2015 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

var emscriptenThreadProfiler = {
  // UI update interval in milliseconds.
  uiUpdateIntervalMsecs: 1000,

  // UI div element.
  threadProfilerDiv: null,

  // Installs startup hook and periodic UI update timer.
  initialize: function initialize() {
    this.threadProfilerDiv = document.getElementById('threadprofiler');
    if (!this.threadProfilerDiv) {
      var div = document.createElement("div");
      div.innerHTML = "<div id='threadprofiler' style='margin: 20px; border: solid 1px black;'></div>";
      document.body.appendChild(div);
      this.threadProfilerDiv = document.getElementById('threadprofiler');
    }
    setInterval(function() { emscriptenThreadProfiler.updateUi() }, this.uiUpdateIntervalMsecs);
  },

  initializeNode: function initializeNode() {
    addOnInit(() => {
      emscriptenThreadProfiler.dumpState();
      setInterval(function() { emscriptenThreadProfiler.dumpState() }, this.uiUpdateIntervalMsecs);
    });
  },

  dumpState: function dumpState() {
    var mainThread = _emscripten_main_browser_thread_id();

    var threads = [mainThread];
    for (var i in PThread.pthreads) {
      threads.push(PThread.pthreads[i].threadInfoStruct);
    }
    for (var i = 0; i < threads.length; ++i) {
      var threadPtr = threads[i];
      var profilerBlock = Atomics.load(HEAPU32, (threadPtr + 8 /* {{{ C_STRUCTS.pthread.profilerBlock }}}*/) >> 2);
      var threadName = PThread.getThreadName(threadPtr);
      if (threadName) {
        threadName = '"' + threadName + '" (0x' + threadPtr.toString(16) + ')';
      } else {
        threadName = '(0x' + threadPtr.toString(16) + ')';
      }

      console.log('Thread ' + threadName + ' now: ' + PThread.threadStatusAsString(threadPtr) + '. ');
    }
  },

  updateUi: function updateUi() {
    if (typeof PThread === 'undefined') {
      // Likely running threadprofiler on a singlethreaded build, or not
      // initialized yet, ignore updating.
      return;
    }
    var str = '';
    var mainThread = _emscripten_main_browser_thread_id();

    var threads = [mainThread];
    for (var i in PThread.pthreads) {
      threads.push(PThread.pthreads[i].threadInfoStruct);
    }

    for (var i = 0; i < threads.length; ++i) {
      var threadPtr = threads[i];
      var profilerBlock = Atomics.load(HEAPU32, (threadPtr + 8 /* {{{ C_STRUCTS.pthread.profilerBlock }}}*/) >> 2);
      var threadName = PThread.getThreadName(threadPtr);
      if (threadName) {
        threadName = '"' + threadName + '" (0x' + threadPtr.toString(16) + ')';
      } else {
        threadName = '(0x' + threadPtr.toString(16) + ')';
      }

      str += 'Thread ' + threadName + ' now: ' + PThread.threadStatusAsString(threadPtr) + '. ';

      var threadTimesInStatus = [];
      var totalTime = 0;
      for (var j = 0; j < 7/*EM_THREAD_STATUS_NUMFIELDS*/; ++j) {
        threadTimesInStatus.push(HEAPF64[((profilerBlock + 16/*C_STRUCTS.thread_profiler_block.timeSpentInStatus*/) >> 3) + j]);
        totalTime += threadTimesInStatus[j];
        HEAPF64[((profilerBlock + 16/*C_STRUCTS.thread_profiler_block.timeSpentInStatus*/) >> 3) + j] = 0;
      }
      var recent = '';
      if (threadTimesInStatus[1] > 0) recent += (threadTimesInStatus[1] / totalTime * 100.0).toFixed(1) + '% running. ';
      if (threadTimesInStatus[2] > 0) recent += (threadTimesInStatus[2] / totalTime * 100.0).toFixed(1) + '% sleeping. ';
      if (threadTimesInStatus[3] > 0) recent += (threadTimesInStatus[3] / totalTime * 100.0).toFixed(1) + '% waiting for futex. ';
      if (threadTimesInStatus[4] > 0) recent += (threadTimesInStatus[4] / totalTime * 100.0).toFixed(1) + '% waiting for mutex. ';
      if (threadTimesInStatus[5] > 0) recent += (threadTimesInStatus[5] / totalTime * 100.0).toFixed(1) + '% waiting for proxied ops. ';
      if (recent.length > 0) str += 'Recent activity: ' + recent;
      str += '<br />';
    }
    this.threadProfilerDiv.innerHTML = str;
  }
};

if (typeof Module !== 'undefined') {
  if (typeof document !== 'undefined') {
    emscriptenThreadProfiler.initialize();
  } else if (!ENVIRONMENT_IS_PTHREAD && typeof process !== 'undefined') {
    emscriptenThreadProfiler.initializeNode();
  }
}
