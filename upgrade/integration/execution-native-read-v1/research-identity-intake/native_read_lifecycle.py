"""Finite private native-READ lifecycle; no authority or resources on import.

The operator supplies reviewed configuration, the sequential listener handover
and a finite source-owner connection reservation. This module does not approve
those inputs, issue identities, install policy or implement a transport. UNKNOWN
keeps the original SDK objects and recovery listener. The owner must keep this
object/process alive after cancellation until actual recovery and cleanup.
"""
from __future__ import annotations

import asyncio
from hashlib import sha256
import importlib
import importlib.machinery
import importlib.util
import inspect
import os
from pathlib import Path
import stat
import sys


OPERATOR_SHA256 = "e108a0a740831a3905c6174597420888160097de7ff4edd682bf276965f42424"
NATIVE_PM_PINS = {
    "services/portfolio_management/native_business_read_runtime.py":
        "76c8574a5cfcdc34a1f92e7967a5fea3192d970bf72b1952db500a4409452273",
    "services/portfolio_management/native_business_read_provider.py":
        "0134b84aa9da5887214faa3108cc299a120a217762dabdb23386347589c9b048",
    "services/portfolio_management/business_root_read.py":
        "2606c1976fdc7382977ad36ba9b64cd748be538d7c768e388c49a7e982a50d66",
    "services/portfolio_management/business_root_held.py":
        "da9c5a62778c2af82339f5f52b9ae17b97aa440a2cde04d51e3f63cec296fd4c",
}


class NativeReadLifecycleError(ValueError):
    """Bounded local lifecycle failure; never serialize private SDK exceptions."""


class NativeReadCustodyRequired(NativeReadLifecycleError):
    """Original runtime/recovery custody must remain available."""


def _require(condition, code):
    if not condition:
        raise NativeReadLifecycleError(code)


def _source(path, expected):
    """Read pinned public source without following links or accepting writers."""
    path = Path(path)
    _require(path.is_absolute() and path.resolve() == path, "NATIVE_SOURCE_PATH_INVALID")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        meta = os.fstat(fd)
        _require(stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1
                 and meta.st_uid in {0, os.geteuid()} and not meta.st_mode & 0o022
                 and 0 < meta.st_size <= 262144, "NATIVE_SOURCE_PROTECTION_INVALID")
        raw = os.read(fd, 262145)
        _require(len(raw) == meta.st_size and sha256(raw).hexdigest() == expected,
                 "NATIVE_SOURCE_PIN_CHANGED")
        return raw
    finally:
        os.close(fd)


def _directory(path):
    _require(path.is_absolute() and path.resolve() == path, "NATIVE_SOURCE_PATH_INVALID")
    meta = path.stat()
    _require(stat.S_ISDIR(meta.st_mode) and meta.st_uid in {0, os.geteuid()}
             and not meta.st_mode & 0o022, "NATIVE_SOURCE_PROTECTION_INVALID")


def load_native_closure(pm_source_root, *, operator_path):
    """Load only the frozen 17+4 PM closure, never identity-specific glue.

    Use a dedicated ``python -I -B`` process. The pinned operator itself imports
    stdlib only; all PM files are verified before any PM initializer executes.
    No global pin dictionaries are changed and no ambient services package may
    already exist. A failed import is not a reusable/admitted configuration.
    """
    _require(sys.flags.isolated == 1 and sys.dont_write_bytecode,
             "NATIVE_SOURCE_ISOLATED_NO_BYTECODE_REQUIRED")
    _require(not any(name == "services" or name.startswith("services.")
                     for name in sys.modules), "NATIVE_SOURCE_NAMESPACE_ALREADY_IMPORTED")
    root, operator_path = Path(pm_source_root), Path(operator_path)
    _directory(root)
    _directory(operator_path.parent)
    operator_raw = _source(operator_path, OPERATOR_SHA256)
    operator_spec = importlib.util.spec_from_file_location(
        "_execution_native_identity_operator", operator_path)
    _require(operator_spec is not None and operator_spec.loader is not None,
             "NATIVE_SOURCE_LOAD_FAILED")
    helpers = importlib.util.module_from_spec(operator_spec)
    # Execute exactly the bytes just checked, not a new unverified file read.
    exec(compile(operator_raw, str(operator_path), "exec"), helpers.__dict__)
    pins = {**helpers.PM_PINS, **NATIVE_PM_PINS}
    _require(len(helpers.PM_PINS) == 17 and len(pins) == 21,
             "NATIVE_SOURCE_CLOSURE_CHANGED")
    services_root = root / "services"
    _directory(services_root)
    _require(not (services_root / "__init__.py").exists()
             and not (services_root / "__init__.py").is_symlink(),
             "NATIVE_SOURCE_NAMESPACE_CHANGED")
    package_dirs = {root, services_root}
    for relative, pin in pins.items():
        path = root / relative
        parent = path.parent
        while parent != root:
            _directory(parent)
            package_dirs.add(parent)
            parent = parent.parent
        _source(path, pin)
        # -B forbids writing caches, not reading an existing valid .pyc. The
        # real cache path also covers an explicit interpreter pycache prefix.
        cached = Path(importlib.util.cache_from_source(str(path)))
        _require(not cached.exists() and not cached.is_symlink(),
                 "NATIVE_SOURCE_BYTECODE_PRESENT")
    for directory in package_dirs:
        for entry in directory.iterdir():
            _require(entry.name != "__pycache__" and entry.suffix not in {".pyc", ".pyo"},
                     "NATIVE_SOURCE_BYTECODE_PRESENT")
            # FileFinder prefers extension modules to a same-named .py. An
            # origin check after import would execute the unreviewed shadow.
            _require(not any(entry.name.endswith(suffix)
                             for suffix in importlib.machinery.EXTENSION_SUFFIXES),
                     "NATIVE_SOURCE_IMPORT_SHADOW_PRESENT")
    spec = importlib.machinery.ModuleSpec("services", loader=None, is_package=True)
    spec.submodule_search_locations = [str(services_root)]
    namespace = importlib.util.module_from_spec(spec)
    namespace.__path__ = [str(services_root)]
    sys.modules["services"] = namespace
    allowed = {"services"}
    for relative, pin in pins.items():
        name = relative[:-3].replace("/", ".")
        if name.endswith(".__init__"):
            name = name[:-9]
        allowed.add(name)
        module = importlib.import_module(name)
        filename = getattr(module, "__file__", None)
        _require(type(filename) is str and Path(filename) == root / relative,
                 "NATIVE_SOURCE_ORIGIN_CHANGED")
        _source(Path(filename), pin)
    _require(sys.modules.get("services") is namespace
             and list(namespace.__path__) == [str(services_root)]
             and all(name in allowed for name in sys.modules
                     if name == "services" or name.startswith("services.")),
             "NATIVE_SOURCE_NAMESPACE_CHANGED")
    return sys.modules["services.portfolio_management.native_business_read_runtime"], helpers


async def _result(value):
    return await value if inspect.isawaitable(value) else value


def _owned_task(coroutine, *, name):
    task = asyncio.create_task(coroutine, name=name)
    def observe(result):
        # A lost controller must not send a private SDK exception to asyncio's
        # default "exception was never retrieved" logger. Await still raises.
        if not result.cancelled():
            result.exception()
    task.add_done_callback(observe)
    return task


class NativeReadLifecycle:
    """Own one SDK runtime, its actual listener and two finite owned pools.

    Factories must hand over a pool object before initialization, or own cleanup
    of resources not yet returned. A resource-producing awaitable Pool is stored
    before awaiting it. No factory may start an independent business attempt.
    Helpers must be the pinned operator module returned by load_native_closure.
    Test-only doubles may inject the same narrow interfaces explicitly.
    """
    def __init__(self, *, deadline, helpers, tracker_factory=None):
        self.deadline, self.helpers = deadline, helpers
        self.tracker_factory = helpers.RecoveryHandlers if tracker_factory is None else tracker_factory
        self.source_pool = self.control_pool = None
        self.runtime = self.handlers = self.server = None
        self.closed = False
        self._start_task = self._close_task = None
        self._start_spec = None
        self._pool_close_tasks = {}
        self._pool_close_history = []
        self._draining = False

    async def start(self, *, source_pool_factory, control_pool_factory,
                    runtime_factory, host, port, ready_callback=None):
        # Observing an old setup result is not a fresh READY after cleanup has
        # begun, even if its exact original factory arguments are supplied.
        _require(not self.closed and self._close_task is None,
                 "NATIVE_LIFECYCLE_START_REFUSED")
        spec = (source_pool_factory, control_pool_factory, runtime_factory,
                host, port, ready_callback)
        if self._start_task is None:
            _require(not self._draining, "NATIVE_LIFECYCLE_START_REFUSED")
            self._start_spec = spec
            self._start_task = _owned_task(self._start(*spec), name="native-read-setup")
        else:
            previous = self._start_spec
            _require(all(previous[i] is spec[i] for i in (0, 1, 2, 5))
                     and previous[3:5] == spec[3:5], "NATIVE_LIFECYCLE_START_REFUSED")
        # Caller cancellation never loses the resource-producing task/result.
        try:
            return await asyncio.shield(self._start_task)
        except asyncio.CancelledError:
            # A late retained start may still bind. Stop ISSUE synchronously
            # now, and apply the same flag when its runtime becomes available.
            self.begin_draining()
            raise

    async def _make_pool(self, factory, attribute):
        value = factory()
        if (callable(getattr(value, "close", None))
                and callable(getattr(value, "get_size", None))):
            setattr(self, attribute, value)
        result = await _result(value)
        if getattr(self, attribute) is not None:
            _require(result is value, "NATIVE_POOL_FACTORY_CHANGED_RESOURCE")
        if callable(getattr(result, "close", None)):
            setattr(self, attribute, result)
        _require(result is not None and callable(getattr(result, "close", None))
                 and callable(getattr(result, "get_size", None)), "NATIVE_POOL_REQUIRED")

    async def _start(self, source_factory, control_factory, runtime_factory,
                     host, port, ready_callback):
        try:
            await self._make_pool(source_factory, "source_pool")
            await self._make_pool(control_factory, "control_pool")
            _require(self.source_pool is not self.control_pool, "NATIVE_SEPARATE_POOLS_REQUIRED")
            self.runtime = await _result(runtime_factory(
                source_pool=self.source_pool, control_pool=self.control_pool))
            if self._draining:
                self.runtime.provider.begin_draining()
            self.handlers = self.tracker_factory(self.runtime.listener, self.deadline)
            # SDK start already runs the real qualification; do not run it twice.
            self.server = await self.runtime.start(host=host, port=port)
            self.helpers.server_transport_count(self.server)
            _require(self.helpers.listener_is_serving(self.server), "NATIVE_LISTENER_NOT_SERVING")
            if ready_callback is not None:
                ready = await _result(ready_callback(self))
                _require(ready is not False, "NATIVE_READY_NOT_ACKNOWLEDGED")
            return self
        except BaseException:
            # A READY callback can fail after actual ISSUE. UNKNOWN must retain
            # the original listener/pools rather than unwind that authority.
            await self._retire()
            raise

    def begin_draining(self):
        """Stop ISSUE only; original enter/status/resolve stay on the SDK wire."""
        self._draining = True
        if self.runtime is not None:
            self.runtime.provider.begin_draining()

    def _assert_drained(self):
        if self.runtime is not None:
            try:
                self.runtime.assert_drained()
            except Exception:
                raise NativeReadCustodyRequired("NATIVE_RUNTIME_NOT_DRAINED") from None

    async def _close_pool(self, pool):
        key = id(pool)
        original = self._pool_close_tasks.get(key)
        # Only an explicit cleanup retry, after the original operation actually
        # ended in an error, may repeat idempotent local Pool.close(). _retire
        # has freshly proved SDK and physical listener drain first. Pending or
        # cancelled operations are never replaced and this is not SDK replay.
        failed = (original is not None and original.done() and not original.cancelled()
                  and original.exception() is not None)
        if original is None or failed:
            async def finish():
                await _result(pool.close())
            self._pool_close_tasks[key] = _owned_task(finish(), name="native-read-pool-close")
            self._pool_close_history.append(self._pool_close_tasks[key])
        # Retain and observe the SAME close operation after cancellation; never
        # terminate(), abort() or start a competing close for an uncertain task.
        await asyncio.shield(self._pool_close_tasks[key])
        try:
            size = pool.get_size()
        except Exception:
            raise NativeReadLifecycleError("NATIVE_POOL_STATE_UNAVAILABLE") from None
        _require(type(size) is int and size >= 0, "NATIVE_POOL_STATE_UNAVAILABLE")
        _require(size == 0, "NATIVE_POOL_NOT_CLOSED")

    async def _retire(self):
        if self.closed:
            return
        self.begin_draining()
        self._assert_drained()
        if self.server is not None:
            _require(self.handlers is not None, "NATIVE_HANDLER_CUSTODY_REQUIRED")
            self.helpers.server_transport_count(self.server)
            # No suspension between logical drain, disabling handlers and
            # closing admission. Physical closure still requires all readbacks.
            self.handlers.accepting = False
            self.server.close()
            await self.helpers.close_listener(self.server, self.deadline)
            await self.handlers.drain(server=self.server)
            _require(self.helpers.server_transport_count(self.server) == 0,
                     "NATIVE_SERVER_NOT_DRAINED")
            self._assert_drained()
        for pool in (self.control_pool, self.source_pool):
            if pool is not None:
                await self._close_pool(pool)
        self.closed = True

    async def close(self):
        """Retry exact retained cleanup, never infer terminal from a deadline."""
        if self.closed:
            return
        self.begin_draining()
        if self._close_task is None or self._close_task.done():
            self._close_task = _owned_task(self._close(), name="native-read-cleanup")
        await asyncio.shield(self._close_task)

    async def _close(self):
        if self._start_task is not None:
            try:
                await asyncio.shield(self._start_task)
            except asyncio.CancelledError:
                # External process/task cancellation is not proof that the
                # resource-producing setup finished. Never race its pools.
                if not self._start_task.done():
                    raise
            except BaseException:
                # Setup has ended and retained its resources. Recheck actual
                # custody, not the setup exception/timeout, before cleanup.
                pass
        await self._retire()

    async def drain(self):
        await self.close()
