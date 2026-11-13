"""缓存命中与重新下载均不能把已审核URL对应到未审核字节。"""
import hashlib
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

script = pathlib.Path(__file__).resolve().parents[1] / "scripts/cache-metadata-media.py"
spec = importlib.util.spec_from_file_location("cache_media", script)
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)


class ReviewedCoverCache(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.url = next(iter(cache.PINNED))
        self.raw = b"\xff\xd8\xffreviewed fixture"
        self.image = {"url": "/media/" + "a" * 64 + ".jpg", "sourceUrl": self.url}
        self.file = pathlib.Path(self.directory.name) / pathlib.Path(self.image["url"]).name
        self.pinned = {self.url: {"bytes": len(self.raw), "sha256": hashlib.sha256(self.raw).hexdigest()}}

    def test_cached_bytes_are_checked_before_reuse(self):
        with patch.object(cache, "MEDIA", pathlib.Path(self.directory.name)), patch.object(cache, "PINNED", self.pinned):
            self.file.write_bytes(self.raw)
            self.assertEqual(cache.download(self.image)[1], self.image["url"])
            self.file.write_bytes(b"\xff\xd8\xffunreviewed fixture")
            with patch.object(cache.subprocess, "run", side_effect=AssertionError("缓存不应联网")):
                result = cache.download(self.image)
            self.assertIsNone(result[1])
            self.assertIn("differs from reviewed", result[2])

    def test_changed_download_cannot_enter_cache(self):
        # 使用已在官网白名单中的地址，隔离实际网络；MIME正确也不能代替审核哈希。
        url = next(url for url in cache.PINNED if url in cache.REVIEWED)
        image = {**self.image, "sourceUrl": url}
        pinned = {url: self.pinned[self.url]}
        response = type("Response", (), {"stdout": b"\xff\xd8\xffchanged fixture"})()
        with patch.object(cache, "MEDIA", pathlib.Path(self.directory.name)), patch.object(cache, "PINNED", pinned), patch.object(cache.subprocess, "run", return_value=response), patch.object(cache.time, "sleep"):
            result = cache.download(image)
        self.assertIsNone(result[1])
        self.assertIn("differs from reviewed", result[2])
        self.assertFalse(self.file.exists())


if __name__ == "__main__":
    unittest.main()
