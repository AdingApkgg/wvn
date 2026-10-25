"""RenPy 宿主构建工具：独立缓存，所有安装均为锁定的离线输入。"""
from pathlib import Path, PurePosixPath
import hashlib, io, json, os, shutil, subprocess, sys, tarfile, types, uuid, zipfile

def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def check_file(path, expected):
    p = Path(path)
    if p.is_symlink() or not p.is_file() or digest(p) != expected:
        raise ValueError('Input fingerprint differs: ' + p.name)


def inventory(root):
    result = {}
    for p in sorted(Path(root).rglob('*')):
        if p.is_symlink():
            if not p.resolve().is_relative_to(Path(root).resolve()):
                raise ValueError('Host tool symlink escapes cache')
            result[str(p.relative_to(root))] = 'link:' + os.readlink(p)
        elif p.is_file():
            result[str(p.relative_to(root))] = digest(p)
    return result


def command(args, cwd, env=None):
    print('WVN argv:', json.dumps([str(a) for a in args]), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, env=env, check=True)


def unpack(path, destination):
    with tarfile.open(path) as src:
        src.extractall(destination, filter='data')


def host_python(job, root, packages, cache, lock_digest):
    """宿主 Python 是独立工具缓存；绝不移动已安装的前缀。"""
    cache.mkdir(parents=True, exist_ok=True)
    compiler = subprocess.check_output(['/usr/bin/gcc', '--version']).decode().splitlines()[0]
    key = hashlib.sha256((lock_digest + digest(__file__) + compiler).encode()).hexdigest()
    ready = cache / ('ready-' + key + '.json')
    if ready.exists():
        record = json.loads(ready.read_text())
        prefix = Path(record['prefix'])
        if prefix.parent != cache or inventory(prefix) != record['files']:
            raise ValueError('Host Python cache fingerprint differs')
        print('WVN verified host Python cache:', prefix, flush=True)
        return prefix, compiler, key
    prefix = cache / (key + '-' + job.name)
    prefix.mkdir()
    work = job / 'host-bootstrap'
    work.mkdir()
    # 用锁定的纯 Python 模板库渲染；不依赖宿主预装 Jinja2。
    templates = work / 'template-libs'
    for package in packages:
        if package['name'] not in ('Jinja2', 'MarkupSafe'):
            continue
        with zipfile.ZipFile(package['path']) as wheel:
            for member in wheel.namelist():
                path = PurePosixPath(member)
                if '..' in path.parts or path.is_absolute():
                    raise ValueError('Unsafe wheel path')
                if member.endswith('.py') and path.parts[0] in ('jinja2', 'markupsafe'):
                    target = templates / member
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(wheel.read(member))
    sys.path.insert(0, str(templates))
    import jinja2
    unpack(root / 'source/Python-3.11.0.tgz', work)
    source = work / 'Python-3.11.0'
    setup = jinja2.Template((root / 'source/Python-3.11.0-Setup.stdlib').read_text()).render(c=types.SimpleNamespace(kind='host', platform='host'))
    for name in ('Setup.stdlib', 'Setup'):
        (source / 'Modules' / name).write_text(setup)
    env = dict(os.environ, CC='/usr/bin/gcc', CXX='/usr/bin/g++', CFLAGS='-O2 -std=gnu11',
               TMPDIR=str(work), PIP_CACHE_DIR=str(work / 'pip-cache'))
    for key_env in ('PYTHONPATH', 'PYTHONHOME', 'CONFIG_SITE', 'PYTHON_FOR_BUILD'):
        env.pop(key_env, None)
    command(['./configure', '--prefix=' + str(prefix)], source, env)
    command(['make', '-j2'], source, env)
    makefile = source / 'Makefile'
    makefile.write_text(makefile.read_text().replace('-j0 -d', '-j2 -d'))
    command(['make', '-j2', 'install'], source, env)
    python = prefix / 'bin/python3'
    base = [python, '-s', '-m', 'pip', 'install', '--no-index', '--no-deps', '--no-build-isolation', '--no-compile']
    package_map = {p['name']: p for p in packages}
    command([*base, *[package_map[n]['path'] for n in ('pip', 'setuptools', 'wheel')]], work, env)
    command([*base, *[p['path'] for p in packages if p['name'] not in ('pip', 'setuptools', 'wheel')]], work, env)
    command([python, '-c', 'import Cython,jinja2,ssl,bz2,lzma; assert Cython.__version__ == "0.29.32"'], work, env)
    # emcc 以 Python -E 启动，会忽略禁止 pyc 的环境变量。工具缓存准备后只读，
    # 避免新字节码进入共享前缀，也不把未核验 pyc 排除在指纹之外。
    for path in prefix.rglob('*'):
        if not path.is_symlink():
            path.chmod(path.stat().st_mode & ~0o222)
    prefix.chmod(prefix.stat().st_mode & ~0o222)
    record = {'prefix': str(prefix), 'files': inventory(prefix)}
    temp = cache / ('.ready-' + str(uuid.uuid4()))
    temp.write_text(json.dumps(record, sort_keys=True))
    temp.rename(ready)
    return prefix, compiler, key

