"""仅使用临时小文件验证资源迁移与续传，不读取实际游戏。"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
(ROOT / 'reports').mkdir(exist_ok=True)

class TransferTests(unittest.TestCase):
    def transfer(self, source, target, roots, resume=None):
        args = ['node', str(ROOT / 'scripts/migration/resource-export.mjs'), str(roots)]
        if resume:
            args.append(str(resume))
        exporter = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        result = subprocess.run(['python3', str(ROOT / 'scripts/migration/resource-receive.py'), str(target)], stdin=exporter.stdout, capture_output=True)
        exporter.stdout.close()
        exporter.communicate()
        return result

    def test_corrupted_resume_target_never_reports_complete(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'reports') as directory:
            base = Path(directory)
            source, target = base / 'source', base / 'target'
            source.mkdir()
            (source / '校验.dat').write_bytes(b'original')
            roots = base / 'roots.json'
            roots.write_text(json.dumps({'games': str(source)}))
            self.assertEqual(self.transfer(source, target, roots).returncode, 0)
            (target / 'games/校验.dat').write_bytes(b'bad-data')
            result = self.transfer(source, target, roots, target / 'migration-manifest.json')
            self.assertNotEqual(result.returncode, 0, '损坏的已跳过文件不得获得完成回执')

    def test_changed_source_with_same_size_and_time_is_retransmitted(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'reports') as directory:
            base = Path(directory)
            source, target = base / 'source', base / 'target'
            source.mkdir()
            file = source / 'save.dat'
            file.write_bytes(b'original')
            roots = base / 'roots.json'
            roots.write_text(json.dumps({'games': str(source)}))
            self.assertEqual(self.transfer(source, target, roots).returncode, 0)
            stat = file.stat()
            file.write_bytes(b'new-data')
            os.utime(file, ns=(stat.st_atime_ns, stat.st_mtime_ns))
            result = self.transfer(source, target, roots, target / 'migration-manifest.json')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((target / 'games/save.dat').read_bytes(), b'new-data')

if __name__ == '__main__':
    unittest.main()
