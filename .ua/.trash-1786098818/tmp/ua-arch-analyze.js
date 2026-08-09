#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) fail('Usage: ua-arch-analyze.js <input.json> <output.json>');

let data;
try {
  data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
} catch (e) {
  fail('Failed to read/parse input JSON: ' + e.message);
}

const fileNodes = data.fileNodes || [];
const importEdges = data.importEdges || [];
const allEdges = data.allEdges || [];

if (fileNodes.length === 0) fail('No fileNodes in input');

// ---------- A. Directory Grouping ----------
function dirOf(fp) {
  const idx = fp.lastIndexOf('/');
  return idx === -1 ? '' : fp.substring(0, idx);
}

const filePaths = fileNodes.map((n) => n.filePath || n.name || '');

function commonPrefix(paths) {
  if (paths.length === 0) return '';
  const segLists = paths.map((p) => p.split('/').filter(Boolean));
  const minLen = Math.min(...segLists.map((s) => s.length));
  const prefix = [];
  for (let i = 0; i < minLen; i++) {
    const seg = segLists[0][i];
    if (segLists.every((s) => s[i] === seg)) {
      prefix.push(seg);
    } else {
      break;
    }
  }
  return prefix.length ? prefix.join('/') + '/' : '';
}

const prefix = commonPrefix(filePaths);

function groupKeyFor(fp) {
  let rest = fp;
  if (prefix && rest.startsWith(prefix)) {
    rest = rest.substring(prefix.length);
  }
  const segs = rest.split('/').filter(Boolean);
  if (segs.length <= 1) {
    // flat file directly under prefix (or root) -- classify by extension pattern
    const base = segs[0] || rest;
    if (/\.test\.|\.spec\./.test(base) || /^test_/.test(base) || /_test\.go$/.test(base) || /Test\.java$/.test(base)) return 'test';
    if (/\.config\./.test(base) || /^config\./.test(base)) return 'config';
    return '(root)';
  }
  return segs[0];
}

const directoryGroups = {};
const fileIdToGroup = {};
for (const node of fileNodes) {
  const fp = node.filePath || node.name || '';
  const grp = groupKeyFor(fp);
  if (!directoryGroups[grp]) directoryGroups[grp] = [];
  directoryGroups[grp].push(node.id);
  fileIdToGroup[node.id] = grp;
}

// ---------- B. Node Type Grouping ----------
const nodeTypeGroups = {};
const nodeIdToType = {};
for (const node of fileNodes) {
  const t = node.type || 'file';
  if (!nodeTypeGroups[t]) nodeTypeGroups[t] = [];
  nodeTypeGroups[t].push(node.id);
  nodeIdToType[node.id] = t;
}

// ---------- C. Import Adjacency Matrix ----------
const fileFanOut = {};
const fileFanIn = {};
const groupImportsFrom = {}; // group -> set of groups it imports from
const groupImportedBy = {}; // group -> set of groups that import it

for (const edge of importEdges) {
  fileFanOut[edge.source] = (fileFanOut[edge.source] || 0) + 1;
  fileFanIn[edge.target] = (fileFanIn[edge.target] || 0) + 1;

  const srcGrp = fileIdToGroup[edge.source];
  const tgtGrp = fileIdToGroup[edge.target];
  if (srcGrp && tgtGrp) {
    if (!groupImportsFrom[srcGrp]) groupImportsFrom[srcGrp] = new Set();
    groupImportsFrom[srcGrp].add(tgtGrp);
    if (!groupImportedBy[tgtGrp]) groupImportedBy[tgtGrp] = new Set();
    groupImportedBy[tgtGrp].add(srcGrp);
  }
}

// ---------- D. Cross-Category Dependency Analysis ----------
const crossCategoryMap = {};
for (const edge of allEdges) {
  const fromType = nodeIdToType[edge.source];
  const toType = nodeIdToType[edge.target];
  if (!fromType || !toType) continue;
  if (fromType === toType) continue; // focus on cross-category
  const key = fromType + '|' + toType + '|' + edge.type;
  crossCategoryMap[key] = (crossCategoryMap[key] || 0) + 1;
}
const crossCategoryEdges = Object.entries(crossCategoryMap).map(([key, count]) => {
  const [fromType, toType, edgeType] = key.split('|');
  return { fromType, toType, edgeType, count };
});

// ---------- E. Inter-Group Import Frequency ----------
const interGroupMap = {};
for (const edge of importEdges) {
  const srcGrp = fileIdToGroup[edge.source];
  const tgtGrp = fileIdToGroup[edge.target];
  if (!srcGrp || !tgtGrp || srcGrp === tgtGrp) continue;
  const key = srcGrp + '|' + tgtGrp;
  interGroupMap[key] = (interGroupMap[key] || 0) + 1;
}
const interGroupImports = Object.entries(interGroupMap)
  .map(([key, count]) => {
    const [from, to] = key.split('|');
    return { from, to, count };
  })
  .sort((a, b) => b.count - a.count);

// ---------- F. Intra-Group Import Density ----------
const intraGroupDensity = {};
for (const grp of Object.keys(directoryGroups)) {
  intraGroupDensity[grp] = { internalEdges: 0, totalEdges: 0, density: 0 };
}
for (const edge of importEdges) {
  const srcGrp = fileIdToGroup[edge.source];
  const tgtGrp = fileIdToGroup[edge.target];
  if (srcGrp && intraGroupDensity[srcGrp]) {
    intraGroupDensity[srcGrp].totalEdges++;
    if (srcGrp === tgtGrp) intraGroupDensity[srcGrp].internalEdges++;
  }
  if (tgtGrp && tgtGrp !== srcGrp && intraGroupDensity[tgtGrp]) {
    intraGroupDensity[tgtGrp].totalEdges++;
  }
}
for (const grp of Object.keys(intraGroupDensity)) {
  const d = intraGroupDensity[grp];
  d.density = d.totalEdges > 0 ? d.internalEdges / d.totalEdges : 0;
}

// ---------- G. Directory Pattern Matching ----------
const DIR_PATTERNS = [
  [['routes', 'api', 'controllers', 'endpoints', 'handlers'], 'api'],
  [['services', 'core', 'lib', 'domain', 'logic'], 'service'],
  [['models', 'db', 'data', 'persistence', 'repository', 'entities'], 'data'],
  [['components', 'views', 'pages', 'ui', 'layouts', 'screens'], 'ui'],
  [['middleware', 'plugins', 'interceptors', 'guards'], 'middleware'],
  [['utils', 'helpers', 'common', 'shared', 'tools'], 'utility'],
  [['config', 'constants', 'env', 'settings'], 'config'],
  [['__tests__', 'test', 'tests', 'spec', 'specs'], 'test'],
  [['types', 'interfaces', 'schemas', 'contracts', 'dtos'], 'types'],
  [['hooks'], 'hooks'],
  [['store', 'state', 'reducers', 'actions', 'slices'], 'state'],
  [['assets', 'static', 'public'], 'assets'],
  [['migrations'], 'data'],
  [['management', 'commands'], 'config'],
  [['templatetags'], 'utility'],
  [['signals'], 'service'],
  [['serializers'], 'api'],
  [['cmd'], 'entry'],
  [['internal'], 'service'],
  [['pkg'], 'utility'],
  [['dto', 'request', 'response'], 'types'],
  [['entity'], 'data'],
  [['controller'], 'api'],
  [['routers'], 'api'],
  [['composables'], 'service'],
  [['blueprints'], 'api'],
  [['mailers', 'jobs', 'channels'], 'service'],
  [['bin'], 'entry'],
  [['docs', 'documentation', 'wiki'], 'documentation'],
  [['deploy', 'deployment', 'infra', 'infrastructure'], 'infrastructure'],
  [['.github', '.gitlab', '.circleci'], 'ci-cd'],
  [['k8s', 'kubernetes', 'helm', 'charts'], 'infrastructure'],
  [['terraform', 'tf'], 'infrastructure'],
  [['docker'], 'infrastructure'],
  [['sql', 'database', 'schema'], 'data'],
];

function matchDirPattern(dirName) {
  const lower = dirName.toLowerCase();
  for (const [names, label] of DIR_PATTERNS) {
    if (names.includes(lower)) return label;
  }
  return null;
}

const patternMatches = {};
for (const grp of Object.keys(directoryGroups)) {
  const m = matchDirPattern(grp);
  if (m) patternMatches[grp] = m;
}

// ---------- H. Deployment Topology Detection ----------
const infraFiles = [];
let hasDockerfile = false;
let hasCompose = false;
let hasK8s = false;
let hasTerraform = false;
let hasCI = false;

for (const fp of filePaths) {
  const base = path.basename(fp);
  if (/^Dockerfile/.test(base)) {
    hasDockerfile = true;
    infraFiles.push(fp);
  } else if (/^docker-compose/.test(base)) {
    hasCompose = true;
    infraFiles.push(fp);
  } else if (/\.tf$|\.tfvars$/.test(base)) {
    hasTerraform = true;
    infraFiles.push(fp);
  } else if (/\/(k8s|kubernetes|helm)\//.test(fp)) {
    hasK8s = true;
    infraFiles.push(fp);
  } else if (/\.github\/workflows\//.test(fp) || /^\.gitlab-ci\.yml$/.test(base) || /^Jenkinsfile$/.test(base)) {
    hasCI = true;
    infraFiles.push(fp);
  } else if (/^Makefile$/.test(base)) {
    infraFiles.push(fp);
  }
}

const deploymentTopology = {
  hasDockerfile,
  hasCompose,
  hasK8s,
  hasTerraform,
  hasCI,
  infraFiles,
};

// ---------- I. Data Pipeline Detection ----------
const schemaFiles = [];
const migrationFiles = [];
const dataModelFiles = [];
const apiHandlerFiles = [];

for (const node of fileNodes) {
  const fp = node.filePath || '';
  const tags = node.tags || [];
  if (/\.sql$/.test(fp) || /\.graphql$/.test(fp) || /\.proto$/.test(fp)) schemaFiles.push(fp);
  if (/migrations?\//.test(fp)) migrationFiles.push(fp);
  if (/\/models\//.test(fp) || tags.includes('data-model')) dataModelFiles.push(fp);
  if (/\/(routes|routers|api|controllers|endpoints)\//.test(fp) || tags.includes('api-handler')) apiHandlerFiles.push(fp);
}

const dataPipeline = { schemaFiles, migrationFiles, dataModelFiles, apiHandlerFiles };

// ---------- J. Documentation Coverage ----------
const docFilePaths = filePaths.filter((fp) => /\.(md|rst)$/i.test(fp));
let groupsWithDocs = 0;
const undocumentedGroups = [];
for (const grp of Object.keys(directoryGroups)) {
  const hasDoc = docFilePaths.some((fp) => dirOf(fp) === grp || dirOf(fp).startsWith(grp + '/') || fp.toLowerCase().includes(grp.toLowerCase() + '/readme'));
  // also check if a README exists directly inside the group's directory
  const groupHasOwnReadme = directoryGroups[grp].some((id) => {
    const n = fileNodes.find((x) => x.id === id);
    return n && /readme/i.test(n.name || '');
  });
  if (hasDoc || groupHasOwnReadme) {
    groupsWithDocs++;
  } else {
    undocumentedGroups.push(grp);
  }
}
const totalGroups = Object.keys(directoryGroups).length;
const docCoverage = {
  groupsWithDocs,
  totalGroups,
  coverageRatio: totalGroups > 0 ? Number((groupsWithDocs / totalGroups).toFixed(2)) : 0,
  undocumentedGroups,
};

// ---------- K. Dependency Direction ----------
const dependencyDirection = [];
const seenPairs = new Set();
for (const { from, to, count } of interGroupImports) {
  const pairKey = [from, to].sort().join('|');
  if (seenPairs.has(pairKey)) continue;
  seenPairs.add(pairKey);
  const reverseCount = interGroupMap[to + '|' + from] || 0;
  if (count > reverseCount) {
    dependencyDirection.push({ dependent: from, dependsOn: to });
  } else if (reverseCount > count) {
    dependencyDirection.push({ dependent: to, dependsOn: from });
  }
}

// ---------- fileStats ----------
const filesPerGroup = {};
for (const grp of Object.keys(directoryGroups)) filesPerGroup[grp] = directoryGroups[grp].length;
const nodeTypeCounts = {};
for (const t of Object.keys(nodeTypeGroups)) nodeTypeCounts[t] = nodeTypeGroups[t].length;

const fileStats = {
  totalFileNodes: fileNodes.length,
  filesPerGroup,
  nodeTypeCounts,
};

// serialize Set-based structures for interGroup import group adjacency (not strictly required in output schema, skip raw sets)

const results = {
  scriptCompleted: true,
  directoryGroups,
  nodeTypeGroups,
  crossCategoryEdges,
  interGroupImports,
  intraGroupDensity,
  patternMatches,
  deploymentTopology,
  dataPipeline,
  docCoverage,
  dependencyDirection,
  fileStats,
  fileFanIn,
  fileFanOut,
};

try {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
} catch (e) {
  fail('Failed to write output JSON: ' + e.message);
}

console.log('Analysis complete. Wrote results to ' + outPath);
process.exit(0);
