"""恢复本轮已审核封面；只接收证据中完全相同的文件，不覆盖不同字节。"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.parse


def main():
    if sys.platform != "linux" or not os.environ.get("TMUX"):
        raise SystemExit("请在远程持久化任务中运行")
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if not proxy:
        raise SystemExit("缺少已配置代理")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-root", type=pathlib.Path, required=True)
    target = parser.parse_args().media_root.resolve()
    target.mkdir(parents=True, exist_ok=True)
    root = pathlib.Path(__file__).resolve().parents[1]
    report = json.loads((root / "data/cover-review-20261114.json").read_text())
    official = json.loads((root / "data/metadata-official-sources.json").read_text())
    reviewed_urls = {url for source in official.values() for url in source["images"]}
    covers = {w["workId"]: w["cover"] for w in json.loads((root / "data/metadata.json").read_text())["works"]}
    count = 0
    for record in report["records"]:
        if not record["selected"]:
            continue
        cover = covers[record["id"]]
        assert (cover["url"], cover["sourceUrl"]) == (record["url"], record["sourceUrl"])
        assert record["sexual"] == "safe" and record["violence"] == "tame"
        url = record["sourceUrl"]
        parsed = urllib.parse.urlsplit(url)
        assert parsed.scheme == "https" and not parsed.username and not parsed.password and not parsed.port
        assert url in reviewed_urls or (parsed.hostname == "t.vndb.org" and parsed.path.startswith("/cv/"))
        name = pathlib.Path(record["url"]).name
        assert record["url"] == "/media/" + name
        file = target / name
        if file.is_symlink():
            raise SystemExit(f"拒绝跟随图片软链接：{record['id']}")
        if file.exists():
            raw = file.read_bytes()
        else:
            # 不跟随重定向；站点改变素材或返回HTML时，内容哈希校验会拒绝。
            raw = subprocess.run([
                "curl", "--silent", "--show-error", "--fail", "--max-time", "40",
                "--max-filesize", "3145728", "--proto", "=https", "--proxy", proxy, url,
            ], check=True, capture_output=True).stdout
        if len(raw) != record["bytes"] or hashlib.sha256(raw).hexdigest() != record["sha256"]:
            raise SystemExit(f"图片字节与审核证据不同，需重新审核：{record['id']}")
        if not file.exists():
            # 排他创建，防止覆盖其他任务或并发生成的素材。
            with file.open("xb") as output:
                output.write(raw)
        count += 1
    print(json.dumps({"核对通过": count, "素材目录": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
