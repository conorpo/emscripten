/*
 * Copyright 2021 The Emscripten Authors.  All rights reserved.
 * Emscripten is available under two separate licenses, the MIT license and the
 * University of Illinois/NCSA Open Source License.  Both these licenses can be
 * found in the LICENSE file.
 */

#include <assert.h>
#include <string.h>
#include "pthread_impl.h"
#include "emscripten/threading.h"
// Included for emscripten_builtin_free / emscripten_builtin_malloc
// TODO(sbc): Should these be in their own header to avoid emmalloc here?
#include "emscripten/emmalloc.h"

#ifndef NDEBUG

void _emscripten_create_profiler_block(pthread_t thread) {
  assert(thread);
  thread->profilerBlock = emscripten_builtin_malloc(sizeof(thread_profiler_block));
  memset(thread->profilerBlock, 0, sizeof(thread_profiler_block));
  thread->profilerBlock->currentStatusStartTime = emscripten_get_now();
}

// Sets the current thread status, but only if it was in the given expected
// state before. This is used to allow high-level control flow "override" the
// thread status before low-level (futex wait) operations set it.
static void set_status_conditional(int expectedStatus, int newStatus) {
  pthread_t thread = pthread_self();
  int prevStatus = thread->profilerBlock->threadStatus;

  if (prevStatus != newStatus && (prevStatus == expectedStatus || expectedStatus == -1)) {
    double now = emscripten_get_now();
    double startState = thread->profilerBlock->currentStatusStartTime;
    double duration = now - startState;

    thread->profilerBlock->timeSpentInStatus[prevStatus] += duration;
    thread->profilerBlock->threadStatus = newStatus;
    thread->profilerBlock->currentStatusStartTime = now;
  }
}

void emscripten_conditional_set_current_thread_status(int expectedStatus, int newStatus) {
  set_status_conditional(expectedStatus, newStatus);
}

void emscripten_set_current_thread_status(int newStatus) {
  set_status_conditional(-1, newStatus);
}

void emscripten_set_thread_name(pthread_t thread, const char* name) {
  if (thread->profilerBlock) {
    strncpy(thread->profilerBlock->name, name, EM_THREAD_NAME_MAX-1);
  }
}

#endif
