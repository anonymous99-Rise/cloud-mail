#!/usr/bin/env node
/**
 * Hope Mail 版本发布脚本
 *
 * 用法：node scripts/release.js [patch|minor|major]   （默认 patch）
 *       node scripts/release.js 3.4.0                （显式指定版本号）
 *
 * 流程：
 *   1. 读取 mail-worker/package.json 的 version（单一事实源），计算新版本
 *   2. 从上一个 tag 到 HEAD 收集 commit，按 feat/fix/其他 分组生成更新说明
 *   3. 写入 CHANGELOG.md 顶部，更新 package.json 版本
 *   4. commit + 打 tag（vX.Y.Z）+ push 到 origin 和 gitea
 *   5. tag 推送触发 .github/workflows/release.yml 自动创建 GitHub Release
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'mail-worker', 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function sh(cmd, opts = {}) {
	return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: opts.silent ? ['ignore', 'pipe', 'ignore'] : 'inherit' }).trim();
}

function shOut(cmd) {
	try {
		return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
	} catch (e) {
		return '';
	}
}

function die(msg) {
	console.error(`❌ ${msg}`);
	process.exit(1);
}

// ---------- 版本计算 ----------

function nextVersion(current, bump) {
	if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
	const [major, minor, patch] = current.split('.').map(Number);
	if (bump === 'major') return `${major + 1}.0.0`;
	if (bump === 'minor') return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

// ---------- changelog 生成 ----------

//commit 类型分组：标题 + emoji
const GROUPS = [
	{ key: 'feat', label: '新功能', emoji: '✨', re: /^feat(\(.+?\))?!?:/i },
	{ key: 'fix', label: '问题修复', emoji: '🐛', re: /^fix(\(.+?\))?!?:/i },
	{ key: 'perf', label: '性能优化', emoji: '⚡', re: /^perf(\(.+?\))?!?:/i },
	{ key: 'refactor', label: '重构', emoji: '♻️', re: /^refactor(\(.+?\))?!?:/i },
	{ key: 'docs', label: '文档', emoji: '📝', re: /^docs?(\(.+?\))?!?:/i },
	{ key: 'chore', label: '其他', emoji: '🔧', re: /^(chore|style|test|ci|build)(\(.+?\))?!?:/i },
];

function collectCommits(fromTag) {
	const range = fromTag ? `${fromTag}..HEAD` : 'HEAD';
	const log = shOut(`git log ${range} --pretty=format:%s|||%b||||`) || '';
	return log.split('||||')
		.map(entry => entry.replace(/\r?\n/g, ' ').trim())
		.filter(Boolean)
		.map(entry => {
			const [subject, ...rest] = entry.split('|||');
			return { subject: subject.trim(), body: rest.join(' ').trim() };
		})
		.filter(c => !/^release:/i.test(c.subject)); //排除发布提交自身
}

function buildChangelog(version, commits) {
	const date = new Date().toISOString().slice(0, 10);
	const lines = [`## v${version}（${date}）`, ''];

	const used = new Set();
	for (const group of GROUPS) {
		const items = [];
		for (const c of commits) {
			if (used.has(c.subject)) continue;
			if (group.re.test(c.subject)) {
				//剥掉类型前缀，保留人类可读描述
				const desc = c.subject.replace(group.re, '').trim() || c.subject;
				items.push(`- ${desc}`);
				used.add(c.subject);
			}
		}
		if (items.length > 0) {
			lines.push(`### ${group.emoji} ${group.label}`, '', ...items, '');
		}
	}

	//未匹配任何分组的散commit 归入"其他"
	const rest = commits.filter(c => !used.has(c.subject));
	if (rest.length > 0) {
		lines.push('### 🔧 其他', '', ...rest.map(c => `- ${c.subject}`), '');
	}

	if (lines.length === 2) {
		lines.push('- 无变更记录', '');
	}

	return lines.join('\n');
}

// ---------- 主流程 ----------

function main() {
	const bump = process.argv[2] || 'patch';

	//工作区必须干净
	const status = shOut('git status --porcelain');
	if (status) {
		die(`工作区有未提交改动，先提交或 stash：\n${status}`);
	}

	const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
	const current = pkg.version;
	const version = nextVersion(current, bump);
	const tag = `v${version}`;

	//tag 已存在则终止
	if (shOut(`git rev-parse ${tag}`)) {
		die(`tag ${tag} 已存在`);
	}

	console.log(`\n🚀 发布 ${tag}（当前 v${current}）\n`);

	//收集 commit 并生成更新说明
	const lastTag = shOut('git describe --tags --abbrev=0');
	const commits = collectCommits(lastTag || '');
	const changelogEntry = buildChangelog(version, commits);

	console.log('────────── 更新说明 ──────────');
	console.log(changelogEntry);
	console.log('──────────────────────────────');

	//写入 CHANGELOG.md（存在则插到 frontmatter 之后，否则带头创建）
	let changelog = '';
	if (fs.existsSync(CHANGELOG_PATH)) {
		changelog = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
		changelog = changelog.replace(/(# Changelog\s*\n)/, `$1\n${changelogEntry}`);
		if (!changelog.includes(changelogEntry)) {
			changelog = changelogEntry + '\n' + changelog;
		}
	} else {
		changelog = `# Changelog\n\n${changelogEntry}`;
	}
	fs.writeFileSync(CHANGELOG_PATH, changelog);

	//更新版本号
	pkg.version = version;
	fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, '\t') + '\n');

	//commit + tag
	sh('git add mail-worker/package.json CHANGELOG.md');
	sh(`git commit -m "release: v${version}"`);
	sh(`git tag ${tag}`);

	//双推：分支 + tag（GitHub 触发 release workflow，Gitea 做镜像）
	sh('git push origin main');
	sh('git push origin ' + tag);
	sh('git push gitea main');
	sh('git push gitea ' + tag);

	console.log(`\n✅ ${tag} 已发布，GitHub Actions 将自动创建 Release 并部署。`);
}

main();
