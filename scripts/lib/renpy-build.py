#!/usr/bin/env python3
"""固定 RenPy 8.2.1 的无 root Web 构建适配器；不执行上游 prepare。"""
from pathlib import Path, PurePosixPath
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import types
import uuid
import zipfile

from renpy_host_python import digest, check_file, inventory, command, unpack, host_python

SOURCE_PATHS = ['README.rst', 'build.py', 'requirements.txt', 'renpybuild', 'tasks',
                'patches', 'runtime', 'extensions', 'tools', 'source', ':(exclude)source/MetalANGLE*']

def patch_web_unpack(path):
    """保留 data 内固定的引擎 Python/标准库，旧包只贡献游戏资源。"""
    path = Path(path)
    needle = '    for i, zi in enumerate(infolist):\n        zf.extract(zi, "/")\n'
    replacement = '''    for i, zi in enumerate(infolist):
        _wvn_parts = [p for p in zi.filename.split("/") if p not in ("", ".", "..")]
        if not _wvn_parts or _wvn_parts[0] not in ("renpy", "pygame_sdl2", "lib"):
            zf.extract(zi, "/")
'''
    source = path.read_text()
    if source.count(needle) != 1:
        raise ValueError('Upstream Web unpack shape differs')
    path.write_text(source.replace(needle, replacement))


def install_runtime(sources, dist, version_file):
    """仅从已捕获固定源码复制 Python 包；不把构建生成文件或旧游戏代码混入。"""
    sources, dist = Path(sources), Path(dist)
    files = {}
    for name in ('renpy', 'pygame_sdl2'):
        archives = list(sources.glob(name + '-' + '[0-9a-f]' * 40 + '.tar'))
        if len(archives) != 1:
            raise ValueError('Exactly one captured runtime source is required')
        prefix = 'renpy/renpy/' if name == 'renpy' else 'pygame_sdl2/src/pygame_sdl2/'
        copied = 0
        with tarfile.open(archives[0]) as archive_file:
            for member in archive_file:
                if not member.name.startswith(prefix) or member.isdir():
                    continue
                relative = PurePosixPath(name) / member.name[len(prefix):]
                if not member.isfile() or '..' in relative.parts or '\\' in str(relative):
                    raise ValueError('Invalid captured runtime file')
                target = dist / str(relative)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive_file.extractfile(member).read())
                target.chmod(0o644)
                epoch = int(os.environ.get('SOURCE_DATE_EPOCH', '1709553600'))
                os.utime(target, (epoch, epoch))
                files[str(relative)] = digest(target)
                copied += 1
        if not copied:
            raise ValueError('Captured runtime package is empty')
    target = dist / 'renpy/vc_version.py'
    shutil.copyfile(version_file, target)
    target.chmod(0o644)
    epoch = int(os.environ.get('SOURCE_DATE_EPOCH', '1709553600'))
    os.utime(target, (epoch, epoch))
    files['renpy/vc_version.py'] = digest(target)
    return {'schema': 1, 'packages': ['renpy', 'pygame_sdl2'], 'files': dict(sorted(files.items()))}



def archive(root, name, destination):
    """仅归档固定提交已检出的文件，不触发 Git 对其他平台的懒下载。"""
    root = Path(root)
    paths = SOURCE_PATHS if name == 'renpy-build' else []
    records = subprocess.check_output(['git', '-C', str(root), 'ls-files', '--stage', '-z', '--', *paths]).decode().split('\0')
    with tarfile.open(destination, 'w', format=tarfile.PAX_FORMAT) as out:
        for record in filter(None, records):
            meta, path = record.split('\t', 1)
            mode, _, stage = meta.split()
            if stage != '0' or mode not in ('100644', '100755', '120000'):
                raise ValueError('Unsupported source index entry')
            info = tarfile.TarInfo(name + '/' + path)
            info.mtime = 0
            info.mode = 0o755 if mode == '100755' else 0o644
            if mode == '120000':
                info.type = tarfile.SYMTYPE
                info.linkname = os.readlink(root / path)
                out.addfile(info)
            else:
                data = (root / path).read_bytes()
                info.size = len(data)
                out.addfile(info, io.BytesIO(data))












def build(job, cache, sdk, host_cache):
    job, cache, sdk, host_cache = map(lambda p: Path(p).resolve(), (job, cache, sdk, host_cache))
    if job == cache or job == sdk or job == host_cache:
        raise ValueError('Build directories must be distinct')
    lock_path = job / 'inputs/engines/locks/renpy-8.2.1-inputs.json'
    recipe = json.loads((job / 'inputs/recipe.json').read_text())
    check_file(lock_path, recipe['inputs']['sha256'])
    lock = json.loads(lock_path.read_text())
    source_root = job / 'upstream'
    source_root.mkdir()
    provenance = job / 'sources'
    provenance.mkdir()
    for item in lock['sources']:
        src = cache / item['archive']
        check_file(src, item['archiveSha256'])
        shutil.copyfile(src, provenance / item['archive'])
        unpack(src, source_root)
    # 上游 Cython 以 mtime>0 判断缺失 C 文件；规范归档的零时间需还原为固定非零构建纪元。
    epoch = int(os.environ['SOURCE_DATE_EPOCH'])
    if epoch <= 0:
        raise ValueError('A positive fixed source epoch is required')
    for path in source_root.rglob('*'):
        if path.is_file() and not path.is_symlink():
            os.utime(path, (epoch, epoch))
    root = source_root / 'renpy-build'
    for name in ('renpy', 'pygame_sdl2'):
        (source_root / name).rename(root / name)
    (root / 'tmp/source').mkdir(parents=True)
    for name in ('aom', 'libyuv', 'libavif'):
        (source_root / name).rename(root / 'tmp/source' / name)
    for item in lock['archives']:
        check_file(root / item['path'], item['sha256'])
    packages = []
    dependency_copy = job / 'python-inputs'
    dependency_copy.mkdir()
    for item in lock['python']['packages']:
        src = cache / 'python' / item['file']
        check_file(src, item['sha256'])
        shutil.copyfile(src, dependency_copy / item['file'])
        packages.append(dict(item, path=str(dependency_copy / item['file'])))
    cmake_variables = root / 'tools/cmake_build_variables.cmake'
    original_cmake = cmake_variables.read_text()
    launchers = 'set(CMAKE_C_COMPILER_LAUNCHER "ccache")\nset(CMAKE_CXX_COMPILER_LAUNCHER "ccache")'
    if original_cmake.count(launchers) != 1:
        raise ValueError('Upstream CMake launcher shape differs')
    cmake_variables.write_text(original_cmake.replace(launchers, 'set(CMAKE_C_COMPILER_LAUNCHER "")\nset(CMAKE_CXX_COMPILER_LAUNCHER "")'))
    patch_web_unpack(root / 'runtime/site3.py')
    prefix, compiler, host_key = host_python(job, root, packages, host_cache, recipe['inputs']['sha256'])
    # detached 源码缺少分支语义；从固定发行标签记录版本，但明确这是非官方构建。
    (root / 'renpy/renpy/vc_version.py').write_text("version = '8.2.1.24030407'\nversion_name = '64bit Sensation'\nbranch = 'fix'\nofficial = False\nnightly = False\n")
    shutil.copyfile(root / 'renpy/sphinx/source/license.rst', job / 'LICENSE.renpy.txt')
    host = root / 'tmp/host'
    host.mkdir(exist_ok=True)
    (host / 'web').symlink_to(prefix, target_is_directory=True)
    (root / 'tmp/cross.web-wasm').symlink_to(sdk, target_is_directory=True)
    command(['patch', '-p1', '-i', root / 'patches/libyuv-noshared.diff'], root / 'tmp/source/libyuv')
    env = dict(os.environ)
    env.update(PATH=str(prefix / 'bin') + ':' + env['PATH'], PYTHONPATH=str(prefix / 'lib/python3.11/site-packages'),
               PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(job / 'tmp'), XDG_CACHE_HOME=str(job / 'cache'), PIP_CACHE_DIR=str(job / 'cache/pip'))
    Path(env['TMPDIR']).mkdir()
    settings = {'root': str(root), 'prefix': str(prefix), 'runtime': lock['python']['runtime'], 'packages': packages}
    config = job / 'adapter.json'
    config.write_text(json.dumps(settings))
    command([prefix / 'bin/python3', Path(__file__), 'tasks', config], root, env)
    output = job / 'output'
    output.mkdir()
    files = ['renpy-pre.js', 'renpy.js', 'renpy.wasm', 'renpy.data']
    for name in files:
        shutil.copyfile(root / 'renpy/web3' / name, output / name)
    receipt = {'schema': 1, 'engine': 'RenPy', 'version': lock['version'], 'official': False, 'features': {'live2d': False, 'pinnedPythonRuntime': True},
               'hostCompiler': compiler, 'hostToolCache': host_key, 'sdk': recipe['sdk'],
               'sources': lock['sources'], 'dependencyLock': recipe['inputs']['sha256'],
               'adapter': digest(__file__), 'hostPythonModule': digest(Path(__file__).with_name('renpy_host_python.py')),
               'sourceDateEpoch': int(os.environ['SOURCE_DATE_EPOCH']), 'runtimePython': json.loads((job / 'runtime-python.json').read_text()), 'files': {name: digest(output / name) for name in files}}
    (job / 'renpy-receipt.json').write_text(json.dumps(receipt, indent=2))


def tasks(config):
    cfg = json.loads(Path(config).read_text())
    root, prefix = Path(cfg['root']).resolve(), Path(cfg['prefix']).resolve()
    sys.path.insert(0, str(root))
    import importlib.util
    spec = importlib.util.spec_from_file_location('wvn_upstream_build', root / 'build.py')
    upstream = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upstream)
    import renpybuild.run as runner
    import renpybuild.task as task_module
    from renpybuild.context import Context
    overrides = []
    # Cubism 不在固定输入中。关闭可选模块，不能生成依赖不存在头文件的二进制。
    live2d = [a for a in task_module.annotators if a.__module__ == 'tasks.live2d' and a.__name__ == 'annotate']
    if len(live2d) != 1:
        raise ValueError('Upstream Live2D annotator shape differs')
    task_module.annotators.remove(live2d[0])
    os.environ.pop('CUBISM', None)
    setup = root / 'renpy/module/Setup'
    live2d_entry = 'renpy.gl2.live2dmodel gen/renpy.gl2.live2dmodel.c\n'
    content = setup.read_text()
    if content.count(live2d_entry) != 1:
        raise ValueError('Upstream optional Live2D Setup entry differs')
    setup.write_text(content.replace(live2d_entry, ''))
    os.environ['RENPY_CYTHON_SINGLETHREAD'] = '1'
    overrides.extend(['Live2D=disabled-no-Cubism-input', 'RenPy.Setup.exclude=live2dmodel', 'Cython=singlethread'])

    def fixed_task(name, task_name, function):
        matches = [t for t in task_module.tasks if t.name == name and t.task == task_name]
        if len(matches) != 1:
            raise ValueError('Upstream task shape differs: ' + name + '.' + task_name)
        matches[0].function = function
        overrides.append(name + '.' + task_name)

    def pinned(c):
        print('WVN preverified task:', c.task_name)

    for name in ('aom', 'libyuv', 'libavif'):
        fixed_task(name, 'download', pinned)
    for name in ('unpack_web', 'build_web'):
        fixed_task('hostpython3', name, pinned)
    fixed_task('toolchain', 'emsdk', pinned)

    def offline_pip(c):
        paths = [p['path'] for p in cfg['packages'] if p['name'] in cfg['runtime'] or p['name'] in ('setuptools', 'wheel')]
        command([prefix / 'bin/python3', '-s', '-m', 'pip', 'install', '--no-index', '--no-deps', '--no-build-isolation',
                 '--no-compile', '--ignore-installed', '--prefix=' + str(c.install), *paths], c.cwd, c.environ)
    fixed_task('python3', 'pip', offline_pip)

    def gcc(c, **kwargs):
        for key, val in {'CC':'/usr/bin/gcc -std=gnu17', 'CXX':'/usr/bin/g++ -std=gnu++17', 'CPP':'/usr/bin/gcc -E',
                         'AR':'/usr/bin/ar', 'RANLIB':'/usr/bin/ranlib', 'STRIP':'/usr/bin/strip',
                         'NM':'/usr/bin/nm', 'READELF':'/usr/bin/readelf'}.items():
            c.env(key, val)
    runner.llvm = gcc
    runner.emsdk_environment = lambda c: None
    original_environment = runner.build_environment
    original_run = Context.run

    def bounded_run(c, text, *args, **kwargs):
        expanded = c.expand(text, **kwargs)
        if c.name == 'renpython' and '--preload-file' in expanded:
            receipt = install_runtime(root.parent.parent / 'sources', c.path('{{ dist }}'), root / 'renpy/renpy/vc_version.py')
            (root.parent.parent / 'runtime-python.json').write_text(json.dumps(receipt, indent=2))
            print('WVN pinned Python runtime files:', len(receipt['files']), flush=True)
        makefile = c.cwd / 'Makefile'
        if 'make' in expanded and 'install' in expanded and makefile.is_file():
            content = makefile.read_text()
            if '-j0 -d' in content:
                makefile.write_text(content.replace('-j0 -d', '-j2 -d'))
                print('WVN compileall concurrency capped:', makefile, flush=True)
        return original_run(c, text, *args, **kwargs)
    Context.run = bounded_run

    def environment(c):
        original_environment(c)
        cross = c.platform == 'web' and c.kind not in ('host', 'host-python', 'cross') and c.name != 'web'
        c.var('make', ('emmake ' if cross else '') + 'nice make -j2')
        c.env('PATH', str(prefix / 'bin') + ':' + str(Path(os.environ['EMSDK']) / 'upstream/emscripten/system/bin') + ':{{ PATH }}')
        c.env('EM_COMPILER_WRAPPER', '')
        if c.platform == 'web' and c.name == 'pygame_sdl2':
            c.env('PYGAME_SDL2_STATIC', '1')
        if c.platform == 'web' and c.name == 'librenpy':
            c.env('RENPY_EMSCRIPTEN', '1')
        c.env('CFLAGS', '{{ CFLAGS }} -ffile-prefix-map=' + str(root.parent.parent) + '=.')
        c.env('CXXFLAGS', '{{ CFLAGS }}')
        if cross:
            c.env('PKG_CONFIG_LIBDIR', '{{install}}/lib/pkgconfig:' + os.environ['EM_CACHE'] + '/sysroot/lib/pkgconfig:{{cross}}/upstream/emscripten/system/lib/pkgconfig')
    runner.build_environment = environment

    # 上游 RunGroup 未限并发且 wait/read 顺序可能卡住满管道；逐条收集，不丢错误。
    def group_run(self, command_text):
        child = runner.RunCommand(command_text, self.context)
        child.output, _ = child.p.communicate()
        child.code = child.p.returncode
        child.wait = lambda: None
        self.tasks.append(child)
    runner.RunGroup.run = group_run

    # 只允许删除作业内路径；SDK 与宿主工具目录的链接只能被解除，不能跟随。
    def allowed(c, text):
        p = c.path(text).absolute()
        if p == root or not p.is_relative_to(root) or not p.parent.resolve().is_relative_to(root):
            raise ValueError('Cleanup outside job source tree')
        return p

    def remove(c, text):
        p = allowed(c, text)
        if p.is_symlink() or p.is_file():
            p.unlink()
        elif p.exists():
            shutil.rmtree(p)
        return p

    def clean(c, text='{{build}}'):
        remove(c, text).mkdir(parents=True, exist_ok=True)
    Context.clean = clean
    Context.rmtree = lambda c, text: remove(c, text)
    Context.unlink = lambda c, text: remove(c, text)
    overrides.extend(['run.llvm=gcc', 'run.emsdk_environment=explicit', 'run.build_environment=bounded',
                      'RunGroup.run=serial-communicate', 'Context.cleanup=job-only', 'vc_version=locked-unofficial', 'CMake.launcher=direct', 'Python.compileall=2', 'source.mtime=fixed-positive', 'pygame_sdl2.install=static', 'librenpy.generate=emscripten', 'Web.unpack=game-only', 'Web.data=pinned-Python-runtime'])
    print('WVN overrides:', json.dumps(overrides), flush=True)
    (root.parent.parent / 'adapter-overrides.json').write_text(json.dumps(overrides, indent=2))
    upstream.root = root
    upstream.build(types.SimpleNamespace(platforms='web', archs='wasm', pythons='3', nostrip=False, sdl=False, experimental=False))


if __name__ == '__main__':
    mode, *args = sys.argv[1:]
    if mode == 'archive':
        archive(*args)
    elif mode == 'build':
        build(*args)
    elif mode == 'tasks':
        tasks(*args)
    else:
        raise ValueError('Unknown adapter mode')
