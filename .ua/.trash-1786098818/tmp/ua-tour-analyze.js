#!/usr/bin/env node
'use strict';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) fail('Usage: ua-tour-analyze.js <input.json> <output.json>');

const fs = require('fs');
const path = require('path');

let data;
try {
  data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
} catch (e) {
  fail('Failed to read/parse input JSON: ' + e.message);
}

const nodes = Array.isArray(data.nodes) ? data.nodes : fail('input missing nodes[]');
const edges = Array.isArray(data.edges) ? data.edges : fail('input missing edges[]');
const layers = Array.isArray(data.layers) ? data.layers : [];

const nodeById = new Map();
for (const n of nodes) nodeById.set(n.id, n);

// A/B: fan-in / fan-out
const fanIn = new Map();
const fanOut = new Map();
for (const n of nodes) { fanIn.set(n.id, 0); fanOut.set(n.id, 0); }
for (const e of edges) {
  if (nodeById.has(e.source)) fanOut.set(e.source, (fanOut.get(e.source) || 0) + 1);
  if (nodeById.has(e.target)) fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
}

const fanInRanking = [...fanIn.entries()]
  .map(([id, count]) => ({ id, fanIn: count, name: nodeById.get(id)?.name }))
  .sort((a, b) => b.fanIn - a.fanIn)
  .slice(0, 20);

const fanOutRanking = [...fanOut.entries()]
  .map(([id, count]) => ({ id, fanOut: count, name: nodeById.get(id)?.name }))
  .sort((a, b) => b.fanOut - a.fanOut)
  .slice(0, 20);

// C: entry point candidates
const ENTRY_FILENAMES = new Set([
  'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js',
  'mod.rs', 'main.go', 'main.py', 'main.rs', 'manage.py', 'app.py', 'wsgi.py', 'asgi.py',
  'run.py', '__main__.py', 'Application.java', 'Main.java', 'Program.cs', 'config.ru',
  'index.php', 'App.swift', 'Application.kt', 'main.cpp', 'main.c'
]);

const fanOutValues = [...fanOut.values()].sort((a, b) => a - b);
const fanInValues = [...fanIn.values()].sort((a, b) => a - b);
function percentileThreshold(sortedArr, percentileFromTop) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.max(0, Math.floor(sortedArr.length * (1 - percentileFromTop)));
  return sortedArr[idx];
}
const fanOutTop10Threshold = percentileThreshold(fanOutValues, 0.10);
const fanInBottom25Threshold = sortedPercentileBottom(fanInValues, 0.25);
function sortedPercentileBottom(sortedArr, frac) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * frac));
  return sortedArr[idx];
}

function isRootOrOneLevelDeep(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/^\.\//, '');
  const depth = normalized.split('/').filter(Boolean).length;
  return depth <= 2;
}

const entryScored = [];
for (const n of nodes) {
  let score = 0;
  const fp = n.filePath || '';
  const base = path.basename(fp || n.name || '');

  if (n.type === 'document') {
    const isRoot = fp && !fp.includes('/');
    if (/^readme\.md$/i.test(base) && isRoot) {
      score += 5;
    } else if (/\.md$/i.test(base) && isRoot) {
      score += 2;
    }
  } else {
    if (ENTRY_FILENAMES.has(base)) score += 3;
    if (isRootOrOneLevelDeep(fp)) score += 1;
    if ((fanOut.get(n.id) || 0) >= fanOutTop10Threshold && fanOutTop10Threshold > 0) score += 1;
    if ((fanIn.get(n.id) || 0) <= fanInBottom25Threshold) score += 1;
  }

  if (score > 0) entryScored.push({ id: n.id, score, name: n.name, summary: n.summary });
}
entryScored.sort((a, b) => b.score - a.score);
const entryPointCandidates = entryScored.slice(0, 5);

// D: BFS from top code (non-document) entry point
const topCodeEntry = entryScored.find(c => {
  const n = nodeById.get(c.id);
  return n && n.type !== 'document';
});

const adjacency = new Map();
for (const n of nodes) adjacency.set(n.id, []);
for (const e of edges) {
  if ((e.type === 'imports' || e.type === 'calls') && nodeById.has(e.source) && nodeById.has(e.target)) {
    adjacency.get(e.source).push(e.target);
  }
}

let bfsTraversal = { startNode: null, order: [], depthMap: {}, byDepth: {} };
if (topCodeEntry) {
  const start = topCodeEntry.id;
  const visited = new Set([start]);
  const order = [start];
  const depthMap = { [start]: 0 };
  const queue = [start];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const d = depthMap[cur];
    for (const next of adjacency.get(cur) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        depthMap[next] = d + 1;
        order.push(next);
        queue.push(next);
      }
    }
  }
  const byDepth = {};
  for (const [id, d] of Object.entries(depthMap)) {
    byDepth[d] = byDepth[d] || [];
    byDepth[d].push(id);
  }
  bfsTraversal = { startNode: start, order, depthMap, byDepth };
}

// E: non-code file inventory
const nonCodeFiles = { documentation: [], infrastructure: [], data: [], config: [] };
for (const n of nodes) {
  const entry = { id: n.id, name: n.name, type: n.type, summary: n.summary };
  if (n.type === 'document') nonCodeFiles.documentation.push(entry);
  else if (['service', 'pipeline', 'resource'].includes(n.type)) nonCodeFiles.infrastructure.push(entry);
  else if (['table', 'schema', 'endpoint'].includes(n.type)) nonCodeFiles.data.push(entry);
  else if (n.type === 'config') nonCodeFiles.config.push(entry);
}

// F: tightly coupled clusters
const directed = new Set();
for (const e of edges) {
  if ((e.type === 'imports' || e.type === 'calls') && nodeById.has(e.source) && nodeById.has(e.target)) {
    directed.add(e.source + '=>' + e.target);
  }
}
const bidirectionalPairs = [];
for (const key of directed) {
  const [a, b] = key.split('=>');
  if (a < b && directed.has(b + '=>' + a)) {
    bidirectionalPairs.push([a, b]);
  }
}

// union-find to seed clusters from bidirectional pairs
const parent = new Map();
function find(x) {
  if (!parent.has(x)) parent.set(x, x);
  let root = x;
  while (parent.get(root) !== root) root = parent.get(root);
  let cur = x;
  while (parent.get(cur) !== cur) {
    const next = parent.get(cur);
    parent.set(cur, root);
    cur = next;
  }
  return root;
}
function union(a, b) {
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}
for (const [a, b] of bidirectionalPairs) union(a, b);

const groups = new Map();
for (const [a, b] of bidirectionalPairs) {
  for (const n of [a, b]) {
    const root = find(n);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(n);
  }
}

// expand: add nodes connecting to 2+ existing cluster members (either direction), cap size 5
const allEdgesUndirectedCount = new Map(); // nodeId -> Map(clusterRoot -> count) computed per cluster
function countConnections(nodeId, clusterSet) {
  let count = 0;
  for (const e of edges) {
    if (e.source === nodeId && clusterSet.has(e.target)) count++;
    if (e.target === nodeId && clusterSet.has(e.source)) count++;
  }
  return count;
}

const clusterList = [];
for (const [root, memberSet] of groups) {
  let members = new Set(memberSet);
  if (members.size < 2) continue;
  // try expansion up to size 5
  let changed = true;
  while (changed && members.size < 5) {
    changed = false;
    for (const n of nodeById.keys()) {
      if (members.has(n)) continue;
      if (members.size >= 5) break;
      const conn = countConnections(n, members);
      if (conn >= 2) {
        members.add(n);
        changed = true;
      }
    }
  }
  const memberArr = [...members].slice(0, 5);
  let edgeCount = 0;
  for (const e of edges) {
    if (memberArr.includes(e.source) && memberArr.includes(e.target)) edgeCount++;
  }
  clusterList.push({ nodes: memberArr, edgeCount });
}
clusterList.sort((a, b) => b.edgeCount - a.edgeCount);
// dedupe clusters with identical node sets
const seenSets = new Set();
const clusters = [];
for (const c of clusterList) {
  const key = [...c.nodes].sort().join('|');
  if (seenSets.has(key)) continue;
  seenSets.add(key);
  clusters.push(c);
  if (clusters.length >= 10) break;
}

// G: layers
const layersOut = { count: layers.length, list: layers.map(l => ({ id: l.id, name: l.name, description: l.description })) };

// H: node summary index
const nodeSummaryIndex = {};
for (const n of nodes) {
  nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary };
}

const result = {
  scriptCompleted: true,
  entryPointCandidates,
  fanInRanking,
  fanOutRanking,
  bfsTraversal,
  nonCodeFiles,
  clusters,
  layers: layersOut,
  nodeSummaryIndex,
  totalNodes: nodes.length,
  totalEdges: edges.length,
};

try {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
} catch (e) {
  fail('Failed to write output: ' + e.message);
}

process.exit(0);
