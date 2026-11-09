#!/usr/bin/env node
/**
 * 质量门禁审计（零依赖，只用 node: 内建）。
 *
 * 只查「写错了不会报错、只会静默漂移」的那一类不变量：
 *   1. bundle 清单：package.json 的 dsh.bundle.patch 指向的文件真实存在
 *   2. 身份字符串：package.json name ↔ cordis.patch.yml name ↔ client.js 模块 id 三处一致
 *   3. 语法检查覆盖：src/、test/ 与 tools/ 下每个 .js 都出现在 npm run check 里
 *   4. 测试发现：test/ 下每个 *.test.js 都会被 npm test 跑到
 *   5. 双语 README：两版二级标题数量一致，且「相关文档」链接逐条对应
 *   6. RPC 契约表：双语 README 列出的方法与 src/host/rpc.js 的 case 完全一致
 *   7. 文档清单：docs/adr/*.md 全部出现在 README 的相关文档里
 *   8. 配图成套：assets/readme 下四张图都有 .en.svg、两张 2 倍 PNG，且 PNG 被对应 README 引用
 *   9. 配图版本号：structure 图里的版本号与 package.json 一致
 *  10. 配图测试数：structure 图里的测试文件数量与磁盘一致
 *  11. 配图 ADR 数：structure 图里的架构决策记录数量与 docs/adr 一致
 *  12. README 配图：<img> 引用的文件都存在
 *
 * 运行：node tools/ci-audit.mjs
 * 退出码：0 = 全部通过，1 = 有不变量被破坏（逐条打印原因）
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const exists = (path) => existsSync(join(ROOT, path))
const fail = (rule, message) => failures.push(`[${rule}] ${message}`)

/** 把一段脚本里所有 `node --check <file>` 的文件名取出来。 */
function parseCheckedFiles(script) {
  return [...script.matchAll(/node --check\s+([^\s&]+)/g)].map((match) => match[1].replace(/^\.\//, ''))
}

/** 递归列出目录下的 .js 文件（相对仓库根，正斜杠）。 */
function listJsFiles(dir) {
  const absolute = join(ROOT, dir)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`
    if (entry.isDirectory()) return listJsFiles(relative)
    return entry.name.endsWith('.js') ? [relative] : []
  })
}

/** 取 Markdown 里某个文件名所在表格行中反引号包起来的名字。 */
function rpcNamesFromReadme(path) {
  const line = read(path)
    .split(/\r?\n/)
    .find((candidate) => candidate.includes('`src/host/rpc.js`'))
  if (!line) return null
  const cell = line.split('|')[2] ?? ''
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
}

/** 取「相关文档」小节里的链接目标。两版互指的那条（README.md ↔ README.en.md）是镜像，不参与逐条比对。 */
function relatedDocLinks(path) {
  const text = read(path)
  const section = text.split(/^## /m).find((chunk) => chunk.startsWith('相关文档') || chunk.startsWith('Related documents'))
  if (!section) return []
  return [...section.matchAll(/\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => target !== 'README.md' && target !== 'README.en.md')
}

// ── 1. bundle 清单 ────────────────────────────────────────────────
let pkg
try {
  pkg = JSON.parse(read('package.json'))
} catch (error) {
  fail('manifest', `package.json 不是合法 JSON：${error.message}`)
}

if (pkg) {
  if (!pkg.name) fail('manifest', 'package.json 缺少 name')
  const patchPath = pkg.dsh?.bundle?.patch
  if (!patchPath) {
    fail('manifest', 'package.json 缺少 dsh.bundle.patch，DSH 不会把本包装成 bundle')
  } else if (!exists(patchPath)) {
    fail('manifest', `dsh.bundle.patch 指向的 ${patchPath} 不存在`)
  }
  if (!pkg.dsh?.client) fail('manifest', 'package.json 缺少 dsh.client，Web 端不会加载 Client 半')
  for (const path of pkg.files ?? []) {
    if (path.includes('*')) continue
    if (!exists(path)) fail('manifest', `files 里声明的 ${path} 不存在`)
  }
}

// ── 2. 身份字符串三处一致 ─────────────────────────────────────────
if (pkg?.name) {
  const patchRaw = exists('cordis.patch.yml') ? read('cordis.patch.yml') : ''
  const patchName = /name:\s*['"]?([^'"\s]+)['"]?/.exec(patchRaw)?.[1]
  const clientRaw = read('client.js')
  const moduleId = /__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/.exec(clientRaw)?.[1]

  if (!patchName) fail('identity', 'cordis.patch.yml 里找不到 name')
  else if (patchName !== pkg.name) fail('identity', `cordis.patch.yml 的 name（${patchName}）与 package.json 的 name（${pkg.name}）不一致`)
  if (!moduleId) fail('identity', 'client.js 里找不到 __ModuleLoader__.load 的 id')
  else if (moduleId !== pkg.name) fail('identity', `client.js 的模块 id（${moduleId}）与 package.json 的 name（${pkg.name}）不一致`)
}

// ── 3. 语法检查覆盖 ───────────────────────────────────────────────
if (pkg?.scripts?.check) {
  const checked = new Set(parseCheckedFiles(pkg.scripts.check))
  const required = ['index.js', 'client.js', ...listJsFiles('src'), ...listJsFiles('test'), ...listJsFiles('tools')]
  for (const file of required) {
    if (!checked.has(file)) fail('syntax-coverage', `${file} 没有被 npm run check 覆盖`)
  }
}

// ── 4. 测试发现 ───────────────────────────────────────────────────
const testFiles = exists('test')
  ? readdirSync(join(ROOT, 'test'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
      .map((entry) => entry.name)
      .sort()
  : []

if (pkg?.scripts?.test) {
  const script = pkg.scripts.test
  for (const file of testFiles) {
    if (!script.includes(file) && !script.includes('test/*.test.js')) {
      fail('test-discovery', `test/${file} 不会被 npm test 跑到（手写清单漏了它）`)
    }
  }
}

// ── 5. 双语 README 对应 ───────────────────────────────────────────
const zhHeadings = [...read('README.md').matchAll(/^## .+$/gm)].map((match) => match[0])
const enHeadings = [...read('README.en.md').matchAll(/^## .+$/gm)].map((match) => match[0])
if (zhHeadings.length !== enHeadings.length) {
  fail('readme-pair', `README.md 有 ${zhHeadings.length} 个二级标题，README.en.md 有 ${enHeadings.length} 个，两版小节数量不一致`)
}

const zhLinks = relatedDocLinks('README.md')
const enLinks = relatedDocLinks('README.en.md')
if (zhLinks.length !== enLinks.length) {
  fail('readme-pair', `README 相关文档链接数不一致：中文 ${zhLinks.length} 条，英文 ${enLinks.length} 条`)
} else {
  zhLinks.forEach((link, index) => {
    if (link !== enLinks[index]) fail('readme-pair', `相关文档第 ${index + 1} 条链接不一致：${link} vs ${enLinks[index]}`)
  })
}

// ── 6. RPC 契约表 ─────────────────────────────────────────────────
const rpcCases = [...read('src/host/rpc.js').matchAll(/case\s+'([^']+)'/g)].map((match) => match[1])
for (const readme of ['README.md', 'README.en.md']) {
  const listed = rpcNamesFromReadme(readme)
  if (!listed) {
    fail('rpc-table', `${readme} 里找不到 \`src/host/rpc.js\` 那一行`)
    continue
  }
  const missing = rpcCases.filter((name) => !listed.includes(name))
  const extra = listed.filter((name) => !rpcCases.includes(name))
  if (missing.length) fail('rpc-table', `${readme} 的 RPC 表缺少：${missing.join('、')}`)
  if (extra.length) fail('rpc-table', `${readme} 的 RPC 表多出：${extra.join('、')}`)
}

// ── 7. ADR 清单 ───────────────────────────────────────────────────
const adrFiles = exists('docs/adr')
  ? readdirSync(join(ROOT, 'docs/adr')).filter((name) => name.endsWith('.md')).sort()
  : []
const readmeRaw = read('README.md')
for (const file of adrFiles) {
  if (!readmeRaw.includes(file)) fail('adr-list', `docs/adr/${file} 没有出现在 README.md 的相关文档里`)
}

// ── 8. 配图成套 ───────────────────────────────────────────────────
const readmeAssets = exists('assets/readme')
  ? readdirSync(join(ROOT, 'assets/readme')).filter((name) => name.endsWith('.svg') && !name.endsWith('.en.svg'))
  : []
for (const asset of readmeAssets) {
  const english = asset.replace(/\.svg$/, '.en.svg')
  if (!exists(`assets/readme/${english}`)) fail('assets-pair', `assets/readme/${asset} 缺少英文版 ${english}`)
  const exports = [
    [asset.replace(/\.svg$/, '.png'), 'README.md'],
    [asset.replace(/\.svg$/, '.en.png'), 'README.en.md'],
  ]
  for (const [exportName, readme] of exports) {
    if (!exists(`assets/readme/${exportName}`)) {
      fail('assets-pair', `assets/readme/${asset} 缺少 2 倍位图 ${exportName}（插件市场只认位图，SVG 会被丢弃）`)
    } else if (!read(readme).includes(exportName)) {
      fail('assets-pair', `assets/readme/${exportName} 没有被 ${readme} 引用，插件市场抓不到它`)
    }
  }
}

// ── 9 & 10. 配图里的写死事实 ──────────────────────────────────────
if (pkg?.version) {
  for (const svg of ['assets/readme/structure.svg', 'assets/readme/structure.en.svg']) {
    if (!read(svg).includes(`v${pkg.version}`)) {
      fail('asset-version', `${svg} 里的版本号不是 v${pkg.version}（package.json 已改动，配图没跟上）`)
    }
  }
}
for (const [svg, template] of [
  ['assets/readme/structure.svg', `${testFiles.length} 个 node:test 测试文件`],
  ['assets/readme/structure.en.svg', `${testFiles.length} node:test files`],
]) {
  if (!read(svg).includes(template)) {
    fail('asset-test-count', `${svg} 里的测试文件数量不是 ${testFiles.length}（磁盘上测试文件已增减，配图没跟上）`)
  }
}
for (const [svg, template] of [
  ['assets/readme/structure.svg', `${adrFiles.length} 篇架构决策记录`],
  ['assets/readme/structure.en.svg', `${adrFiles.length} decision records`],
]) {
  if (!read(svg).includes(template)) {
    fail('asset-adr-count', `${svg} 里的 ADR 数量不是 ${adrFiles.length}（docs/adr 已增减，配图没跟上）`)
  }
}

// ── 12. README 引用的配图都存在 ───────────────────────────────────
for (const readme of ['README.md', 'README.en.md']) {
  const sources = [...read(readme).matchAll(/<img\s+src="([^"]+)"/g)].map((match) => match[1])
  if (sources.length === 0) fail('readme-images', `${readme} 里没有任何 <img> 配图`)
  for (const source of sources) {
    const path = source.replace(/^\.\//, '')
    if (!exists(path)) fail('readme-images', `${readme} 引用的 ${source} 不存在`)
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────
const rules = [
  'manifest', 'identity', 'syntax-coverage', 'test-discovery',
  'readme-pair', 'rpc-table', 'adr-list', 'assets-pair',
  'asset-version', 'asset-test-count', 'asset-adr-count', 'readme-images',
]

if (failures.length === 0) {
  console.log(`✔ 质量门禁审计通过：${rules.length} 类不变量、${testFiles.length} 个测试文件、${adrFiles.length} 篇 ADR。`)
  process.exit(0)
}

console.error(`✖ 质量门禁审计失败：${failures.length} 项\n`)
for (const failure of failures) console.error(`  ${failure}`)
console.error('\n这些不变量都是「错了不会报错、只会静默漂移」的那一类；修好再提交。')
process.exit(1)
