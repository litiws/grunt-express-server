/*
 * grunt-express-server
 * https://github.com/ericclemmons/grunt-express-server
 *
 * Copyright (c) 2013 Eric Clemmons
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt, target) {
  if (!process._servers) {
    process._servers = {};
  }

  var backup  = null;
  var done    = null;
  var server  = process._servers[target]; // Store server between live reloads to close/restart express

  var finished = function() {
    if (done) {
      done();

      done = null;
    }
  };

  return {
    start: function(options) {
      if (server) {
        this.stop();

        if (grunt.task.current.flags.stop) {
          finished();

          return;
        }
      }

      backup = JSON.parse(JSON.stringify(process.env)); // Clone process.env

      // For some weird reason, on Windows the process.env stringify produces a "Path"
      // member instead of a "PATH" member, and grunt chokes when it can't find PATH.
      if (!backup.PATH) {
        if (backup.Path) {
          backup.PATH = backup.Path;
          delete backup.Path;
        }
      }

      grunt.log.writeln('Starting '.cyan + (options.background ? 'background' : 'foreground') + ' Express server');

      done = grunt.task.current.async();

      // Set PORT for new processes
      process.env.PORT = options.port;

      // Set NODE_ENV for new processes
      if (options.node_env) {
        process.env.NODE_ENV = options.node_env;
      }

      // Set debug mode for node-inspector
      if(options.debug) {
        options.args.unshift('--debug');
      }

      if (options.background) {
        server = process._servers[target] = grunt.util.spawn({
          cmd:      options.cmd,
          args:     options.args,
          env:      process.env,
          fallback: options.fallback
        }, finished);

        if (options.delay) {
          setTimeout(finished, options.delay);
        }

        if (options.output) {
          server.stdout.on('data', function(data) {
            var message = "" + data;
            var regex = new RegExp(options.output, "gi");
            if (message.match(regex)) {
              finished();
            }
          });
        }

        server.stdout.pipe(process.stdout);
        server.stderr.pipe(process.stderr);
      } else {
        // Server is ran in current process
        server = process._servers[target] = require(options.script);
      }

      process.on('exit', finished);
      process.on('exit', this.stop);
    },

    stop: function() {
      if (server && server.kill) {
        grunt.log.writeln('Stopping'.red + ' Express server');

        // server.kill('SIGTERM');
        killProcessTree(server.pid);
        process.removeAllListeners();
        server = process._servers[target] = null;
      }

      // Restore original process.env
      if (backup) {
        process.env = JSON.parse(JSON.stringify(backup));
      }

      finished();
    }
  };


  /**
   * We support killing a process and its children.
   * It's useful in case the process spawns other processes
   *   for example, node-theseus.
   *
   * Currently we only kill direct descendants (1 level).
   */
  function killChildren(pid) {
    if (process.platform === 'linux' || process.platform === 'darwin') {

      // pgrep -P $pid
      grunt.log.writeln('// TODO: support linux');

    } else if (process.platform.indexOf('win') >= 0) {

      // wmic process where (ParentProcessId=2480) get ProcessId
      grunt.util.spawn({
        cmd: 'wmic',
        args: ['process', 'where', '(ParentProcessId=' + pid + ')', 'get', 'ProcessId']

      }, function(err, result, code) {

        if (err) {
          grunt.log.writeln('Error get children processes ' + result);
          return;
        }

        result.toString().split('\n').forEach(function(line) {
          var i = parseInt(line);
          try {
            if (i) {
              process.kill(i, 'SIGTERM');
            }
          } catch (e) {}
        });
      });

    } else {
      grunt.log.writeln('grunt-express, killChildren: Not supported platform');
    }
  }

  function killProcessTree(pid) {
    try {
      killChildren(pid);
      process.kill(pid, 'SIGTERM');

    } catch (e) {
      grunt.verbose.writeln('Process not found.');
    }
  }
};
