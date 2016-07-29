'use strict';
var concat = require('concat-stream');
var conventionalCommitsFilter = require('conventional-commits-filter');
var conventionalCommitsParser = require('conventional-commits-parser');
var gitLatestSemverTag = require('lerna-git-latest-semver-tag');
var gitRawCommits = require('git-raw-commits');
var objectAssign = require('object-assign');
var curry = require('lodash/curry');

var VERSIONS = ['major', 'minor', 'patch'];

var packageFilter = curry(function (packageName, commit) {
  var body = commit.body;

  if (body == null) {
    return false;
  }

  var match = body.match(/^affects: (.+)$/m);

  if (match == null) {
    return false;
  } else {
    return match[1].split(/,\s+/).indexOf(packageName) !== -1;
  }
})

function conventionalRecommendedBump(options, parserOpts, cb) {
  var config;
  var noop = function() {};

  if (typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }

  if (typeof options.packageName !== 'string') {
    throw new TypeError('options.packageName is required');
  }

  if (typeof parserOpts === 'function') {
    cb = parserOpts;
  } else {
    cb = cb || noop;
  }

  options = objectAssign({
    ignoreReverted: true,
    warn: function() {}
  }, options);

  if (options.preset) {
    try {
      config = require('./presets/' + options.preset);
    } catch (err) {
      cb(new Error('Preset: "' + options.preset + '" does not exist'));
      return;
    }
  } else {
    config = options.config || {};
  }

  var whatBump = options.whatBump || config.whatBump || noop;
  var packageName = options.packageName;
  parserOpts = objectAssign({}, config.parserOpts, parserOpts);
  parserOpts.warn = parserOpts.warn || options.warn;

  gitLatestSemverTag(packageName, function(err, tag) {
    if (err) {
      cb(err);
      return;
    }

    gitRawCommits({
      format: '%B%n-hash-%n%H',
      from: tag
    })
      .pipe(conventionalCommitsParser(parserOpts))
      .pipe(concat(function(data) {
        var commits = options.ignoreReverted ? conventionalCommitsFilter(data) : data;

        // We only want commits that affect this specific package of the lerna repo
        commits = commits.filter(packageFilter(packageName))

        if (!commits || !commits.length) {
          options.warn('No commits since last release');
        }

        var result = whatBump(commits);

        if (typeof result === 'number') {
          result = {
            level: result
          };
        }

        if (result && result.level != null) {
          result.releaseAs = VERSIONS[result.level];
        } else if (result == null) {
          result = {};
        }

        cb(null, result);
      }));
  });
}

module.exports = conventionalRecommendedBump;
