"""TEST_ONLY finite native READ lifecycle; not connected authority evidence.

Pools, runtime/provider, attempts and status/resolve below are explicit doubles.
Two cases additionally exercise actual CPython loopback TLS/socket cleanup using
the already-qualified generated-certificate fixture, never operational trust,
Core, DB, identity, grants, receipts or ACKs. No existing listener is consumed.
Tests must run only in the parent-owned isolated reservation/network namespace.
"""
import asyncio
from contextlib import asynccontextmanager, ExitStack
import sys
from types import SimpleNamespace
import unittest

import identity_operator as operator
import test_identity_operator as operator_tests

_PM_MODULES_BEFORE = {name for name in sys.modules if name == "services" or name.startswith("services.")}
import native_read_lifecycle as lifecycle
_PM_MODULES_AFTER = {name for name in sys.modules if name == "services" or name.startswith("services.")}


@asynccontextmanager
async def deadline(seconds):
    """Real test-local timer, not a modeled source/SDK transaction deadline."""
    task, expired = asyncio.current_task(), False
    def expire():
        nonlocal expired
        expired = True
        task.cancel()
    handle = asyncio.get_running_loop().call_later(seconds, expire)
    try:
        yield
    except asyncio.CancelledError:
        if expired:
            raise asyncio.TimeoutError() from None
        raise
    finally:
        handle.cancel()


async def until(predicate):
    async def observe():
        while not predicate():
            await asyncio.sleep(0.005)
    await asyncio.wait_for(observe(), 2)


class TEST_ONLY_Pool:
    """No connection/SQL implementation; only explicit cleanup state."""
    def __init__(self, name, events):
        self.name, self.events = name, events
        self.closed, self.close_calls, self.close_failures = False, 0, 0
        self.close_entered, self.close_release = asyncio.Event(), None
        self.size_override, self.size_error = None, None

    async def close(self):
        self.close_calls += 1
        self.events.append(self.name + ".close")
        self.close_entered.set()
        if self.close_release is not None:
            await self.close_release.wait()
        if self.close_failures:
            self.close_failures -= 1
            raise OSError("TEST_ONLY completed local pool-close failure")
        self.closed = True

    def is_closing(self):
        return self.closed

    def get_size(self):
        if self.size_error is not None:
            raise self.size_error
        if self.size_override is not None:
            return self.size_override
        return 0 if self.closed else 1


class TEST_ONLY_Server:
    def __init__(self, events):
        self.events, self.serving, self._active_count = events, True, 0

    def is_serving(self):
        return self.serving

    def close(self):
        self.events.append("server.close")
        self.serving = False

    async def wait_closed(self):
        self.events.append("server.wait_closed")


class TEST_ONLY_Runtime:
    def __init__(self, events):
        self.events = events
        self.unresolved, self.draining = False, False
        self.original_attempt = object()
        self.listener = SimpleNamespace(active=0, _handle=self.handle)
        self.provider = SimpleNamespace(begin_draining=self.begin_draining, issue=self.issue,
            status=self.status, resolve=self.resolve)
        self.server = TEST_ONLY_Server(events)
        self.start_entered, self.start_release = asyncio.Event(), None
        self.start_failure, self.start_override = None, None

    async def handle(self, *_):
        raise AssertionError("TEST_ONLY unexpected socket")

    def begin_draining(self):
        self.events.append("provider.begin_draining")
        self.draining = True

    def issue(self):
        if self.draining:
            raise ValueError("TEST_ONLY new ISSUE denied while draining")
        return "TEST_ONLY admitted without real authority"

    def status(self, attempt):
        if attempt is not self.original_attempt:
            raise ValueError("TEST_ONLY changed attempt")
        return dict(attempt=attempt, state="UNKNOWN" if self.unresolved else "TEST_ONLY_SETTLED")

    def resolve(self, attempt):
        # Deliberate in-memory fixture transition, NOT a Core receipt or ACK.
        self.status(attempt)
        self.unresolved = False

    def assert_drained(self):
        self.events.append("runtime.assert_drained")
        if self.unresolved:
            raise ValueError("TEST_ONLY unresolved obligation")

    async def start(self, *, host, port):
        self.events.append("runtime.start")
        self.start_entered.set()
        if self.start_release is not None:
            await self.start_release.wait()
        if self.start_failure is not None:
            raise ValueError("TEST_ONLY " + self.start_failure)
        if self.start_override is not None:
            self.server = await self.start_override(host=host, port=port)
        return self.server


class TEST_ONLY_Fixture:
    def __init__(self, test, *, failure=None, tracker_factory=None):
        self.test, self.failure = test, failure
        self.events, self.factory_calls = [], dict(source=0, control=0, runtime=0)
        self.source = TEST_ONLY_Pool("source", self.events)
        self.control = TEST_ONLY_Pool("control", self.events)
        self.runtime = TEST_ONLY_Runtime(self.events)
        self.source_entered, self.runtime_entered = asyncio.Event(), asyncio.Event()
        self.source_release, self.runtime_release = None, None
        self.life = lifecycle.NativeReadLifecycle(deadline=deadline, helpers=operator,
            tracker_factory=tracker_factory)
        self.arguments = dict(source_pool_factory=self.source_factory,
            control_pool_factory=self.control_factory, runtime_factory=self.runtime_factory,
            host="127.0.0.1", port=0)
        test.addAsyncCleanup(self.dispose_doubles)

    async def source_factory(self):
        self.factory_calls["source"] += 1
        self.source_entered.set()
        if self.source_release is not None:
            await self.source_release.wait()
        if self.failure == "source":
            raise ValueError("TEST_ONLY source setup")
        return self.source

    async def control_factory(self):
        self.factory_calls["control"] += 1
        if self.failure == "control":
            raise ValueError("TEST_ONLY control setup")
        return self.control

    async def runtime_factory(self, *, source_pool, control_pool):
        self.factory_calls["runtime"] += 1
        self.runtime_entered.set()
        if self.runtime_release is not None:
            await self.runtime_release.wait()
        self.test.assertIs(source_pool, self.source)
        self.test.assertIs(control_pool, self.control)
        if self.failure == "runtime":
            raise ValueError("TEST_ONLY runtime setup")
        return self.runtime

    async def start(self, **changes):
        return await self.life.start(**dict(self.arguments, **changes))

    async def dispose_doubles(self):
        # Test-only recovery: never change an SDK object, actual attempt, socket
        # count or production custody. Any real TLS endpoints are closed by the
        # separate generated loopback fixture before this cleanup runs.
        for gate in (self.source_release, self.runtime_release,
                self.runtime.start_release, self.source.close_release, self.control.close_release):
            if gate is not None:
                gate.set()
        self.runtime.unresolved = False
        self.runtime.listener.active = 0
        if isinstance(self.runtime.server, TEST_ONLY_Server):
            self.runtime.server._active_count = 0
        for pool in (self.source, self.control):
            pool.size_error, pool.size_override = None, None
            pool.get_size = TEST_ONLY_Pool.get_size.__get__(pool)
        await asyncio.wait_for(self.life.close(), 2)


@asynccontextmanager
async def loopback_fixture():
    # Reuse generated cert/TLS/cleanup machinery without importing a TestCase
    # class into this module or inheriting its tests (no duplicate test count).
    fixture = operator_tests.OperatorLoopbackTLSTests(
        "test_real_tls_incomplete_handshake_stays_counted_after_listener_close")
    # This is fixture reuse inside the caller's already-running loop, not a
    # nested TestCase.run(). Its unittest async runner is deliberately absent;
    # register the existing synchronous cleanup callbacks directly instead.
    cleanups = ExitStack()
    fixture.addCleanup = cleanups.callback
    initialized = False
    try:
        await fixture.asyncSetUp()
        initialized = True
        yield fixture
    finally:
        try:
            if initialized:
                await fixture.asyncTearDown()
        finally:
            cleanups.close()
            directory = getattr(fixture, "cert_directory", None)
            if directory is not None and directory.exists():
                raise AssertionError("TEST_ONLY_LOOPBACK_CLEANUP_INCOMPLETE")


class NativeReadLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def test_module_import_does_not_load_pm_sdk(self):
        self.assertEqual(_PM_MODULES_AFTER, _PM_MODULES_BEFORE)

    async def test_async_factories_ready_then_exact_idempotent_cleanup(self):
        f = TEST_ONLY_Fixture(self)
        ready = []
        async def callback(actual):
            self.assertIs(actual, f.life)
            ready.append(actual.server)
        self.assertIs(await f.start(ready_callback=callback), f.life)
        self.assertEqual(ready, [f.runtime.server])
        self.assertFalse(f.life.closed)
        await f.life.close()
        await f.life.close()
        self.assertTrue(f.life.closed)
        self.assertEqual(f.source.close_calls, 1)
        self.assertEqual(f.control.close_calls, 1)
        self.assertFalse(f.runtime.server.is_serving())

    async def test_sync_pool_runtime_and_ready_factories_are_supported(self):
        f = TEST_ONLY_Fixture(self)
        ready = []
        await f.start(source_pool_factory=lambda: f.source, control_pool_factory=lambda: f.control,
            runtime_factory=lambda **_: f.runtime, ready_callback=lambda actual: ready.append(actual))
        self.assertEqual(ready, [f.life])
        await f.life.close()
        self.assertTrue(f.life.closed)

    async def test_source_control_runtime_setup_failures_cleanup_only_allocated_pools(self):
        for failure, source_closed, control_closed in (
                ("source", False, False), ("control", True, False), ("runtime", True, True)):
            with self.subTest(failure=failure):
                f = TEST_ONLY_Fixture(self, failure=failure)
                with self.assertRaisesRegex(ValueError, "TEST_ONLY"):
                    await f.start()
                self.assertEqual(f.source.closed, source_closed)
                self.assertEqual(f.control.closed, control_closed)
                self.assertTrue(f.life.closed)

    async def test_tracker_setup_failure_closes_both_owned_pools(self):
        def bad_tracker(*_):
            raise ValueError("TEST_ONLY tracker setup")
        f = TEST_ONLY_Fixture(self, tracker_factory=bad_tracker)
        with self.assertRaisesRegex(ValueError, "TEST_ONLY tracker"):
            await f.start()
        self.assertTrue(f.source.closed and f.control.closed)
        self.assertTrue(f.life.closed)

    async def test_preflight_and_bind_failure_preserve_original_error_after_cleanup(self):
        for failure in ("preflight", "bind"):
            with self.subTest(failure=failure):
                f = TEST_ONLY_Fixture(self)
                f.runtime.start_failure = failure
                with self.assertRaisesRegex(ValueError, "TEST_ONLY " + failure):
                    await f.start()
                self.assertTrue(f.source.closed and f.control.closed)
                self.assertTrue(f.life.closed)

    async def test_throwing_ready_callback_cleans_listener_and_pools(self):
        f = TEST_ONLY_Fixture(self)
        def refuse(_):
            raise ValueError("TEST_ONLY ready output lost")
        with self.assertRaisesRegex(ValueError, "TEST_ONLY ready"):
            await f.start(ready_callback=refuse)
        self.assertTrue(f.life.closed)
        self.assertTrue(f.source.closed and f.control.closed)
        self.assertFalse(f.runtime.server.is_serving())

    async def test_false_ready_callback_is_not_acknowledgement(self):
        f = TEST_ONLY_Fixture(self)
        with self.assertRaisesRegex(lifecycle.NativeReadLifecycleError, "NATIVE_READY_NOT_ACKNOWLEDGED"):
            await f.start(ready_callback=lambda _: False)
        self.assertTrue(f.life.closed)

    async def test_not_serving_listener_never_delivers_ready(self):
        f = TEST_ONLY_Fixture(self)
        f.runtime.server.serving = False
        ready = []
        with self.assertRaises(Exception):
            await f.start(ready_callback=lambda _: ready.append(True))
        self.assertEqual(ready, [])
        self.assertTrue(f.life.closed)

    async def test_repeated_start_observes_original_factories_without_reallocation(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        await f.start()
        self.assertEqual(f.factory_calls, dict(source=1, control=1, runtime=1))

    async def test_cached_start_after_complete_close_is_refused_not_ready(self):
        f = TEST_ONLY_Fixture(self)
        ready = []
        f.arguments["ready_callback"] = lambda actual: ready.append(actual)
        await f.start()
        await f.life.close()
        with self.assertRaisesRegex(lifecycle.NativeReadLifecycleError, "NATIVE_LIFECYCLE_START_REFUSED"):
            await f.start()
        self.assertEqual(ready, [f.life])
        self.assertEqual(f.factory_calls, dict(source=1, control=1, runtime=1))
        self.assertTrue(f.life.closed and f.source.closed and f.control.closed)
        self.assertFalse(f.runtime.server.is_serving())

    async def test_cached_start_while_original_cleanup_is_inflight_is_refused(self):
        f = TEST_ONLY_Fixture(self)
        ready = []
        f.arguments["ready_callback"] = lambda actual: ready.append(actual)
        await f.start()
        f.source.close_release = asyncio.Event()
        close = asyncio.create_task(f.life.close())
        try:
            await asyncio.wait_for(f.source.close_entered.wait(), 1)
            self.assertFalse(close.done() or f.life.closed)
            with self.assertRaisesRegex(lifecycle.NativeReadLifecycleError, "NATIVE_LIFECYCLE_START_REFUSED"):
                await f.start()
            self.assertEqual(ready, [f.life])
            self.assertEqual(f.factory_calls, dict(source=1, control=1, runtime=1))
            self.assertEqual(f.source.close_calls, 1)
        finally:
            f.source.close_release.set()
            await asyncio.wait_for(close, 2)
        self.assertTrue(f.life.closed)

    async def test_cancelled_source_factory_result_remains_owned_until_same_setup_finishes(self):
        f = TEST_ONLY_Fixture(self)
        f.source_release = asyncio.Event()
        start = asyncio.create_task(f.start())
        await asyncio.wait_for(f.source_entered.wait(), 1)
        start.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await start
        self.assertFalse(f.life._start_task.done())
        close = asyncio.create_task(f.life.close())
        await asyncio.sleep(0)
        self.assertFalse(close.done())
        f.source_release.set()
        await asyncio.wait_for(close, 2)
        self.assertIs(f.life.source_pool, f.source)
        self.assertTrue(f.source.closed and f.control.closed)
        self.assertEqual(f.factory_calls, dict(source=1, control=1, runtime=1))
        self.assertTrue(f.runtime.draining)
        with self.assertRaisesRegex(ValueError, "new ISSUE denied"):
            f.runtime.provider.issue()
        self.assertIs(f.runtime.provider.status(f.runtime.original_attempt)["attempt"],
            f.runtime.original_attempt)

    async def test_awaitable_pool_is_owned_before_its_initialization_finishes(self):
        f = TEST_ONLY_Fixture(self)
        entered, release = asyncio.Event(), asyncio.Event()
        class TEST_ONLY_AwaitablePool(TEST_ONLY_Pool):
            def __await__(self):
                async def initialize():
                    entered.set()
                    await release.wait()
                    return self
                return initialize().__await__()
        pool = TEST_ONLY_AwaitablePool("awaitable-source", f.events)
        f.source = pool
        f.arguments["source_pool_factory"] = lambda: pool
        self.addCleanup(release.set)
        start = asyncio.create_task(f.start())
        await asyncio.wait_for(entered.wait(), 1)
        self.assertIs(f.life.source_pool, pool)
        start.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await start
        self.assertFalse(f.life._start_task.done())
        close = asyncio.create_task(f.life.close())
        await asyncio.sleep(0)
        self.assertFalse(close.done())
        self.assertEqual(pool.close_calls, 0)
        release.set()
        await asyncio.wait_for(close, 2)
        self.assertEqual(pool.close_calls, 1)
        self.assertTrue(f.life.closed)

    async def test_awaitable_pool_cannot_replace_the_already_owned_resource(self):
        f = TEST_ONLY_Fixture(self)
        class TEST_ONLY_ChangingPool(TEST_ONLY_Pool):
            def __await__(self):
                async def initialize():
                    return f.control
                return initialize().__await__()
        pool = TEST_ONLY_ChangingPool("changing-source", f.events)
        f.source = pool
        f.arguments["source_pool_factory"] = lambda: pool
        with self.assertRaisesRegex(lifecycle.NativeReadLifecycleError, "NATIVE_POOL_FACTORY_CHANGED_RESOURCE"):
            await f.start()
        self.assertIs(f.life.source_pool, pool)
        self.assertEqual(pool.close_calls, 1)
        self.assertFalse(f.control.closed)
        self.assertTrue(f.life.closed)

    async def test_lost_start_caller_does_not_log_unobserved_setup_exception(self):
        f = TEST_ONLY_Fixture(self, failure="source")
        f.source_release = asyncio.Event()
        loop, unexpected = asyncio.get_running_loop(), []
        previous = loop.get_exception_handler()
        loop.set_exception_handler(lambda _loop, context: unexpected.append(context.get("message")))
        try:
            start = asyncio.create_task(f.start())
            await asyncio.wait_for(f.source_entered.wait(), 1)
            start.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await start
            f.source_release.set()
            await until(lambda: f.life._start_task.done())
            await asyncio.sleep(0)
            self.assertEqual(unexpected, [])
            await f.life.close()
        finally:
            loop.set_exception_handler(previous)

    async def test_cancelled_runtime_factory_result_is_retained_not_recreated(self):
        f = TEST_ONLY_Fixture(self)
        f.runtime_release = asyncio.Event()
        start = asyncio.create_task(f.start())
        await asyncio.wait_for(f.runtime_entered.wait(), 1)
        start.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await start
        f.runtime_release.set()
        await f.start()
        self.assertIs(f.life.runtime, f.runtime)
        self.assertEqual(f.factory_calls, dict(source=1, control=1, runtime=1))
        self.assertTrue(f.runtime.draining)
        with self.assertRaisesRegex(ValueError, "new ISSUE denied"):
            f.runtime.provider.issue()
        self.assertIs(f.runtime.provider.status(f.runtime.original_attempt)["attempt"],
            f.runtime.original_attempt)

    async def test_cancelled_bind_retains_late_server_and_close_waits_original_start(self):
        f = TEST_ONLY_Fixture(self)
        f.runtime.start_release = asyncio.Event()
        start = asyncio.create_task(f.start())
        await asyncio.wait_for(f.runtime.start_entered.wait(), 1)
        start.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await start
        close = asyncio.create_task(f.life.close())
        await asyncio.sleep(0)
        self.assertFalse(close.done())
        self.assertTrue(f.runtime.draining)
        self.assertFalse(f.source.closed or f.control.closed)
        f.runtime.start_release.set()
        await asyncio.wait_for(close, 2)
        self.assertIs(f.life.server, f.runtime.server)
        self.assertTrue(f.life.closed)

    async def test_cancelled_pool_close_keeps_original_close_task_and_exact_pool(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        f.source.close_release = asyncio.Event()
        close = asyncio.create_task(f.life.close())
        await asyncio.wait_for(f.source.close_entered.wait(), 1)
        close.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await close
        self.assertFalse(f.life._close_task.done())
        self.assertFalse(f.source.closed)
        self.assertFalse(f.life.closed)
        retry = asyncio.create_task(f.life.close())
        f.source.close_release.set()
        await asyncio.wait_for(retry, 2)
        self.assertEqual(f.source.close_calls, 1)
        self.assertEqual(f.control.close_calls, 1)
        self.assertTrue(f.life.closed)

    async def test_terminal_local_pool_close_failure_allows_one_explicit_same_pool_retry(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        f.source.close_failures = 1
        with self.assertRaisesRegex(OSError, "TEST_ONLY completed local pool-close failure"):
            await f.life.close()
        self.assertFalse(f.life.closed or f.source.closed)
        self.assertEqual(f.source.close_calls, 1)
        self.assertTrue(f.life._close_task.done())
        self.assertIs(f.life.source_pool, f.source)
        self.assertFalse(f.runtime.server.is_serving())
        await f.life.close()
        self.assertTrue(f.life.closed and f.source.closed)
        self.assertEqual(f.source.close_calls, 2)
        self.assertEqual(f.control.close_calls, 1)
        self.assertEqual(f.factory_calls, dict(source=1, control=1, runtime=1))

    async def test_unknown_retains_listener_pools_and_original_status_resolve(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        f.runtime.unresolved = True
        attempt = f.runtime.original_attempt
        with self.assertRaisesRegex(lifecycle.NativeReadCustodyRequired, "NATIVE_RUNTIME_NOT_DRAINED"):
            await f.life.close()
        self.assertTrue(f.runtime.draining)
        self.assertTrue(f.runtime.server.is_serving())
        self.assertTrue(f.life.handlers.accepting)
        self.assertFalse(f.source.closed or f.control.closed or f.life.closed)
        self.assertIs(f.runtime.provider.status(attempt)["attempt"], attempt)
        self.assertEqual(f.runtime.provider.status(attempt)["state"], "UNKNOWN")
        f.runtime.provider.resolve(attempt)
        await f.life.close()
        self.assertTrue(f.life.closed)

    async def test_ready_failure_with_unknown_does_not_teardown_custody(self):
        f = TEST_ONLY_Fixture(self)
        def fail_with_test_only_obligation(_):
            f.runtime.unresolved = True
            raise ValueError("TEST_ONLY ready failed while unresolved")
        with self.assertRaises(lifecycle.NativeReadCustodyRequired):
            await f.start(ready_callback=fail_with_test_only_obligation)
        self.assertTrue(f.runtime.server.is_serving())
        self.assertFalse(f.source.closed or f.control.closed)
        f.runtime.provider.resolve(f.runtime.original_attempt)
        await f.life.close()
        self.assertTrue(f.life.closed)

    async def test_nonzero_bool_negative_or_noninteger_pool_size_is_not_closed(self):
        for value in (1, True, -1, "0", 0.0, None):
            with self.subTest(value=value):
                f = TEST_ONLY_Fixture(self)
                await f.start()
                f.source.get_size = lambda: value
                with self.assertRaises(lifecycle.NativeReadLifecycleError):
                    await f.life.close()
                self.assertFalse(f.life.closed)
                f.source.get_size = TEST_ONLY_Pool.get_size.__get__(f.source)
                await f.life.close()
                self.assertTrue(f.life.closed)
                self.assertEqual(f.source.close_calls, 1)

    async def test_missing_pool_size_readback_fails_closed_then_exact_retry(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        f.source.get_size = None
        with self.assertRaisesRegex(lifecycle.NativeReadLifecycleError, "NATIVE_POOL_STATE_UNAVAILABLE"):
            await f.life.close()
        self.assertFalse(f.life.closed)
        f.source.get_size = TEST_ONLY_Pool.get_size.__get__(f.source)
        await f.life.close()
        self.assertTrue(f.life.closed)
        self.assertEqual(f.source.close_calls, 1)

    async def test_pool_readback_exception_is_not_an_empty_pool(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        f.source.size_error = OSError("TEST_ONLY no readback")
        with self.assertRaisesRegex(lifecycle.NativeReadLifecycleError, "NATIVE_POOL_STATE_UNAVAILABLE"):
            await f.life.close()
        self.assertFalse(f.life.closed)
        f.source.size_error = None
        await f.life.close()
        self.assertEqual(f.source.close_calls, 1)

    async def test_invalid_server_transport_count_prevents_pool_teardown(self):
        for value in (True, -1, "0"):
            with self.subTest(value=value):
                f = TEST_ONLY_Fixture(self)
                await f.start()
                f.runtime.server._active_count = value
                with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_SERVER_TRANSPORT_STATE_UNAVAILABLE"):
                    await f.life.close()
                self.assertFalse(f.source.closed or f.control.closed or f.life.closed)
                f.runtime.server._active_count = 0
                await f.life.close()

    async def test_missing_server_transport_count_is_not_zero(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        del f.runtime.server._active_count
        with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_SERVER_TRANSPORT_STATE_UNAVAILABLE"):
            await f.life.close()
        self.assertFalse(f.source.closed or f.control.closed)
        f.runtime.server._active_count = 0
        await f.life.close()

    async def test_invalid_sdk_active_count_prevents_pool_teardown(self):
        f = TEST_ONLY_Fixture(self)
        await f.start()
        f.runtime.listener.active = True
        with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_ACTIVE_STATE_UNAVAILABLE"):
            await f.life.close()
        self.assertFalse(f.source.closed or f.control.closed)
        f.runtime.listener.active = 0
        await f.life.close()

    async def test_real_tls_prehandler_handshake_blocks_lifecycle_close_until_detach(self):
        f = TEST_ONLY_Fixture(self)
        async with loopback_fixture() as tls:
            tls.allowed_transport_errors = {"ConnectionResetError"}
            f.runtime.start_override = lambda **scope: asyncio.start_server(
                f.runtime.listener._handle, ssl=tls.server_tls, ssl_handshake_timeout=2, **scope)
            await f.start()
            tls.server, tls.handlers = f.life.server, f.life.handlers
            port = tls.server.sockets[0].getsockname()[1]
            _reader, client = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", port), 1)
            tls.writers.append(client)
            await until(lambda: operator.server_transport_count(tls.server) == 1)
            self.assertFalse(f.life.handlers.tasks)
            self.assertFalse(f.life.handlers.sockets)
            close = asyncio.create_task(f.life.close())
            try:
                with self.assertRaises(asyncio.TimeoutError):
                    await asyncio.wait_for(asyncio.shield(close), 0.08)
                self.assertFalse(f.source.closed or f.control.closed or f.life.closed)
                client.close()
                await asyncio.wait_for(client.wait_closed(), 1)
                await until(lambda: operator.server_transport_count(tls.server) == 0)
                await asyncio.wait_for(close, 2)
                self.assertTrue(f.life.closed)
            finally:
                client.close()
                await asyncio.wait_for(client.wait_closed(), 1)
                await asyncio.wait_for(f.life.close(), 2)
                await asyncio.gather(close, return_exceptions=True)

    async def test_real_tls_returned_handler_socket_blocks_pool_close_until_physical_close(self):
        f = TEST_ONLY_Fixture(self)
        async with loopback_fixture() as tls:
            returned, sockets = asyncio.Event(), []
            async def keep_socket_open(_reader, writer):
                tls.writers.append(writer)
                sockets.append(writer.get_extra_info("socket"))
                returned.set()
            f.runtime.listener._handle = keep_socket_open
            f.runtime.start_override = lambda **scope: asyncio.start_server(
                f.runtime.listener._handle, ssl=tls.server_tls, ssl_handshake_timeout=2, **scope)
            await f.start()
            tls.server, tls.handlers = f.life.server, f.life.handlers
            port = tls.server.sockets[0].getsockname()[1]
            _reader, client = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", port,
                ssl=tls.client_tls, server_hostname="127.0.0.1", ssl_handshake_timeout=2), 2)
            tls.writers.append(client)
            await asyncio.wait_for(returned.wait(), 1)
            await until(lambda: not f.life.handlers.tasks)
            source_socket = sockets[0]
            self.assertGreaterEqual(source_socket.fileno(), 0)
            self.assertIn(source_socket, f.life.handlers.sockets)
            close = asyncio.create_task(f.life.close())
            try:
                with self.assertRaises(asyncio.TimeoutError):
                    await asyncio.wait_for(asyncio.shield(close), 0.08)
                self.assertFalse(f.source.closed or f.control.closed or f.life.closed)
                for writer in tls.writers:
                    writer.close()
                await asyncio.wait_for(asyncio.gather(*(writer.wait_closed() for writer in tls.writers)), 1)
                await until(lambda: source_socket.fileno() == -1
                    and operator.server_transport_count(tls.server) == 0)
                await asyncio.wait_for(close, 2)
                self.assertTrue(f.source.closed and f.control.closed and f.life.closed)
            finally:
                for writer in tls.writers:
                    writer.close()
                await asyncio.wait_for(asyncio.gather(*(writer.wait_closed() for writer in tls.writers)), 1)
                await asyncio.wait_for(f.life.close(), 2)
                await asyncio.gather(close, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
