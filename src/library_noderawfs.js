/**
 * @license
 * Copyright 2018 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

mergeInto(LibraryManager.library, {
  $NODERAWFS__deps: ['$ERRNO_CODES', '$FS', '$NODEFS', '$mmapAlloc'],
  $NODERAWFS__postset: 'if (ENVIRONMENT_IS_NODE) {' +
    'var _wrapNodeError = function(func) { return function() { try { return func.apply(this, arguments) } catch (e) { if (!e.code) throw e; throw new FS.ErrnoError(ERRNO_CODES[e.code]); } } };' +
    'var VFS = Object.assign({}, FS);' +
    'for (var _key in NODERAWFS) FS[_key] = _wrapNodeError(NODERAWFS[_key]);' +
    '}' +
    'else { throw new Error("NODERAWFS is currently only supported on Node.js environment.") }',
  $NODERAWFS: {
    lookup: function(parent, name) {
      return FS.lookupPath(parent.path + '/' + name).node;
    },
    lookupPath: function(path, opts) {
      opts = opts || {};
      if (opts.parent) {
        path = nodePath.dirname(path);
      }
      var st = fs.lstatSync(path);
      var mode = NODEFS.getMode(path);
      return { path: path, node: { id: st.ino, mode: mode }};
    },
    createStandardStreams: function() {
      FS.streams[0] = { fd: 0, nfd: 0, position: 0, path: '', flags: 0, tty: true, seekable: false };
      for (var i = 1; i < 3; i++) {
        FS.streams[i] = { fd: i, nfd: i, position: 0, path: '', flags: 577, tty: true, seekable: false };
      }
    },
    // generic function for all node creation
    cwd: function() { return process.cwd(); },
    chdir: function() { process.chdir.apply(void 0, arguments); },
    mknod: function(path, mode) {
      if (FS.isDir(path)) {
        fs.mkdirSync(path, mode);
      } else {
        fs.writeFileSync(path, '', { mode: mode });
      }
    },
    mkdir: function() { fs.mkdirSync.apply(void 0, arguments); },
    symlink: function() { fs.symlinkSync.apply(void 0, arguments); },
    rename: function() { fs.renameSync.apply(void 0, arguments); },
    rmdir: function() { fs.rmdirSync.apply(void 0, arguments); },
    readdir: function() { return ['.', '..'].concat(fs.readdirSync.apply(void 0, arguments)); },
    unlink: function() { fs.unlinkSync.apply(void 0, arguments); },
    readlink: function() { return fs.readlinkSync.apply(void 0, arguments); },
    stat: function() { return fs.statSync.apply(void 0, arguments); },
    lstat: function() { return fs.lstatSync.apply(void 0, arguments); },
    chmod: function() { fs.chmodSync.apply(void 0, arguments); },
    fchmod: function() { fs.fchmodSync.apply(void 0, arguments); },
    chown: function() { fs.chownSync.apply(void 0, arguments); },
    fchown: function() { fs.fchownSync.apply(void 0, arguments); },
    truncate: function() { fs.truncateSync.apply(void 0, arguments); },
    ftruncate: function(fd, len) {
      // See https://github.com/nodejs/node/issues/35632
      if (len < 0) {
        throw new FS.ErrnoError({{{ cDefine('EINVAL') }}});
      }
      fs.ftruncateSync.apply(void 0, arguments);
    },
    utime: function() { fs.utimesSync.apply(void 0, arguments); },
    open: function(path, flags, mode, suggestFD) {
      if (typeof flags === "string") {
        flags = VFS.modeStringToFlags(flags)
      }
      var pathTruncated = path.split('/').map(function(s) { return s.substr(0, 255); }).join('/');
      var nfd = fs.openSync(pathTruncated, NODEFS.flagsForNode(flags), mode);
      var st = fs.fstatSync(nfd);
      if (flags & {{{ cDefine('O_DIRECTORY') }}} && !st.isDirectory()) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
      }
      var newMode = NODEFS.getMode(pathTruncated);
      var fd = suggestFD != null ? suggestFD : FS.nextfd(nfd);
      var stream = { fd: fd, nfd: nfd, position: 0, path: path, id: st.ino, flags: flags, mode: newMode, node_ops: NODERAWFS, seekable: true };
      FS.streams[fd] = stream;
      return stream;
    },
    close: function(stream) {
      if (!stream.stream_ops) {
        // this stream is created by in-memory filesystem
        fs.closeSync(stream.nfd);
      }
      FS.closeStream(stream.fd);
    },
    llseek: function(stream, offset, whence) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.llseek(stream, offset, whence);
      }
      var position = offset;
      if (whence === {{{ cDefine('SEEK_CUR') }}}) {
        position += stream.position;
      } else if (whence === {{{ cDefine('SEEK_END') }}}) {
        position += fs.fstatSync(stream.nfd).size;
      } else if (whence !== {{{ cDefine('SEEK_SET') }}}) {
        throw new FS.ErrnoError({{{ cDefine('EINVAL') }}});
      }

      if (position < 0) {
        throw new FS.ErrnoError({{{ cDefine('EINVAL') }}});
      }
      stream.position = position;
      return position;
    },
    read: function(stream, buffer, offset, length, position) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.read(stream, buffer, offset, length, position);
      }
      var seeking = typeof position !== 'undefined';
      if (!seeking && stream.seekable) position = stream.position;
      var bytesRead = fs.readSync(stream.nfd, Buffer.from(buffer.buffer), offset, length, position);
      // update position marker when non-seeking
      if (!seeking) stream.position += bytesRead;
      return bytesRead;
    },
    write: function(stream, buffer, offset, length, position) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.write(stream, buffer, offset, length, position);
      }
      if (stream.flags & +"{{{ cDefine('O_APPEND') }}}") {
        // seek to the end before writing in append mode
        FS.llseek(stream, 0, +"{{{ cDefine('SEEK_END') }}}");
      }
      var seeking = typeof position !== 'undefined';
      if (!seeking && stream.seekable) position = stream.position;
      var bytesWritten = fs.writeSync(stream.nfd, Buffer.from(buffer.buffer), offset, length, position);
      // update position marker when non-seeking
      if (!seeking) stream.position += bytesWritten;
      return bytesWritten;
    },
    allocate: function() {
      throw new FS.ErrnoError({{{ cDefine('EOPNOTSUPP') }}});
    },
    mmap: function(stream, address, length, position, prot, flags) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.mmap(stream, address, length, position, prot, flags);
      }
      if (address !== 0) {
        // We don't currently support location hints for the address of the mapping
        throw new FS.ErrnoError({{{ cDefine('EINVAL') }}});
      }

      var ptr = mmapAlloc(length);
      FS.read(stream, HEAP8, ptr, length, position);
      return { ptr: ptr, allocated: true };
    },
    msync: function(stream, buffer, offset, length, mmapFlags) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.msync(stream, buffer, offset, length, mmapFlags);
      }
      if (mmapFlags & {{{ cDefine('MAP_PRIVATE') }}}) {
        // MAP_PRIVATE calls need not to be synced back to underlying fs
        return 0;
      }

      FS.write(stream, buffer, 0, length, offset);
      return 0;
    },
    munmap: function() {
      return 0;
    },
    ioctl: function() {
      throw new FS.ErrnoError({{{ cDefine('ENOTTY') }}});
    }
  }
});
