#!/usr/bin/env python3
"""检查公开 Git 内容，不输出命中的凭据或个人信息。"""

import argparse
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--history', action='store_true', help='同时检查所有可达提交及文件历史')
args = parser.parse_args()
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
rules = {
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'github-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'aws-access-key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'slack-token': re.compile(rb'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'google-api-key': re.compile(rb'\bAIza[0-9A-Za-z_-]{35}\b'),
    'stripe-live-key': re.compile(rb'\b[rs]k_live_[A-Za-z0-9]{20,}\b'),
    'embedded-bearer-token': re.compile(rb'(?i)Bearer\s+[A-Za-z0-9_.-]{35,}'),
    'embedded-url-password': re.compile(rb'(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s:/]+:[^\s@${]+@'),
    'tailnet-host': re.compile(rb'\b(?:[\w-]+\.)+tail[a-z0-9]+\.ts\.net\b'),
    'tailnet-address': re.compile(rb'\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b'),
    'personal-home-directory': re.compile(rb'/(?:Users|home)/i(?:/|\s|$)'),
    'personal-device-name': re.compile(rb'\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{5,}\b|\b[\w-]+-macbook-(?:air|pro)\b'),
    'personal-mailbox': re.compile(rb'(?i)\b[A-Z0-9._%+-]+@(?:outlook|gmail|icloud|qq|163)\.com\b'),
}
private_path = re.compile(r'(^|/)(?:state|reports|node_modules|build|docs/superpowers)(/|$)|(?:\.sqlite(?:3|-.*)?|\.db(?:-.*)?|\.pem|\.key|\.p12|\.pfx|\.bundle)$|(^|/)(?:\.env(?:\..+)?|[^/]+\.env|id_rsa|id_ed25519)$')
findings = []
seen = set()
blob_count = 0
commit_count = 0


def inspect(path, data, source):
    if path != '.env.example' and private_path.search(path):
        finding = (path, 'private-file', source)
        if finding not in seen:
            seen.add(finding)
            findings.append({'path': path, 'rule': 'private-file', 'source': source})
    for label, pattern in rules.items():
        if pattern.search(data):
            finding = (path, label, source)
            if finding not in seen:
                seen.add(finding)
                findings.append({'path': path, 'rule': label, 'source': source})


if args.history:
    objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all'], cwd=root, text=True).splitlines()
    process = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=root,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    for row in objects:
        oid, _, path = row.partition(' ')
        process.stdin.write((oid + '\n').encode())
        process.stdin.flush()
        header = process.stdout.readline().decode().split()
        if len(header) != 3:
            raise RuntimeError('无法读取 Git 对象')
        data = process.stdout.read(int(header[2]))
        process.stdout.read(1)
        if header[1] == 'blob':
            blob_count += 1
            inspect(path, data, oid[:12])
        elif header[1] == 'commit':
            commit_count += 1
            inspect('<commit>', data, oid[:12])
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError('Git 历史读取失败')

files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).split(b'\0')
working_count = 0
for entry in sorted(set(files)):
    if not entry:
        continue
    path = entry.decode()
    file = root / path
    if file.is_symlink():
        inspect(path, str(file.readlink()).encode(), 'working-tree-link')
    elif file.is_file():
        working_count += 1
        inspect(path, file.read_bytes(), 'working-tree')

report = {'status': 'failed' if findings else 'passed', 'historyCommits': commit_count,
          'historyBlobs': blob_count, 'workingFiles': working_count, 'findings': findings}
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if findings else 0)
