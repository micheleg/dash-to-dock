#!/bin/sh
set -eu

node <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('appIconIndicators.js', 'utf8');
const match = source.match(
    /if \(settings\.showIconsEmblems[\s\S]*?const unityIndicator = new UnityIndicator\(source\);/
);

assert(match, 'Unity indicator creation condition was not found');
assert.match(match[0], /Docking\.DockManager\.getDefault\(\)\.remoteModel/);
console.log('RESULT remote-model-guard ok');
NODE
